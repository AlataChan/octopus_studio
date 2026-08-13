"use strict";

const { createPlan } = require("./planner");
const { buildRunEmployeeMastraTool } = require("./runEmployeeMastraTool");
const { createApprovalBroker: _defaultCreateApprovalBroker } = require("./approvalBroker");
const { renderRecitation, writePlanFile } = require("./planRecitation");
const { withSpan } = require("../../observability/otel");
const { buildGuardrailPipeline } = require("../guardrails/buildPipeline");
const {
  applyReadOnlyAudit,
  auditReadOnly,
  shouldRetryReview,
} = require("./swarmPolicy");
const {
  COMPLETE_STATUSES,
  createInitialStepStates,
  deriveCursor,
  isSwarmOrchestrationEnabled,
  normalizeRecord,
  claimStep,
  commitWithRebase,
  reconcileStale,
} = require("./orchestrationRunState");
const { commitStep, snapshotContext } = require("./sharedContext");

const RUN_REVIEW_LIMIT = 3;
const REVIEW_RESPONSE_KEYS = ["feedback", "pass"];

// ── guardrail helpers ────────────────────────────────────────────────────────

/**
 * Summarize guardrail findings as a sanitized count summary.
 * NEVER includes raw matched content — only type+count pairs.
 *
 * @param {Array<{type:string, count:number}>} findings
 * @returns {string}  e.g. "2 处 email、1 处 injection"
 */
function summarizeFindings(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return "";
  // Aggregate counts by type
  const map = {};
  for (const f of findings) {
    const t = String(f.type || "unknown");
    map[t] = (map[t] || 0) + (f.count || 1);
  }
  return Object.entries(map)
    .map(([type, count]) => `${count} 处 ${type}`)
    .join("、");
}

/**
 * Build the default guardrail pipeline used by TeamOrchestrationService.
 *
 * Input pipeline: PII detect-only (piiRedact=false) + injection flag-only (injectionBlock=false)
 * Output pipeline: PII redaction enabled (redact=true via constructor default)
 *
 * Both processors respect runtime config overrides if passed via context.config,
 * but the conservative defaults ensure no false positives out of the box.
 */
function defaultGuardrailPipeline() {
  return buildGuardrailPipeline({
    inputRedact: false,
    blockInjection: false,
    outputRedact: true,
  });
}

// ── small helpers ────────────────────────────────────────────────────────────

/**
 * Resolve a human-readable label for an employee by assistantId.
 * Falls back to the raw assistantId if no name/title found.
 */
function labelOf(employees, assistantId) {
  const emp = (employees || []).find((e) => e.assistantId === assistantId);
  if (!emp) return assistantId;
  return emp.name || emp.title || assistantId;
}

/**
 * Dedup an array of source objects by their `id` field.
 * Sources without an `id` are kept as-is (not deduplicated).
 */
function dedupById(sources) {
  const seen = new Set();
  return sources.filter((s) => {
    if (!s || s.id == null) return true;
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function recitationEnabled(env = process.env) {
  return String(env.TEAM_RECITATION_ENABLED || "").toLowerCase() === "true";
}

async function trajectoryMemoryEnabled() {
  try {
    const prisma = require("../../prisma");
    const setting = await prisma.system_settings.findFirst({
      where: { label: "trajectory_memory_enabled" },
    });
    return setting?.value === "true";
  } catch (error) {
    return false;
  }
}

async function resolveMultiUserMode() {
  const { SystemSettings } = require("../../../models/systemSettings");
  return await SystemSettings.isMultiUserMode();
}

async function buildPastTrajectoriesBlock({
  workspaceId,
  user,
  canonicalGoal,
  multiUserMode,
}) {
  const {
    resolveTrajectoryScope,
    retrieveSimilar,
    renderTrajectoryBlock,
  } = require("../trajectoryMemory");
  const { logTrajectoryMemoryWarn } = require("../trajectoryMemory/settings");

  const scope = resolveTrajectoryScope({
    workspaceId,
    userId: user?.id ?? null,
    multiUserMode,
  });
  if (!scope.ok) {
    await logTrajectoryMemoryWarn(
      "trajectory_memory_scope_unresolvable",
      { workspaceId: Number(workspaceId), phase: "read", reason: scope.reason },
      user?.id ?? null
    );
    return "";
  }

  const records = await retrieveSimilar({
    scope,
    workspaceId,
    canonicalGoal,
    topK: 3,
  });
  return renderTrajectoryBlock(records);
}

async function defaultResolveModelOverride({ step } = {}) {
  try {
    const { SystemSettings } = require("../../../models/systemSettings");
    const {
      TIER_ROUTING_ENABLED_LABEL,
      TIER_MAP_LABEL,
      validateTierMap,
    } = require("../../AiProviders/providerRouter/tierRouter");
    const {
      scoreComplexity,
    } = require("../../AiProviders/providerRouter/complexity");

    const enabled = await SystemSettings.getValueOrFallback(
      { label: TIER_ROUTING_ENABLED_LABEL },
      "false"
    );
    if (String(enabled || "").toLowerCase() !== "true") return null;

    const rawMap = await SystemSettings.getValueOrFallback(
      { label: TIER_MAP_LABEL },
      "{}"
    );
    const validation = validateTierMap(rawMap, { mode: "employee" });
    if (!validation.ok) return null;

    const complexity = scoreComplexity({ message: step?.subtask || "" });
    const route = validation.map[complexity.tier];
    if (!route) return null;
    return {
      provider: route.provider,
      model: route.model,
      tier: complexity.tier,
      score: complexity.score,
    };
  } catch (_) {
    return null;
  }
}

async function defaultAuditStepReadOnly({
  workspace,
  user,
  step,
  service,
  log = () => {},
}) {
  try {
    const AIbitat = require("../aibitat");
    const { AgentRuntimeFactory } = require("../runtime/agentRuntimeFactory");
    const { attachAgentPlugins } = require("../runtime/attachAgentPlugins");
    const { USER_AGENT, WORKSPACE_AGENT } = require("../defaults");

    const runtimeFactory = service?._AgentRuntimeFactory || AgentRuntimeFactory;
    const attachPlugins = service?._attachAgentPlugins || attachAgentPlugins;
    const createAibitat =
      service?._createAibitat || ((opts) => new AIbitat(opts));
    const { provider, model } = runtimeFactory.resolveProviderModel({
      workspace,
    });
    if (!provider) return { readOnly: false, reason: "no_provider" };

    const aibitat = createAibitat({
      provider,
      model,
      chats: [],
      handlerProps: { workspace, user, workspaceId: workspace.id, log },
    });
    const plan = await runtimeFactory.assemble({
      workspace,
      user,
      assistantId: step.assistantId,
      workspaceId: workspace.id,
      invocationMetadata: {},
      provider,
      log,
    });
    aibitat.setPermissionConfig(plan.permissionConfig);
    aibitat.agent(USER_AGENT.name, plan.userAgentDef);
    aibitat.agent(WORKSPACE_AGENT.name, plan.workspaceAgentDef);
    await attachPlugins({
      aibitat,
      funcsToLoad: Array.isArray(plan.funcsToLoad) ? plan.funcsToLoad : [],
      args: { handler: { emit: () => {} } },
      log,
    });
    return auditReadOnly({ step, functions: aibitat.functions });
  } catch (error) {
    return {
      readOnly: false,
      reason: "audit_failed",
      error: error?.message || String(error),
    };
  }
}

// ── defaultRunStore ──────────────────────────────────────────────────────────

/**
 * Default persistent runStore backed by the Run model + prisma.
 * NOTE: Run has no updateMetadata, so metadata updates go directly via
 * prisma.runs.update. This is intentional and noted in the report.
 */
function defaultRunStore() {
  const { Run } = require("../../../models/run");
  const prisma = require("../../prisma");
  return {
    async create({
      workspaceId,
      threadId,
      goal,
      plan,
      parentRunId,
      user = null,
      trajectoryMemoryEnabled: tmEnabled = false,
      multiUserMode = false,
      executionVersion = null,
      executionMode = null,
      stepStates = null,
      sharedContext = null,
    }) {
      const metadata = {
        kind: "team_orchestration",
        goal,
        plan,
        cursor: 0,
        accumulatedContext: "",
        status: "running",
        parentRunId: parentRunId ?? null,
      };

      if (executionVersion === 2) {
        metadata.executionVersion = 2;
        metadata.executionMode = executionMode || "serial";
        metadata.planRevision = 1;
        metadata.stepStates =
          Array.isArray(stepStates) && stepStates.length
            ? stepStates
            : createInitialStepStates(plan || []);
        metadata.sharedContext = sharedContext || {};
        metadata.cumulativeCost = 0;
        metadata.reviewCount = 0;
        metadata.cursor = deriveCursor(metadata.stepStates);
      }

      if (tmEnabled) {
        const { resolveTrajectoryScope } = require("../trajectoryMemory");
        const { logTrajectoryMemoryWarn } = require("../trajectoryMemory/settings");
        const scope = resolveTrajectoryScope({
          workspaceId,
          userId: user?.id ?? null,
          multiUserMode,
        });
        if (scope.ok) {
          metadata.trajectoryScopeKey = scope.scopeKey;
          metadata.trajectoryNamespace = scope.namespace;
          metadata.trajectoryUserId = user?.id ?? null;
          metadata.canonicalGoal = String(goal || "").slice(0, 2000);
        } else {
          metadata.trajectoryScope = null;
          await logTrajectoryMemoryWarn(
            "trajectory_memory_scope_unresolvable",
            {
              workspaceId: Number(workspaceId),
              phase: "write",
              reason: scope.reason,
            },
            user?.id ?? null
          );
        }
      }

      const run = await Run.create({
        threadId: threadId ?? null,
        workspaceId,
        triggerType: Run.TRIGGER.UI,
        triggerId: null,
        engine: "mastra",
        metadata,
      });
      await Run.updateStatus(run.id, Run.STATUS.RUNNING);
      return run.id;
    },
    async update(runId, patch) {
      const run = await Run.getById(runId);
      const meta = (() => {
        try {
          return JSON.parse(run.metadata || "{}");
        } catch (_) {
          return {};
        }
      })();
      const next = { ...meta, ...patch };
      await prisma.runs.update({
        where: { id: runId },
        data: { metadata: JSON.stringify(next) },
      });
    },
    async casUpdate(runId, expectedStateVersion, nextMetadata) {
      const result = await prisma.runs.updateMany({
        where: { id: runId, stateVersion: expectedStateVersion },
        data: {
          stateVersion: expectedStateVersion + 1,
          metadata: JSON.stringify(nextMetadata),
        },
      });
      if (result.count !== 1) return { ok: false, conflict: true };
      return { ok: true, stateVersion: expectedStateVersion + 1 };
    },
    async finalize(runId, status) {
      const s =
        status === "done"
          ? Run.STATUS.SUCCEEDED
          : status === "cancelled"
          ? Run.STATUS.CANCELLED
          : Run.STATUS.FAILED;
      await Run.updateStatus(runId, s);
    },
    async get(runId) {
      const run = await Run.getById(runId);
      let metadata = {};
      try {
        metadata =
          typeof run.metadata === "string"
            ? JSON.parse(run.metadata || "{}")
            : run.metadata || {};
      } catch (_) {
        metadata = {};
      }
      return {
        stateVersion: Number.isInteger(run.stateVersion)
          ? run.stateVersion
          : 0,
        metadata,
        ...metadata,
      };
    },
  };
}

// ── defaultEstimateStepCost ──────────────────────────────────────────────────

/**
 * Rough cost estimate based on text length.
 * Real usage-based cost tracking is deferred to Cap5.
 */
function defaultEstimateStepCost(step, result) {
  const t =
    (step?.subtask?.length || 0) + (result?.text?.length || 0);
  return t / 1000; // arbitrary unit; budget must use same unit
}

// ── TeamOrchestrationService ─────────────────────────────────────────────────

class TeamOrchestrationService {
  constructor(deps = {}) {
    this._createPlan = deps.createPlan || createPlan;
    this._buildRunEmployeeMastraTool =
      deps.buildRunEmployeeMastraTool || buildRunEmployeeMastraTool;
    this._runStore = deps.runStore || defaultRunStore();
    this._estimateStepCost =
      deps.estimateStepCost || defaultEstimateStepCost;
    // service instance (e.g. EmployeeRunService) to pass through to tool builder
    this._service = deps.service;
    // T6d: per-step approval broker factory + optional confirmation store
    this._createApprovalBroker = deps.createApprovalBroker || _defaultCreateApprovalBroker;
    this._confirmationStore = deps.confirmationStore || undefined; // undefined → broker uses its own default
    // Cap3-T2: guardrail pipeline (input: PII detect + injection flag; output: PII redact)
    this._guardrailPipeline = deps.guardrailPipeline || defaultGuardrailPipeline();
    this._auditStepReadOnly =
      deps.auditStepReadOnly || defaultAuditStepReadOnly;
    this._resolveModelOverride =
      deps.resolveModelOverride || defaultResolveModelOverride;
    this._now = deps.now || (() => Date.now());
  }

  async _prepareSwarmPlan({ steps, workspace, user }) {
    const readOnlyByIndex = new Map();
    for (let index = 0; index < steps.length; index++) {
      const audit = await this._auditStepReadOnly({
        workspace,
        user,
        step: steps[index],
        service: this._service,
      });
      readOnlyByIndex.set(index, audit?.readOnly === true);
    }
    return applyReadOnlyAudit(steps, readOnlyByIndex);
  }

  _executionModeFor(steps) {
    const counts = new Map();
    for (const step of steps || []) {
      if (!step?.group || step.readOnly !== true) continue;
      counts.set(step.group, (counts.get(step.group) || 0) + 1);
    }
    return [...counts.values()].some((count) => count > 1)
      ? "grouped"
      : "serial";
  }

  _nextExecutionUnit({ planSteps, metadata, startIndex }) {
    const states = metadata.stepStates || [];
    let index = startIndex;
    while (index < planSteps.length) {
      const state = states[index];
      if (COMPLETE_STATUSES.has(state?.status)) {
        index += 1;
        continue;
      }
      if (!state || state.status === "pending") break;
      return {
        blocked: true,
        index,
        status: state.status || "unknown_step_status",
        state,
      };
    }
    if (index >= planSteps.length) return null;

    const step = planSteps[index];
    const grouped =
      metadata.executionMode === "grouped" &&
      step?.group &&
      step.readOnly === true;
    if (!grouped) return [index];

    const indexes = [index];
    for (let i = index + 1; i < planSteps.length; i++) {
      const candidate = planSteps[i];
      const state = states[i];
      if (
        candidate?.group !== step.group ||
        candidate?.readOnly !== true ||
        state?.status !== "pending"
      ) {
        break;
      }
      indexes.push(i);
    }
    return indexes.slice(0, 3);
  }

  async _reserveReviewAttempt(orchestrationRunId) {
    return commitWithRebase({
      runStore: this._runStore,
      runId: orchestrationRunId,
      mutate: (metadata) => {
        const reviewCount = Number(metadata.reviewCount || 0);
        if (reviewCount >= RUN_REVIEW_LIMIT) {
          const error = new Error("run review limit reached");
          error.code = "review_limit_reached";
          throw error;
        }
        return {
          ...metadata,
          reviewCount: reviewCount + 1,
        };
      },
    }).catch((error) => ({
      ok: false,
      reason: error?.code || "review_reserve_failed",
    }));
  }

  async _runReviewer({ step, text, workspace, user, thread, signal, onEvent, readOnly }) {
    const reviewerTool = this._buildRunEmployeeMastraTool({
      workspace,
      user,
      parentRunId: null,
      depth: 0,
      maxDepth: 1,
      signal,
      onEvent,
      service: this._service,
      readOnly: true,
      modelOverride: null,
    });
    const review = await reviewerTool.execute({
      assistantId: step.reviewerAssistantId,
      task:
        "Review the previous result. Return strict JSON only: {\"pass\":boolean,\"feedback\":\"...\"}",
      context: JSON.stringify({
        subtask: step.subtask,
        result: text || "",
        threadId: thread?.id ?? null,
      }),
    });
    if (review?.error) return { pass: false, feedback: review.error.message || review.error.code || "review failed" };
    try {
      const parsed = JSON.parse(String(review?.text || "{}"));
      const keys = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.keys(parsed).sort()
        : [];
      if (
        keys.length !== REVIEW_RESPONSE_KEYS.length ||
        keys.some((key, index) => key !== REVIEW_RESPONSE_KEYS[index]) ||
        typeof parsed.pass !== "boolean" ||
        typeof parsed.feedback !== "string"
      ) {
        return { pass: false, feedback: "review output schema invalid" };
      }
      return {
        pass: parsed.pass,
        feedback: parsed.feedback,
      };
    } catch (_) {
      return { pass: false, feedback: "review output was not valid JSON" };
    }
  }

  async _executeV2Step({
    orchestrationRunId,
    index,
    step,
    context,
    workspace,
    user,
    thread,
    signal,
    onEvent,
    employees,
    allowReviewer,
  }) {
    const attemptId = `step-${index}-${this._now()}-${Math.round(Math.random() * 1e6)}`;
    const claim = await claimStep({
      runStore: this._runStore,
      runId: orchestrationRunId,
      index,
      attemptId,
      leaseMs: 5 * 60 * 1000,
      now: this._now(),
    });
    if (!claim.ok && COMPLETE_STATUSES.has(claim.status)) {
      return { skippedDone: true };
    }
    if (!claim.ok && claim.reason === "not_pending") {
      if (claim.status === "awaiting_approval") {
        const latestRecord = normalizeRecord(await this._runStore.get(orchestrationRunId));
        const latestState = latestRecord.metadata.stepStates?.[index] || {};
        return {
          suspended: true,
          confirmationId: latestState.confirmationId || null,
        };
      }
      if (claim.status === "needs_reconciliation") {
        return { blockedStatus: "needs_reconciliation", index };
      }
      return { claimConflict: true, reason: "not_pending", status: claim.status };
    }
    if (!claim.ok && claim.conflict) {
      return { claimConflict: true };
    }
    if (!claim.ok) {
      const code = claim.reason === "missing_step"
        ? "claim_missing_step"
        : "claim_failed";
      return {
        claimFailed: true,
        stepResult: {
          index,
          assistantId: step.assistantId,
          subtask: step.subtask,
          ok: false,
          text: null,
          error: {
            code,
            message: `Unable to claim step ${index}: ${claim.reason || "unknown"}`,
          },
        },
        sources: [],
        artifacts: [],
      };
    }

    const runOnce = async () => {
      const broker = this._createApprovalBroker({
        orchestrationRunId,
        stepId: index,
        workspaceId: workspace.id,
        userId: user?.id ?? null,
        threadId: thread?.id ?? null,
        onEvent,
        store: this._confirmationStore,
      });
      const modelOverride = await this._resolveModelOverride({
        step,
        workspace,
        user,
      });
      const tool = this._buildRunEmployeeMastraTool({
        workspace,
        user,
        parentRunId: orchestrationRunId,
        depth: 0,
        maxDepth: 1,
        signal,
        onEvent,
        service: this._service,
        approvalDelegate: broker,
        modelOverride,
        readOnly: step.readOnly === true,
      });
      return tool.execute({
        assistantId: step.assistantId,
        task: step.subtask,
        context,
      });
    };

    let res = await runOnce();
    if (res?.error?.code !== "approval_needed" && res?.error) {
      res = await runOnce();
    }

    if (res?.error?.code === "approval_needed") {
      await commitStep({
        runStore: this._runStore,
        runId: orchestrationRunId,
        stepUpdates: [
          {
            index,
            patch: {
              status: "awaiting_approval",
              confirmationId: res.error.confirmationId,
            },
          },
        ],
      });
      return {
        suspended: true,
        confirmationId: res.error.confirmationId,
      };
    }

    let ok = !res?.error;
    if (
      ok &&
      allowReviewer &&
      step.reviewerAssistantId
    ) {
      let latest = res;
      let passed = false;
      let attemptedReview = false;
      let reviewError = null;
      const mayRetryReviewedStep = shouldRetryReview(step);
      while (true) {
        const reviewSlot = await this._reserveReviewAttempt(orchestrationRunId);
        if (!reviewSlot.ok) {
          reviewError = {
            code: reviewSlot.reason || "review_reserve_failed",
            message: reviewSlot.reason === "review_limit_reached"
              ? "run review limit reached"
              : "unable to reserve review attempt",
          };
          break;
        }
        attemptedReview = true;
        const review = await this._runReviewer({
          step,
          text: latest?.text || "",
          workspace,
          user,
          thread,
          signal,
          onEvent,
          readOnly: true,
        });
        if (review.pass) {
          passed = true;
          break;
        }
        if (!mayRetryReviewedStep) break;
        latest = await runOnce();
        if (latest?.error) break;
      }
      res = latest || res;
      if (reviewError) {
        res = { ...(res || {}), error: reviewError };
        ok = false;
      } else if (attemptedReview) {
        ok = passed && !res?.error;
      }
    }

    const status = ok ? "done" : "failed";
    await commitStep({
      runStore: this._runStore,
      runId: orchestrationRunId,
      stepUpdates: [
        {
          index,
          patch: {
            status,
            attemptId: null,
            leaseUntil: null,
            resultRef: res?.runId || `step:${index}`,
          },
        },
      ],
      contextDeltas: ok && res?.text
        ? [{ index, delta: { [`step:${index}`]: String(res.text) } }]
        : [],
      costDelta: this._estimateStepCost(step, res),
      reviewCountDelta: 0,
    });

    return {
      ok,
      res,
      stepResult: {
        index,
        assistantId: step.assistantId,
        subtask: step.subtask,
        ok,
        text: res?.text ?? null,
        error: res?.error ?? (ok ? null : { code: "review_failed", message: "review did not pass" }),
      },
      sources: Array.isArray(res?.sources) ? res.sources : [],
      artifacts: Array.isArray(res?.artifacts) ? res.artifacts : [],
    };
  }

  async _runV2AndFinalize({
    orchestrationRunId,
    planSteps,
    context,
    workspace,
    user,
    thread,
    goal,
    employees,
    signal,
    onEvent,
    rootSpan,
    runStartedAt,
  }) {
    const emit = (e) => {
      if (typeof onEvent === "function") {
        try { onEvent(e); } catch (_) {}
      }
    };

    let metadataRecord = normalizeRecord(await this._runStore.get(orchestrationRunId));
    const swarmStillEnabled = isSwarmOrchestrationEnabled();
    if (!swarmStillEnabled && metadataRecord.metadata.executionMode !== "serial") {
      await commitWithRebase({
        runStore: this._runStore,
        runId: orchestrationRunId,
        mutate: (metadata) => ({
          ...metadata,
          executionMode: "serial",
        }),
      });
    }

    await commitWithRebase({
      runStore: this._runStore,
      runId: orchestrationRunId,
      mutate: (metadata) => ({
        ...metadata,
        stepStates: reconcileStale(
          metadata.stepStates || [],
          this._now()
        ),
      }),
    });

    const stepResults = [];
    const allSources = [];
    const allArtifacts = [];
    let finalStatus = "done";
    let aborted = false;
    let conflictSpins = 0;

    while (true) {
      if (signal?.aborted) {
        aborted = true;
        finalStatus = "cancelled";
        break;
      }

      metadataRecord = normalizeRecord(await this._runStore.get(orchestrationRunId));
      const cursor = deriveCursor(metadataRecord.metadata.stepStates || []);
      const unit = this._nextExecutionUnit({
        planSteps,
        metadata: metadataRecord.metadata,
        startIndex: cursor,
      });
      if (!unit) break;
      if (unit.blocked) {
        if (unit.status === "awaiting_approval") {
          const confirmationId = unit.state?.confirmationId || null;
          if (this._runStore.update) {
            await this._runStore.update(orchestrationRunId, {
              status: "suspended",
              pendingConfirmationId: confirmationId,
            });
          }
          rootSpan.setAttribute("status", "suspended");
          rootSpan.setAttribute("suspended", true);
          return {
            text: null,
            steps: stepResults,
            sources: dedupById(allSources),
            artifacts: allArtifacts,
            runId: orchestrationRunId,
            status: "suspended",
            confirmationId,
            error: null,
          };
        }
        if (unit.status === "needs_reconciliation") {
          if (this._runStore.update) {
            await this._runStore.update(orchestrationRunId, {
              status: "needs_reconciliation",
            });
          }
          rootSpan.setAttribute("status", "needs_reconciliation");
          return {
            text: null,
            steps: stepResults,
            sources: dedupById(allSources),
            artifacts: allArtifacts,
            runId: orchestrationRunId,
            status: "needs_reconciliation",
            error: {
              code: "needs_reconciliation",
              message: `step ${unit.index} requires manual reconciliation`,
            },
          };
        }
        if (unit.status === "running") {
          rootSpan.setAttribute("status", "running");
          return {
            text: null,
            steps: stepResults,
            sources: dedupById(allSources),
            artifacts: allArtifacts,
            runId: orchestrationRunId,
            status: "running",
            error: null,
          };
        }
        finalStatus = "failed";
        break;
      }

      const sharedContextText = Object.entries(snapshotContext(metadataRecord.metadata))
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
      const baseContext = metadataRecord.metadata.executionMode === "grouped"
        ? [context, sharedContextText].filter(Boolean).join("\n")
        : (context || sharedContextText);
      const allowReviewer = true;
      const executeIndex = async (index) => {
        const step = planSteps[index];
        emit({
          type: "statusResponse",
          content: `派给 ${labelOf(employees, step.assistantId)}:${step.subtask}`,
        });
        return this._executeV2Step({
          orchestrationRunId,
          index,
          step,
          context: baseContext,
          workspace,
          user,
          thread,
          signal,
          onEvent,
          employees,
          allowReviewer,
        });
      };

      const outcomes = unit.length > 1
        ? await Promise.all(unit.map(executeIndex))
        : [await executeIndex(unit[0])];

      let shouldStopAfterOutcomes = false;
      let sawClaimConflict = false;
      for (const outcome of outcomes.sort((a, b) => (a?.stepResult?.index ?? 0) - (b?.stepResult?.index ?? 0))) {
        if (outcome?.claimConflict) {
          sawClaimConflict = true;
          continue;
        }
        if (outcome?.blockedStatus === "needs_reconciliation") {
          if (this._runStore.update) {
            await this._runStore.update(orchestrationRunId, {
              status: "needs_reconciliation",
            });
          }
          rootSpan.setAttribute("status", "needs_reconciliation");
          return {
            text: null,
            steps: stepResults,
            sources: dedupById(allSources),
            artifacts: allArtifacts,
            runId: orchestrationRunId,
            status: "needs_reconciliation",
            error: {
              code: "needs_reconciliation",
              message: `step ${outcome.index} requires manual reconciliation`,
            },
          };
        }
        if (outcome?.suspended) {
          if (this._runStore.update) {
            await this._runStore.update(orchestrationRunId, {
              status: "suspended",
              pendingConfirmationId: outcome.confirmationId,
            });
          }
          rootSpan.setAttribute("status", "suspended");
          return {
            text: null,
            steps: stepResults,
            sources: dedupById(allSources),
            artifacts: allArtifacts,
            runId: orchestrationRunId,
            status: "suspended",
            confirmationId: outcome.confirmationId,
            error: null,
          };
        }
        if (outcome?.claimFailed) {
          finalStatus = "failed";
          shouldStopAfterOutcomes = true;
        }
        if (!outcome?.stepResult) continue;
        stepResults.push(outcome.stepResult);
        if (outcome.ok && outcome.stepResult.text) {
          context = outcome.stepResult.text;
        }
        allSources.push(...(outcome.sources || []));
        allArtifacts.push(...(outcome.artifacts || []));
      }
      if (shouldStopAfterOutcomes) break;
      if (sawClaimConflict) {
        conflictSpins += 1;
        if (conflictSpins >= 3) {
          finalStatus = "failed";
          break;
        }
        continue;
      }
      conflictSpins = 0;
    }

    await this._runStore.finalize(orchestrationRunId, finalStatus);
    const lastOk = [...stepResults].reverse().find((s) => s.ok);
    const failed = stepResults.filter((s) => !s.ok);
    let text = lastOk?.text || "团队未能产出有效结果。";
    if (failed.length) {
      text += `\n\n(注:${failed.length} 步未完成:${failed
        .map((s) => labelOf(employees, s.assistantId))
        .join("、")}。)`;
    }
    if (aborted) text = "团队运行已取消。";
    const exitStatus = aborted ? "cancelled" : finalStatus;

    rootSpan.setAttribute("steps", stepResults.length);
    rootSpan.setAttribute("status", exitStatus);
    rootSpan.setAttribute("suspended", false);

    if (await trajectoryMemoryEnabled()) {
      const {
        deriveTrajectoryOutcome,
        recordTrajectory,
      } = require("../trajectoryMemory");
      const trajectoryOutcome = deriveTrajectoryOutcome({
        stepResults,
        finalStatus: exitStatus,
      });
      if (trajectoryOutcome) {
        try {
          await recordTrajectory({
            runId: orchestrationRunId,
            workspaceId: workspace.id,
            userId: user?.id ?? null,
            runMetadata: await this._runStore.get(orchestrationRunId),
            validatedPlan: planSteps,
            outcome: trajectoryOutcome.outcome,
            successScore: trajectoryOutcome.successScore,
            tokenCost: Math.round(
              normalizeRecord(await this._runStore.get(orchestrationRunId))
                .metadata.cumulativeCost || 0
            ),
            durationMs: Date.now() - runStartedAt,
          });
        } catch (error) {
          console.warn("[TrajectoryMemory] record skipped:", error.message);
        }
      }
    }

    const go = await this._guardrailPipeline.runOutput(text, { workspaceId: workspace.id });
    text = go.text;
    if (go.findings?.length) {
      emit({
        type: "statusResponse",
        content: `🛡️ 输出检查:已脱敏 ${summarizeFindings(go.findings)}`,
      });
    }

    return {
      text,
      steps: stepResults,
      sources: dedupById(allSources),
      artifacts: allArtifacts,
      runId: orchestrationRunId,
      status: exitStatus,
      error: aborted
        ? { code: "aborted", message: "team run aborted" }
        : null,
    };
  }

  /**
   * Run the team orchestration loop.
   *
   * @param {{
   *   workspace: { id: number|string },
   *   user?: object|null,
   *   thread?: { id: string|number }|null,
   *   goal: string,
   *   employees: Array<{ assistantId: string, name?: string, title?: string }>,
   *   generateText: function,
   *   parentRunId?: string|null,
   *   signal?: AbortSignal|null,
   *   onEvent?: function|null,
   *   config?: { maxSteps?: number, costBudget?: number },
   *   resumeState?: { runId: string, plan: Array, cursor: number, accumulatedContext: string }|null,
   * }} args
   *
   * @returns {Promise<{
   *   text: string|null,
   *   steps: Array<{ index:number, assistantId:string, subtask:string, ok:boolean, text:string|null, error:object|null }>,
   *   sources: Array<object>,
   *   artifacts: Array<object>,
   *   runId: string|null,
   *   status?: "suspended"|"done"|"cancelled"|"budget_exceeded",
   *   confirmationId?: string,
   *   error: { code:string, message:string }|null,
   * }>}
   */
  async run({
    workspace,
    user = null,
    thread = null,
    goal,
    employees,
    generateText,
    parentRunId = null,
    signal = null,
    onEvent = null,
    config = {},
    resumeState = null,
  }) {
    const cfg = { maxSteps: 6, costBudget: Infinity, ...config };

    const emit = (e) => {
      if (typeof onEvent === "function") {
        try {
          onEvent(e);
        } catch (_) {}
      }
    };

    // ── team.orchestration root span (wraps entire run) ──────────────────────
    return withSpan(
      "team.orchestration",
      {
        goalLen: String(goal || "").length,
        maxSteps: cfg.maxSteps,
        resumed: !!resumeState,
      },
      async (rootSpan) => {
        let orchestrationRunId;
        let planSteps;
        let loopStart;
        let context;
        let v2Run = false;
        const runStartedAt = Date.now();

        if (resumeState) {
          // ── resumeState branch: skip createPlan + runStore.create ──────────
          // Do NOT re-run input guardrails on resume (goal was already processed on first run)
          orchestrationRunId = resumeState.runId;
          const storedState = await this._runStore.get(orchestrationRunId);
          const storedMetadata = storedState?.metadata || storedState || {};
          v2Run = storedMetadata.executionVersion === 2 || resumeState.executionVersion === 2;
          planSteps = v2Run ? storedMetadata.plan : resumeState.plan;
          loopStart = v2Run
            ? deriveCursor(storedMetadata.stepStates || [])
            : resumeState.cursor;
          context = (v2Run
            ? storedMetadata.accumulatedContext
            : resumeState.accumulatedContext) ?? "";
          // Do NOT re-emit agentTaskList on resume
          rootSpan.setAttribute("orchestrationRunId", String(orchestrationRunId));
        } else {
          // ── Cap3-T2: runInput (PII detect + injection check) ─────────────────
          const gi = await this._guardrailPipeline.runInput(goal, { workspaceId: workspace.id });
          if (gi.findings?.length) {
            emit({
              type: "statusResponse",
              content: `🛡️ 输入检查:${summarizeFindings(gi.findings)}`,
              // summarizeFindings returns only type+count — no raw PII
            });
          }
          if (gi.blocked) {
            rootSpan.setAttribute("status", "blocked");
            return {
              text: "输入被安全策略拦截(疑似提示注入)。",
              steps: [],
              sources: [],
              artifacts: [],
              runId: null,
              status: "blocked",
              error: { code: "guardrail_blocked", message: "input blocked by guardrail" },
            };
          }
          // planGoal: default=original goal (piiRedact=false); if input redaction enabled, gi.text is redacted
          const planGoal = gi.text;

          // ── 1) Plan decomposition ────────────────────────────────────────────
          const tmEnabled = await trajectoryMemoryEnabled();
          const multiUserMode = tmEnabled ? await resolveMultiUserMode() : false;
          const pastTrajectoriesBlock = tmEnabled
            ? await buildPastTrajectoriesBlock({
                workspaceId: workspace.id,
                user,
                canonicalGoal: planGoal,
                multiUserMode,
              })
            : "";

          const plan = await this._createPlan({
            goal: planGoal,
            employees,
            generateText,
            maxSteps: cfg.maxSteps,
            pastTrajectoriesBlock,
          });

          if (!plan.steps || plan.steps.length === 0) {
            rootSpan.setAttribute("status", "no_valid_steps");
            rootSpan.setAttribute("steps", 0);
            return {
              text: `无法拆解该团队目标:${
                plan.error?.message || plan.reason || "no steps"
              }`,
              steps: [],
              sources: [],
              artifacts: [],
              error:
                plan.error || {
                  code: "no_valid_steps",
                  message: "planner produced no steps",
                },
              runId: null,
            };
          }

          const swarmEnabled = isSwarmOrchestrationEnabled();
          const effectiveSteps = swarmEnabled
            ? await this._prepareSwarmPlan({
                steps: plan.steps,
                workspace,
                user,
              })
            : plan.steps;
          v2Run = swarmEnabled;

          // Emit task list so frontend can show pending steps
          emit({
            type: "agentTaskList",
            content: {
              tasks: effectiveSteps.map((s, i) => ({
                index: i,
                assistantId: s.assistantId,
                subtask: s.subtask,
                status: "pending",
              })),
            },
          });

          // ── 2) Persist orchestration run (durable handle for T6 resume) ────
          orchestrationRunId = await this._runStore.create({
            workspaceId: workspace.id,
            threadId: thread?.id ?? null,
            goal: planGoal,
            plan: effectiveSteps,
            parentRunId,
            user,
            trajectoryMemoryEnabled: tmEnabled,
            multiUserMode,
            executionVersion: swarmEnabled ? 2 : null,
            executionMode: swarmEnabled
              ? this._executionModeFor(effectiveSteps)
              : null,
            stepStates: swarmEnabled
              ? createInitialStepStates(effectiveSteps)
              : null,
            sharedContext: swarmEnabled ? {} : null,
          });

          rootSpan.setAttribute("orchestrationRunId", String(orchestrationRunId));

          // ── B1: Plan-level approval gate (fresh only; resume bypasses) ──
          if (String(process.env.TEAM_PLAN_APPROVAL_ENABLED || "").toLowerCase() === "true") {
            const planBroker = this._createApprovalBroker({
              orchestrationRunId, stepId: "plan", // kind 仍由默认 broker 写为 team_step → resume 可恢复
              workspaceId: workspace.id, userId: user?.id ?? null,
              threadId: thread?.id ?? null, onEvent, store: this._confirmationStore,
            });
            const d = await planBroker.requestApproval({
              toolName: "team_plan", toolArgs: { steps: plan.steps },
              reason: "团队计划待用户确认", riskLevel: "medium",
            });
            if (d.decision === "suspend") {
              await this._runStore.update(orchestrationRunId, {
                cursor: 0, accumulatedContext: String(planGoal), status: "suspended",
                pendingConfirmationId: d.confirmationId,
              });
              rootSpan.setAttribute("status", "suspended"); rootSpan.setAttribute("suspended", true);
              return { text: null, steps: [], sources: [], artifacts: [], runId: orchestrationRunId, status: "suspended", confirmationId: d.confirmationId, error: null };
            }
            if (d.decision === "rejected") {
              await this._runStore.finalize(orchestrationRunId, "rejected");
              rootSpan.setAttribute("status", "rejected");
              return { text: "用户拒绝了该团队计划，未执行任何步骤。", steps: [], sources: [], artifacts: [], runId: orchestrationRunId, status: "rejected", error: null };
            }
          }

          planSteps = effectiveSteps;
          loopStart = 0;
          context = String(planGoal);
        }

        if (v2Run) {
          return this._runV2AndFinalize({
            orchestrationRunId,
            planSteps,
            context,
            workspace,
            user,
            thread,
            goal,
            employees,
            signal,
            onEvent,
            rootSpan,
            runStartedAt,
          });
        }

        // ── 3) Controlled loop with guardrails ─────────────────────────────
        const stepResults = [];
        const allSources = [];
        const allArtifacts = [];
        let cost = 0;
        let finalStatus = "done";
        let aborted = false;

        for (let i = loopStart; i < planSteps.length; i++) {
          // Abort check (before executing next step)
          if (signal?.aborted) {
            aborted = true;
            finalStatus = "cancelled";
            break;
          }

          // Cost budget check (before executing next step)
          if (cost >= cfg.costBudget) {
            finalStatus = "budget_exceeded";
            emit({
              type: "statusResponse",
              content: `成本预算已达上限,提前结束(完成 ${i}/${planSteps.length} 步)。`,
            });
            break;
          }

          const step = planSteps[i];
          const stepContext = recitationEnabled()
            ? renderRecitation({ plan: planSteps, cursor: i, stepResults, employees, subtask: step.subtask })
            : context;
          emit({
            type: "statusResponse",
            content: `派给 ${labelOf(employees, step.assistantId)}:${step.subtask}`,
          });

          // T6d: Build per-step ApprovalBroker and inject as approvalDelegate
          const broker = this._createApprovalBroker({
            orchestrationRunId,
            stepId: i,
            workspaceId: workspace.id,
            userId: user?.id ?? null,
            threadId: thread?.id ?? null,
            onEvent,
            store: this._confirmationStore,
          });

          // T6d: Build per-step tool (with broker bound as approvalDelegate)
          const tool = this._buildRunEmployeeMastraTool({
            workspace,
            user,
            parentRunId: orchestrationRunId,
            depth: 0,
            maxDepth: 1,
            signal,
            onEvent,
            service: this._service,
            approvalDelegate: broker,
          });

          // ── team.step child span ─────────────────────────────────────────
          // Returns: { suspended: true, suspendedResult } | { ok, res, retried }
          const stepOutcome = await withSpan(
            "team.step",
            { stepId: i, assistantId: String(step.assistantId) },
            async (_stepSpan) => {
              // Execute step
              let res = await tool.execute({
                assistantId: step.assistantId,
                task: step.subtask,
                context: stepContext,
              });

              // T6d: Detect approval_needed BEFORE retry (not a failure — do not retry)
              if (res?.error?.code === "approval_needed") {
                await this._runStore.update(orchestrationRunId, {
                  cursor: i, // current step (will re-run on resume)
                  accumulatedContext: context,
                  status: "suspended",
                  pendingConfirmationId: res.error.confirmationId,
                });
                _stepSpan.setAttribute("ok", false);
                _stepSpan.setAttribute("errorCode", "approval_needed");
                _stepSpan.setAttribute("retried", false);
                return {
                  suspended: true,
                  suspendedResult: {
                    text: null,
                    steps: stepResults,
                    sources: dedupById(allSources),
                    artifacts: allArtifacts,
                    runId: orchestrationRunId,
                    status: "suspended",
                    confirmationId: res.error.confirmationId,
                    error: null,
                  },
                };
              }

              // Retry once on non-approval failure
              let retried = false;
              if (res?.error) {
                emit({
                  type: "statusResponse",
                  content: `${labelOf(employees, step.assistantId)} 失败,重试一次…`,
                });
                res = await tool.execute({
                  assistantId: step.assistantId,
                  task: step.subtask,
                  context: stepContext,
                });
                retried = true;
              }

              const ok = !res?.error;
              _stepSpan.setAttribute("ok", ok);
              _stepSpan.setAttribute("errorCode", res?.error?.code || "");
              _stepSpan.setAttribute("retried", retried);
              return { suspended: false, ok, res, retried };
            }
          );

          // ── approval_needed early-return ─────────────────────────────────
          if (stepOutcome.suspended) {
            rootSpan.setAttribute("steps", stepResults.length);
            rootSpan.setAttribute("status", "suspended");
            rootSpan.setAttribute("suspended", true);
            return stepOutcome.suspendedResult;
          }

          const { ok, res } = stepOutcome;

          stepResults.push({
            index: i,
            assistantId: step.assistantId,
            subtask: step.subtask,
            ok,
            text: res?.text ?? null,
            error: res?.error ?? null,
          });

          if (ok) {
            if (res.text) context = res.text; // feed output into next step's context
            if (Array.isArray(res.sources)) allSources.push(...res.sources);
            if (Array.isArray(res.artifacts)) allArtifacts.push(...res.artifacts);
            emit({
              type: "statusResponse",
              content: `${labelOf(employees, step.assistantId)} 完成。`,
            });
          } else {
            emit({
              type: "statusResponse",
              content: `${labelOf(employees, step.assistantId)} 两次失败,跳过此步(如实告知)。`,
            });
          }

          cost += this._estimateStepCost(step, res);
          await this._runStore.update(orchestrationRunId, {
            cursor: i + 1,
            accumulatedContext: context,
          });

          if (recitationEnabled() && orchestrationRunId) {
            const written = writePlanFile({
              runId: orchestrationRunId, goal: String(goal), plan: planSteps,
              cursor: i + 1, stepResults, employees,
              storageDir: process.env.STORAGE_DIR || require("path").resolve(__dirname, "../../../storage"),
            });
            if (written) {
              const b64 = "data:text/markdown;base64," + Buffer.from(written.content).toString("base64");
              const art = { type: "fileDownload", content: { filename: "plan.md", b64Content: b64 } };
              // allArtifacts 只保留最新一份 plan.md（去重）；每步仍 emit 供实时 UI
              for (let k = allArtifacts.length - 1; k >= 0; k--) {
                if (allArtifacts[k]?.content?.filename === "plan.md") allArtifacts.splice(k, 1);
              }
              allArtifacts.push(art);
              emit(art);
            }
          }
        }

        await this._runStore.finalize(orchestrationRunId, finalStatus);

        // ── 4) Summarize ──────────────────────────────────────────────────
        const lastOk = [...stepResults].reverse().find((s) => s.ok);
        const failed = stepResults.filter((s) => !s.ok);

        let text = lastOk?.text || "团队未能产出有效结果。";
        if (failed.length) {
          text += `\n\n(注:${failed.length} 步未完成:${failed
            .map((s) => labelOf(employees, s.assistantId))
            .join("、")}。)`;
        }
        if (aborted) text = "团队运行已取消。";

        const exitStatus = aborted ? "cancelled" : finalStatus;
        rootSpan.setAttribute("steps", stepResults.length);
        rootSpan.setAttribute("status", exitStatus);
        rootSpan.setAttribute("suspended", false);

        if (await trajectoryMemoryEnabled()) {
          const {
            deriveTrajectoryOutcome,
            recordTrajectory,
          } = require("../trajectoryMemory");
          const trajectoryOutcome = deriveTrajectoryOutcome({
            stepResults,
            finalStatus: exitStatus,
          });
          if (trajectoryOutcome) {
            try {
              await recordTrajectory({
                runId: orchestrationRunId,
                workspaceId: workspace.id,
                userId: user?.id ?? null,
                runMetadata: await this._runStore.get(orchestrationRunId),
                validatedPlan: planSteps,
                outcome: trajectoryOutcome.outcome,
                successScore: trajectoryOutcome.successScore,
                tokenCost: Math.round(cost),
                durationMs: Date.now() - runStartedAt,
              });
            } catch (error) {
              console.warn("[TrajectoryMemory] record skipped:", error.message);
            }
          }
        }

        // ── Cap3-T2: runOutput (PII redaction on final report) ────────────────
        // Applies to both normal completion AND resume completion paths.
        // Aborted/cancelled runs use a fixed string with no PII — still safe to run through.
        // suspended/no_valid_steps/blocked branches return early above and skip this.
        const go = await this._guardrailPipeline.runOutput(text, { workspaceId: workspace.id });
        text = go.text; // redacted version
        if (go.findings?.length) {
          emit({
            type: "statusResponse",
            content: `🛡️ 输出检查:已脱敏 ${summarizeFindings(go.findings)}`,
            // summarizeFindings returns only type+count — no raw PII
          });
        }

        return {
          text,
          steps: stepResults,
          sources: dedupById(allSources),
          artifacts: allArtifacts,
          runId: orchestrationRunId,
          status: exitStatus,
          error: aborted
            ? { code: "aborted", message: "team run aborted" }
            : null,
        };
      }
    );
  }
}

module.exports = { TeamOrchestrationService, defaultRunStore, defaultEstimateStepCost, labelOf, dedupById };
