const fs = require("fs/promises");
const path = require("path");
const { Run } = require("../../../models/run");
const { RunArtifact } = require("../../../models/runArtifact");
const { RunEvent } = require("../../../models/runEvent");
const {
  WorkflowPendingConfirmation,
} = require("../../../models/workflowPendingConfirmation");
const { runEventEmitter } = require("../../liveCanvas/runEventEmitter");
const { SSE_EVENTS } = require("../../liveCanvas/types");
const { createExecutionPolicy } = require("../security/policy");
const {
  ExecutionApprovalRequiredError,
  LocalExecutionRuntime,
} = require("../tools/localExecution");
const { createDeterministicWorkAgentModel } = require("../deterministicModel");
const { estimateCost } = require("../modelRouter");
const { loadMastra } = require("../mastraLoader");
const { WORK_EVENT_TYPES } = require("./types");
const { sanitizeArtifactData } = require("../../fde/artifactRedaction");

function storageRoot() {
  if (process.env.STORAGE_DIR) return path.resolve(process.env.STORAGE_DIR);
  return path.resolve(__dirname, "../../../storage");
}

async function writeArtifactFile({ runId, filename, data }) {
  const safeRunId = String(runId).replace(/[^A-Za-z0-9_-]/g, "");
  const relativeDir = path.join("work-agent", safeRunId);
  const relativePath = path.join(relativeDir, filename);
  const absolutePath = path.resolve(storageRoot(), relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const body = sanitizeArtifactData(data);
  await fs.writeFile(absolutePath, body, "utf8");

  return {
    storageRef: relativePath,
    sizeBytes: Buffer.byteLength(body),
  };
}

async function ensureManagedWorkspaceRoot(workspaceSlug) {
  const safeSlug = String(workspaceSlug || "default").replace(
    /[^A-Za-z0-9_-]/g,
    ""
  );
  const root = path.join(
    storageRoot(),
    "work-agent-workspaces",
    safeSlug || "default"
  );
  await fs.mkdir(root, { recursive: true });
  return root;
}

class MastraEngineAdapter {
  constructor({
    RunModel = Run,
    RunEventModel = RunEvent,
    RunArtifactModel = RunArtifact,
    WorkflowPendingConfirmationModel = WorkflowPendingConfirmation,
    emitter = runEventEmitter,
    mastraLoader = loadMastra,
    writeArtifactFile: artifactWriter = writeArtifactFile,
    RuntimeClass = LocalExecutionRuntime,
  } = {}) {
    this.name = "mastra";
    this.Run = RunModel;
    this.RunEvent = RunEventModel;
    this.RunArtifact = RunArtifactModel;
    this.WorkflowPendingConfirmation = WorkflowPendingConfirmationModel;
    this.emitter = emitter;
    this.mastraLoader = mastraLoader;
    this.writeArtifactFile = artifactWriter;
    this.RuntimeClass = RuntimeClass;
    this.activeRuns = new Map();
    this.pendingApprovals = new Map();
  }

  async submitGoal(input = {}) {
    const goal = String(input.goal || "").trim();
    if (!goal) throw new Error("goal is required");
    if (!input.workspace?.id) throw new Error("workspace is required");
    if (!input.thread?.slug) throw new Error("thread is required");

    const workspaceRoot =
      input.workspaceRoot ||
      (await ensureManagedWorkspaceRoot(input.workspace.slug));
    const run = await this.Run.create({
      threadId: input.thread.slug,
      workspaceId: input.workspace.id,
      triggerType: this.Run.TRIGGER.UI,
      triggerId: input.authCtx?.userId ? String(input.authCtx.userId) : null,
      engine: this.name,
      metadata: {
        kind: "work-agent",
        engine: input.engine || this.name,
        goal,
        workspaceRoot,
        policy: input.policy || {},
        providerRoute: {
          provider: input.providerRoute?.provider,
          model: input.providerRoute?.model,
          strategy: input.providerRoute?.strategy,
          costClass: input.providerRoute?.costClass,
        },
        workAgentVersion: 2,
      },
    });

    this.emitter.emitForSession(input.thread.slug, SSE_EVENTS.RUN_CREATED, {
      runId: run.id,
      run,
    });
    await this._appendEvent(run, WORK_EVENT_TYPES.STATUS, {
      status: this.Run.STATUS.QUEUED,
      message: "Work agent run queued",
      engine: this.name,
    });

    const controller = new AbortController();
    const promise = this._executeRun({
      run,
      goal,
      input: { ...input, workspaceRoot },
      signal: controller.signal,
    })
      .catch((error) => this._failRun(run, error))
      .finally(() => this.activeRuns.delete(run.id));
    this.activeRuns.set(run.id, { controller, promise });

    if (input.awaitCompletion) await promise;

    return { runId: run.id };
  }

  async _executeRun({ run, goal, input, signal }) {
    const running = await this.Run.updateStatus(
      run.id,
      this.Run.STATUS.RUNNING
    );
    this.emitter.emitForSession(run.threadId, SSE_EVENTS.RUN_UPDATED, {
      runId: run.id,
      run: running,
    });
    await this._appendEvent(run, WORK_EVENT_TYPES.STATUS, {
      status: this.Run.STATUS.RUNNING,
      message: "Mastra work agent started",
      engine: this.name,
    });
    await this._appendEvent(run, WORK_EVENT_TYPES.STEP_STARTED, {
      stepId: "phase2.execution",
      title: "Execute work-agent tool plan",
      engine: this.name,
    });

    const policy = createExecutionPolicy({
      workspaceRoots: [input.workspaceRoot],
      cwd: input.workspaceRoot,
      ...(input.policy || {}),
    });
    const runtime = new this.RuntimeClass({
      policy,
      signal,
      audit: (type, payload) => this._appendEvent(run, type, payload),
    });
    const { Agent } = this.mastraLoader();

    const agent = new Agent({
      name: "Alata Work Agent",
      instructions: [
        "Use the available work tools to complete the user's goal.",
        "Prefer small safe file edits, grep/read before changing files, and request shell approval when needed.",
        "When finished, summarize the changed files and command results.",
      ].join("\n"),
      model: this._buildModel({ goal, input }),
      tools: this._buildTools({ run, input, runtime }),
    });

    const result = await agent.generate(goal, {
      maxSteps: input.policy?.maxSteps || 10,
      abortSignal: signal,
    });

    await this._appendEvent(run, WORK_EVENT_TYPES.STEP_COMPLETED, {
      stepId: "phase2.execution",
      title: "Work-agent tool plan completed",
      output: { text: result.text || "" },
    });

    await this._recordCost({ run, result, providerRoute: input.providerRoute });
    const patch = await runtime.createPatch();
    const patchArtifact = await this._createArtifact({
      run,
      artifactType: "patch",
      filename: "changes.patch",
      label: "Work Agent patch",
      mimeType: "text/x-patch",
      data: patch.text,
      metadata: { engine: this.name },
    });

    await this._createArtifact({
      run,
      artifactType: "report",
      filename: "summary.json",
      label: "Work Agent summary",
      mimeType: "application/json",
      data: {
        goal,
        runId: run.id,
        engine: this.name,
        resultText: result.text || "",
        toolCalls: result.toolCalls || [],
        toolResults: result.toolResults || [],
        patchArtifactId: patchArtifact.id,
        completedAt: new Date().toISOString(),
      },
      metadata: {
        engine: this.name,
        providerRoute: input.providerRoute || {},
      },
    });

    const completed = await this.Run.updateStatus(
      run.id,
      this.Run.STATUS.SUCCEEDED,
      { surfaceId: "work-agent" }
    );
    this.emitter.emitForSession(run.threadId, SSE_EVENTS.RUN_COMPLETED, {
      runId: run.id,
      run: completed,
      status: this.Run.STATUS.SUCCEEDED,
    });
    await this._appendEvent(run, WORK_EVENT_TYPES.STATUS, {
      status: this.Run.STATUS.SUCCEEDED,
      message: "Work agent run completed",
      engine: this.name,
    });
  }

  _buildModel({ goal, input }) {
    if (input.providerRoute?.deterministic) {
      return createDeterministicWorkAgentModel({
        goal,
        toolPlan: input.toolPlan || [
          {
            toolName: "write_file",
            input: {
              path: "work-agent-result.txt",
              content: `Goal: ${goal}\nStatus: completed by deterministic Phase 2 route.\n`,
            },
          },
          {
            toolName: "run_shell",
            input: {
              command: `${process.execPath} -e "console.log('work-agent-command-ok')"`,
            },
          },
          { toolName: "create_patch", input: {} },
        ],
      });
    }
    if (input.providerRoute?.languageModel)
      return input.providerRoute.languageModel;
    return createDeterministicWorkAgentModel({ goal });
  }

  _buildTools({ run, input, runtime }) {
    const { createTool, z } = this.mastraLoader();
    return {
      read_file: createTool({
        id: "read_file",
        description:
          "Read a UTF-8 text file inside the approved workspace root.",
        inputSchema: z.object({ path: z.string() }),
        execute: ({ path: targetPath }) => runtime.readFile(targetPath),
      }),
      write_file: createTool({
        id: "write_file",
        description:
          "Write a UTF-8 text file inside the approved workspace root.",
        inputSchema: z.object({
          path: z.string(),
          content: z.string(),
          overwrite: z.boolean().optional(),
        }),
        execute: ({ path: targetPath, content, overwrite = true }) =>
          runtime.writeFile(targetPath, content, { overwrite }),
      }),
      edit_file: createTool({
        id: "edit_file",
        description: "Replace the first matching text in a workspace file.",
        inputSchema: z.object({
          path: z.string(),
          findText: z.string(),
          replaceText: z.string(),
        }),
        execute: ({ path: targetPath, findText, replaceText }) =>
          runtime.editFile(targetPath, findText, replaceText),
      }),
      grep: createTool({
        id: "grep",
        description: "Search text files under the approved workspace root.",
        inputSchema: z.object({ pattern: z.string() }),
        execute: ({ pattern }) => runtime.grep(pattern),
      }),
      run_shell: createTool({
        id: "run_shell",
        description:
          "Run a shell command in the approved workspace root after approval.",
        inputSchema: z.object({ command: z.string() }),
        execute: async ({ command }) => {
          try {
            return await runtime.runShell(command);
          } catch (error) {
            if (!(error instanceof ExecutionApprovalRequiredError)) throw error;
            const approved = await this._requestApproval({
              run,
              input,
              title: `Run shell command: ${command}`,
              details: error.approval,
            });
            if (!approved) throw new Error("Shell command approval denied");
            return runtime.runShell(command, { approved: true });
          }
        },
      }),
      create_patch: createTool({
        id: "create_patch",
        description:
          "Create a patch artifact from files in the workspace root.",
        inputSchema: z.object({}),
        execute: () => runtime.createPatch(),
      }),
    };
  }

  async _requestApproval({ run, input, title, details }) {
    const blocked = await this.Run.updateStatus(
      run.id,
      this.Run.STATUS.BLOCKED
    );
    this.emitter.emitForSession(run.threadId, SSE_EVENTS.RUN_BLOCKED, {
      runId: run.id,
      run: blocked,
      reason: title,
    });

    const confirmation = await this.WorkflowPendingConfirmation.create({
      workspaceId: run.workspaceId,
      userId: input.authCtx?.userId || null,
      threadId: input.thread?.id || null,
      planType: "work_agent_shell",
      planTitle: title,
      planDetails: {
        ...details,
        runId: run.id,
        engine: this.name,
      },
      riskLevel: details.riskLevel || "high",
      timeoutMinutes: input.policy?.approvalTimeoutMinutes || 10,
      runId: run.id,
    });

    this.emitter.emitForSession(run.threadId, SSE_EVENTS.APPROVAL_REQUESTED, {
      approvalId: String(confirmation.id),
      runId: run.id,
      title,
      riskLevel: details.riskLevel || "high",
      details,
    });
    await this._appendEvent(run, WORK_EVENT_TYPES.APPROVAL_REQUESTED, {
      approvalId: String(confirmation.id),
      title,
      riskLevel: details.riskLevel || "high",
      details,
    });

    const approved = await new Promise((resolve) => {
      this.pendingApprovals.set(String(confirmation.id), {
        runId: run.id,
        resolve,
      });
    });
    this.pendingApprovals.delete(String(confirmation.id));

    await this._appendEvent(run, WORK_EVENT_TYPES.APPROVAL_RESOLVED, {
      approvalId: String(confirmation.id),
      decision: approved ? "allow" : "deny",
    });
    if (approved) {
      const resumed = await this.Run.updateStatus(
        run.id,
        this.Run.STATUS.RUNNING
      );
      this.emitter.emitForSession(run.threadId, SSE_EVENTS.RUN_UPDATED, {
        runId: run.id,
        run: resumed,
      });
    }
    return approved;
  }

  async _recordCost({ run, result, providerRoute }) {
    const usage = result.usage || {};
    const inputTokens = usage.inputTokens || usage.promptTokens || null;
    const outputTokens = usage.outputTokens || usage.completionTokens || null;
    const costUsd = estimateCost({
      pricing: providerRoute?.pricing,
      inputTokens,
      outputTokens,
    });
    await this._appendEvent(run, WORK_EVENT_TYPES.COST_UPDATED, {
      provider: providerRoute?.provider || "deterministic",
      model: providerRoute?.model || "work-agent-deterministic",
      inputTokens,
      outputTokens,
      totalTokens: usage.totalTokens || null,
      costUsd,
      pricingSource: providerRoute?.pricing?.source || "unknown",
    });
  }

  async _createArtifact({
    run,
    artifactType,
    filename,
    label,
    mimeType,
    data,
    metadata = {},
  }) {
    const artifactFile = await this.writeArtifactFile({
      runId: run.id,
      filename,
      data,
    });
    const artifact = await this.RunArtifact.create({
      runId: run.id,
      artifactType,
      storageRef: artifactFile.storageRef,
      label,
      mimeType,
      sizeBytes: artifactFile.sizeBytes,
      metadata,
    });
    this.emitter.emitForSession(run.threadId, SSE_EVENTS.ARTIFACT_CREATED, {
      runId: run.id,
      artifact,
    });
    await this._appendEvent(run, WORK_EVENT_TYPES.ARTIFACT_CREATED, {
      artifactId: artifact.id,
      artifactType: artifact.artifactType,
      label: artifact.label,
      storageRef: artifact.storageRef,
      metadata: artifact.metadata || {},
    });
    return artifact;
  }

  async _appendEvent(run, type, payload) {
    const event = await this.RunEvent.append({
      runId: run.id,
      type,
      payload,
    });
    this.emitter.emitForSession(run.threadId, SSE_EVENTS.RUN_EVENT, {
      runId: run.id,
      event,
    });
    return event;
  }

  async _failRun(run, error) {
    const failed = await this.Run.updateStatus(run.id, this.Run.STATUS.FAILED, {
      errorCode: this.Run.ERROR_CODE.RUN_UNKNOWN,
      errorDetail: error?.message || String(error),
      surfaceId: "work-agent",
    });
    this.emitter.emitForSession(run.threadId, SSE_EVENTS.RUN_COMPLETED, {
      runId: run.id,
      run: failed,
      status: this.Run.STATUS.FAILED,
      error: error?.message || String(error),
    });
    await this._appendEvent(run, WORK_EVENT_TYPES.STATUS, {
      status: this.Run.STATUS.FAILED,
      message: error?.message || String(error),
      engine: this.name,
    });
  }

  async *streamEvents(runId) {
    const events = await this.RunEvent.listByRun(runId);
    for (const event of events) yield event;
  }

  async approve(runId, input = {}) {
    const approvalId = String(input.approvalId || "");
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending || pending.runId !== runId) {
      return { runId, approvalId, resumed: false };
    }
    const decision = input.decision || (input.approved ? "allow" : "deny");
    pending.resolve(decision === "allow" || decision === "approved");
    return { runId, approvalId, resumed: true };
  }

  async getRun(runId) {
    return this.Run.getById(runId);
  }

  async getArtifacts(runId) {
    return this.RunArtifact.listByRun(runId);
  }

  async cancel(runId) {
    const active = this.activeRuns.get(runId);
    if (active) active.controller.abort();
    const run = await this.Run.updateStatus(runId, this.Run.STATUS.CANCELLED, {
      errorCode: this.Run.ERROR_CODE.RUN_CANCELLED,
      surfaceId: "work-agent",
    });
    return { runId, run };
  }

  async recover(runId) {
    return { runId, run: await this.getRun(runId), recovered: false };
  }

  async shutdown() {
    for (const [runId, active] of this.activeRuns.entries()) {
      active.controller.abort();
      this.activeRuns.delete(runId);
    }
    this.pendingApprovals.clear();
  }
}

module.exports = { MastraEngineAdapter, writeArtifactFile };
