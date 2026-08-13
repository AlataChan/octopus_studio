const { v4: uuidv4 } = require("uuid");
const { CodingAgentLoop } = require("./codingAgentLoop");
const { CodingModelAdapter } = require("./codingModelAdapter");
const { CodingSession } = require("./codingSession");
const { CodingToolRuntime } = require("./codingToolRuntime");
const { applyPatchBack } = require("./patchApply");
const { redactPayload } = require("./events");

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "failed", "expired"]);
const NON_TERMINAL_STATUSES = new Set(["pending", "running", "awaiting_approval"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function safeManifest(manifest = null) {
  if (!manifest) return null;
  return {
    sourceRepoPath: manifest.sourceRepoPath || null,
    sandboxPath: manifest.sandboxPath || null,
    runId: manifest.runId || null,
    sourceHead: manifest.sourceHead || null,
    files: { ...(manifest.files || {}) },
  };
}

class MemoryCodingRunRepository {
  constructor() {
    this.isMemoryRepository = true;
    this.runs = new Map();
    this.events = new Map();
    this.artifacts = new Map();
  }

  async saveRun(run) {
    this.runs.set(run.runId, clone(run));
    return this.runs.get(run.runId);
  }

  async updateRun(runId, patch = {}) {
    const current = this.runs.get(runId) || { runId };
    const next = { ...current, ...clone(patch) };
    this.runs.set(runId, next);
    return next;
  }

  async appendEvent(runId, type, payload = {}) {
    const list = this.events.get(runId) || [];
    const event = {
      sequence: list.length + 1,
      type,
      payload: redactPayload(payload),
      createdAt: Date.now(),
    };
    list.push(event);
    this.events.set(runId, list);
    return event;
  }

  async saveArtifact(runId, artifact = {}) {
    const list = this.artifacts.get(runId) || [];
    list.push(clone(artifact));
    this.artifacts.set(runId, list);
    return artifact;
  }

  async loadRun(runId) {
    return this.runs.get(runId) || null;
  }

  async listEvents(runId) {
    return this.events.get(runId) || [];
  }

  async listNonTerminalRuns() {
    return Array.from(this.runs.values()).filter((run) =>
      NON_TERMINAL_STATUSES.has(run.status)
    );
  }
}

function defaultModelFactory() {
  return {
    async *stream() {
      yield {
        type: "text",
        text: "Coding model is not configured for this run.",
      };
      yield { type: "stop_reason", stop_reason: "end_turn" };
    },
  };
}

function publicSnapshot(run) {
  if (!run) return null;
  return {
    runId: run.runId,
    status: run.status,
    provider: run.provider,
    model: run.model,
    totalTurns: run.totalTurns,
    totalCostUsd: run.totalCostUsd,
    sourceRepoPath: run.sourceRepoPath,
    sandboxPath: run.sandboxPath,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
    error: run.error,
    errorCode: run.errorCode,
    errorDetail: run.errorDetail,
    metadata: run.metadata,
    appliedAt: run.appliedAt,
    pendingApproval: run.pendingApproval,
  };
}

class CodingRunManager {
  constructor({
    sessionFactory = CodingSession.create,
    modelFactory = defaultModelFactory,
    loopFactory = null,
    toolRuntimeFactory = CodingToolRuntime.createDefault,
    applyPatchBack: applyPatchBackFn = applyPatchBack,
    storageRoot = null,
    allowlistResolver = () => [],
    now = () => Date.now(),
    maxActiveRuns = 5,
    eventLogCap = 500,
    runTtlMs = 60 * 60 * 1000,
    repository = new MemoryCodingRunRepository(),
  } = {}) {
    this.sessionFactory = sessionFactory;
    this.modelFactory = modelFactory;
    this.loopFactory = loopFactory;
    this.toolRuntimeFactory = toolRuntimeFactory;
    this.applyPatchBack = applyPatchBackFn;
    this.storageRoot = storageRoot;
    this.allowlistResolver = allowlistResolver;
    this.now = now;
    this.maxActiveRuns = maxActiveRuns;
    this.eventLogCap = eventLogCap;
    this.runTtlMs = runTtlMs;
    this.repository = repository;
    this.runs = new Map();
    this.internal = new Map();
  }

  async initialize() {
    const staleRuns = (await this.repository.listNonTerminalRuns?.()) || [];
    for (const staleRun of staleRuns) {
      const failed = {
        ...staleRun,
        status: "failed",
        errorCode: "runner_lost",
        error: "Coding run was interrupted before completion.",
        completedAt: this.now(),
        updatedAt: this.now(),
      };
      this.runs.set(staleRun.runId, failed);
      await this.repository.updateRun(staleRun.runId, {
        status: "failed",
        errorCode: "runner_lost",
        errorDetail: "Coding run was interrupted before completion.",
        completedAt: failed.completedAt,
        updatedAt: failed.updatedAt,
      });
      await this.repository.appendEvent(staleRun.runId, "coding.run.failed", {
        errorCode: "runner_lost",
        error: "Coding run was interrupted before completion.",
      });
    }
  }

  activeRunCount() {
    let count = 0;
    for (const run of this.runs.values()) {
      if (!TERMINAL_STATUSES.has(run.status)) count += 1;
    }
    return count;
  }

  assertCapacity() {
    if (this.activeRunCount() >= this.maxActiveRuns) {
      throw new Error(`Coding agent active run limit reached: ${this.maxActiveRuns}`);
    }
  }

  recordEvent(runId, type, payload = {}) {
    const run = this.runs.get(runId);
    if (!run) return null;
    const redactedPayload = redactPayload(payload);
    const event = {
      sequence: ++run.lastSequence,
      type,
      payload: redactedPayload,
      createdAt: this.now(),
    };
    run.events.push(event);
    if (run.events.length > this.eventLogCap) {
      const dropped = run.events.splice(0, run.events.length - this.eventLogCap);
      const lastRetainedSequence = run.events[0]?.sequence || event.sequence;
      run.events.unshift({
        sequence: ++run.lastSequence,
        type: "coding.events.truncated",
        payload: {
          droppedCount: dropped.length,
          lastRetainedSequence,
        },
        createdAt: this.now(),
      });
    }
    this.repository
      ?.appendEvent?.(runId, type, redactedPayload)
      ?.catch?.(() => {});
    return event;
  }

  eventSinkFor(runId) {
    return {
      record: (type, payload) => this.recordEvent(runId, type, payload),
    };
  }

  async createRun({
    sourceRepoPath,
    prompt,
    provider = "fake",
    model = null,
    maxTurns = 20,
    dependencyMode = "no-install",
    allowedSourceRoots = null,
    storageRoot = null,
  } = {}) {
    this.cleanupExpired();
    this.assertCapacity();
    const runId = `coding-${uuidv4().replace(/-/g, "")}`;
    const timestamp = this.now();
    const roots = allowedSourceRoots || this.allowlistResolver();
    const run = {
      runId,
      status: "pending",
      provider,
      model,
      totalTurns: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      error: null,
      pendingApproval: null,
      sourceRepoPath,
      sandboxPath: null,
      errorCode: null,
      errorDetail: null,
      metadata: {},
      events: [],
      lastSequence: 0,
      prompt,
    };
    this.runs.set(runId, run);
    await this.repository.saveRun(clone(run));
    this.recordEvent(runId, "coding.run.created", { runId });

    const controller = new AbortController();
    this.internal.set(runId, { controller, session: null, loop: null, toolRuntime: null, final: null });

    Promise.resolve().then(() =>
      this.startRun(runId, {
        sourceRepoPath,
        prompt,
        provider,
        model,
        maxTurns,
        dependencyMode,
        allowedSourceRoots: roots,
        storageRoot: storageRoot || this.storageRoot,
      })
    );

    return { runId, status: run.status };
  }

  async startRun(runId, options) {
    const run = this.runs.get(runId);
    const state = this.internal.get(runId);
    if (!run || !state || run.status === "cancelled") return;
    try {
      run.status = "running";
      run.updatedAt = this.now();
      const session = await this.sessionFactory({
        sourceRepoPath: options.sourceRepoPath,
        runId,
        storageRoot: options.storageRoot,
        allowedSourceRoots: options.allowedSourceRoots,
      });
      state.session = session;
      run.sourceRepoPath = session.workspace?.sourceRepoPath || options.sourceRepoPath;
      run.sandboxPath = session.workspace?.sandboxPath || null;
      run.metadata = {
        ...(run.metadata || {}),
        manifest: safeManifest(session.workspace?.manifest),
      };
      await this.repository.updateRun(runId, {
        sourceRepoPath: run.sourceRepoPath,
        sandboxPath: run.sandboxPath,
        metadata: run.metadata,
        status: run.status,
      });
      this.recordEvent(runId, "coding.sandbox.created", {
        sandboxPath: session.workspace?.sandboxPath,
      });
      const toolRuntime = this.toolRuntimeFactory({
        runtime: session.runtime,
        workspace: session.workspace,
        dependencyMode: options.dependencyMode,
        eventSink: this.eventSinkFor(runId),
      });
      state.toolRuntime = toolRuntime;
      const modelInstance = this.modelFactory({
        provider: options.provider,
        model: options.model,
        runId,
      });
      const modelAdapter = modelInstance?.stream
        ? new CodingModelAdapter({ model: modelInstance, provider: options.provider })
        : modelInstance;
      const loop =
        this.loopFactory?.({
          modelAdapter,
          toolRuntime,
          signal: state.controller.signal,
          maxTurns: options.maxTurns,
          session,
          runId,
        }) ||
        new CodingAgentLoop({
          modelAdapter,
          toolRuntime,
          signal: state.controller.signal,
          maxTurns: options.maxTurns,
        });
      state.loop = loop;
      const result = await loop.run(options.prompt);
      await this.applyLoopResult(runId, result);
    } catch (error) {
      if (run.status === "cancelled") return;
      run.status = "failed";
      run.error = error?.message || String(error);
      run.errorDetail = run.error;
      run.updatedAt = this.now();
      run.completedAt = this.now();
      await this.repository.updateRun(runId, {
        status: run.status,
        errorDetail: run.error,
        updatedAt: run.updatedAt,
        completedAt: run.completedAt,
      });
      this.recordEvent(runId, "coding.run.failed", { error: run.error });
    }
  }

  async applyLoopResult(runId, result = {}) {
    const run = this.runs.get(runId);
    const state = this.internal.get(runId);
    if (!run) return;
    if (run.status === "cancelled" && result.status !== "cancelled") return;
    run.totalTurns = result.turns || run.totalTurns || 0;
    run.pendingApproval = result.pendingApproval || null;
    run.updatedAt = this.now();
    if (result.status === "awaiting_approval") {
      run.status = "awaiting_approval";
      this.recordEvent(runId, "coding.tool.approval_required", run.pendingApproval || {});
      await this.repository.updateRun(runId, {
        status: run.status,
        totalTurns: run.totalTurns,
        pendingApproval: run.pendingApproval,
        updatedAt: run.updatedAt,
      });
      return;
    }
    if (result.status === "max_turns") {
      run.status = "failed";
      run.error = "Coding agent stopped after reaching maxTurns";
      run.errorCode = "max_turns";
      run.errorDetail = run.error;
    } else {
      run.status = result.status || "completed";
    }
    if (TERMINAL_STATUSES.has(run.status)) {
      run.completedAt = this.now();
      if (state?.session?.finalizeRun) {
        state.final = await state.session.finalizeRun({
          loopResult: result,
          commandHistory: state.toolRuntime?.getCommandHistory?.() || [],
        });
        const patchArtifact = state.final?.patchArtifact;
        if (patchArtifact) {
          await this.repository.saveArtifact(runId, {
            artifactType: "patch",
            label: "patch",
            storageRef: "inline:patch",
            mimeType: "text/x-diff",
            sizeBytes: patchArtifact.sizeBytes || Buffer.byteLength(patchArtifact.text || ""),
            metadata: {
              ...(patchArtifact.metadata || {}),
              changedFiles: patchArtifact.changedFiles || 0,
              manifest: run.metadata?.manifest || null,
            },
            patchArtifact,
          });
        }
        this.recordEvent(runId, "coding.patch.created", {
          changedFiles: state.final?.patchArtifact?.changedFiles || 0,
        });
      }
      await this.repository.updateRun(runId, {
        status: run.status,
        totalTurns: run.totalTurns,
        errorCode: run.errorCode,
        errorDetail: run.errorDetail || run.error,
        updatedAt: run.updatedAt,
        completedAt: run.completedAt,
        metadata: run.metadata || {},
      });
      this.recordEvent(
        runId,
        run.status === "cancelled" ? "coding.run.cancelled" : "coding.run.completed",
        { finalAnswer: state?.final?.finalAnswer || result.finalText || "" }
      );
    }
  }

  getRun(runId) {
    return publicSnapshot(this.runs.get(runId));
  }

  async loadRun(runId) {
    const run = this.runs.get(runId) || (await this.repository.loadRun?.(runId));
    return publicSnapshot(run);
  }

  listEvents(runId, { afterSequence = 0 } = {}) {
    const run = this.runs.get(runId);
    if (!run) return null;
    return run.events.filter((event) => event.sequence > Number(afterSequence || 0));
  }

  async approve(runId, { approvalId, approved } = {}) {
    const run = this.runs.get(runId);
    const state = this.internal.get(runId);
    if (run?.errorCode === "runner_lost") return { ok: false, code: "runner_lost" };
    if (!run || !state?.loop) return { ok: false, code: "run_not_found" };
    if (run.status !== "awaiting_approval" || run.pendingApproval?.approvalId !== approvalId) {
      return { ok: false, code: "approval_not_found" };
    }
    const result = await state.loop.resume({ approvalId, approved });
    await this.applyLoopResult(runId, result);
    return { ok: true, status: this.runs.get(runId)?.status };
  }

  cancel(runId) {
    const run = this.runs.get(runId);
    const state = this.internal.get(runId);
    if (run?.errorCode === "runner_lost") return { ok: false, code: "runner_lost" };
    if (!run || !state) return { ok: false, code: "run_not_found" };
    if (TERMINAL_STATUSES.has(run.status)) return { ok: true, status: run.status };
    state.controller.abort();
    const result =
      run.status === "awaiting_approval" && state.loop?.cancelAwaiting
        ? state.loop.cancelAwaiting()
        : { status: "cancelled", turns: run.totalTurns, messages: [] };
    run.status = "cancelled";
    run.pendingApproval = null;
    run.totalTurns = result.turns || run.totalTurns || 0;
    run.updatedAt = this.now();
    run.completedAt = this.now();
    this.repository.updateRun(runId, {
      status: run.status,
      pendingApproval: null,
      totalTurns: run.totalTurns,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
    });
    this.recordEvent(runId, "coding.run.cancelled", {});
    return { ok: true, status: result.status || "cancelled" };
  }

  async getPatch(runId) {
    const run = this.runs.get(runId);
    const state = this.internal.get(runId);
    if (!run || !state) return null;
    if (!state.final && state.session?.finalizeRun) {
      state.final = await state.session.finalizeRun({ loopResult: {} });
    }
    return state.final?.patchArtifact || null;
  }

  async applyBack(runId, { approved, conflictPolicy } = {}) {
    const run = this.runs.get(runId);
    const state = this.internal.get(runId);
    if (!run || !state) return { applied: false, status: "run_not_found" };
    if (!approved) {
      return {
        applied: false,
        status: "approval_required",
        reason: "applyBack requires approved:true",
      };
    }
    const patchArtifact = await this.getPatch(runId);
    return this.applyPatchBack({
      workspace: state.session?.workspace,
      patchArtifact,
      approval: { approved: true },
      conflictPolicy,
    });
  }

  cleanupExpired() {
    const now = this.now();
    for (const [runId, run] of this.runs.entries()) {
      if (!TERMINAL_STATUSES.has(run.status)) continue;
      if (!run.completedAt || now - run.completedAt < this.runTtlMs) continue;
      const state = this.internal.get(runId);
      state?.session?.workspace?.cleanup?.();
      run.status = "expired";
      this.internal.delete(runId);
    }
  }
}

module.exports = {
  CodingRunManager,
};
