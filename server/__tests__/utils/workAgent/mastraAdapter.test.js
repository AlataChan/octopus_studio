const fs = require("fs");
const os = require("os");
const path = require("path");
const { Run } = require("../../../models/run");
const { SSE_EVENTS } = require("../../../utils/liveCanvas/types");

const mockRun = {
  STATUS: Run.STATUS,
  TRIGGER: Run.TRIGGER,
  ERROR_CODE: Run.ERROR_CODE,
  create: jest.fn(),
  updateStatus: jest.fn(),
  getById: jest.fn(),
};
const mockRunEvent = {
  append: jest.fn(async (event) => ({ id: `evt-${event.type}`, ...event })),
  listByRun: jest.fn(),
};
const mockRunArtifact = {
  create: jest.fn(),
  listByRun: jest.fn(),
};
const mockWorkflowPendingConfirmation = {
  create: jest.fn(),
};
const mockEmitter = {
  emitForSession: jest.fn(),
};

function createMastraLoader() {
  return () => ({
    Agent: class {
      constructor(config) {
        this.config = config;
      }

      async generate(goal) {
        await this.config.tools.write_file.execute({
          path: "result.txt",
          content: `Goal: ${goal}\n`,
        });
        const shellResult = await this.config.tools.run_shell.execute({
          command: `${process.execPath} -e "console.log('ok')"`,
        });
        const patch = await this.config.tools.create_patch.execute({});
        return {
          text: `Completed: ${shellResult.stdout.trim()}`,
          usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
          toolCalls: [
            {
              payload: {
                toolCallId: "call-1",
                toolName: "write_file",
                args: { goal },
              },
            },
          ],
          toolResults: [
            {
              payload: {
                toolCallId: "call-1",
                toolName: "create_patch",
                result: patch,
              },
            },
          ],
        };
      }
    },
    createTool: (definition) => definition,
    z: {
      object: () => ({}),
      string: () => ({}),
      boolean: () => ({ optional: () => ({}) }),
    },
  });
}

describe("MastraEngineAdapter", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alata-mastra-adapter-"));
    jest.clearAllMocks();
    mockRun.create.mockResolvedValue({
      id: "run-1",
      threadId: "thread-1",
      workspaceId: 7,
      status: Run.STATUS.QUEUED,
      metadata: "{}",
    });
    mockRun.updateStatus.mockImplementation(async (runId, status) => ({
      id: runId,
      threadId: "thread-1",
      workspaceId: 7,
      status,
      metadata: "{}",
    }));
    mockRunArtifact.create.mockImplementation(async (input) => ({
      id: `artifact-${mockRunArtifact.create.mock.calls.length}`,
      ...input,
      metadata: JSON.stringify(input.metadata || {}),
    }));
    mockWorkflowPendingConfirmation.create.mockResolvedValue({
      id: 101,
      status: "pending",
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a run, executes file/shell/patch tools, emits Live Canvas updates, and completes", async () => {
    const { MastraEngineAdapter } = require("../../../utils/workAgent/engine/mastraAdapter");
    const adapter = new MastraEngineAdapter({
      RunModel: mockRun,
      RunEventModel: mockRunEvent,
      RunArtifactModel: mockRunArtifact,
      WorkflowPendingConfirmationModel: mockWorkflowPendingConfirmation,
      emitter: mockEmitter,
      mastraLoader: createMastraLoader(),
      writeArtifactFile: jest.fn(async () => ({
        storageRef: "work-agent/run-1/summary.json",
        sizeBytes: 42,
      })),
    });

    const result = await adapter.submitGoal({
      goal: "Draft the Phase 1 plan",
      authCtx: { userId: 12 },
      workspace: { id: 7, slug: "demo" },
      thread: { slug: "thread-1" },
      workspaceRoot: tempDir,
      policy: { shellApprovalRequired: false },
      awaitCompletion: true,
    });

    expect(result.runId).toBe("run-1");
    expect(mockRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        workspaceId: 7,
        triggerType: Run.TRIGGER.UI,
        engine: "mastra",
      })
    );
    expect(mockRunEvent.append).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        type: "tool.call",
        payload: expect.objectContaining({ toolName: "write_file" }),
      })
    );
    expect(mockRunArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        artifactType: "patch",
      })
    );
    expect(mockRun.updateStatus).toHaveBeenLastCalledWith(
      "run-1",
      Run.STATUS.SUCCEEDED,
      expect.any(Object)
    );
    expect(mockEmitter.emitForSession).toHaveBeenCalledWith(
      "thread-1",
      SSE_EVENTS.RUN_COMPLETED,
      expect.objectContaining({ runId: "run-1" })
    );
  });

  it("blocks shell execution until an approval resumes the run", async () => {
    const { MastraEngineAdapter } = require("../../../utils/workAgent/engine/mastraAdapter");
    const adapter = new MastraEngineAdapter({
      RunModel: mockRun,
      RunEventModel: mockRunEvent,
      RunArtifactModel: mockRunArtifact,
      WorkflowPendingConfirmationModel: mockWorkflowPendingConfirmation,
      emitter: mockEmitter,
      mastraLoader: createMastraLoader(),
      writeArtifactFile: jest.fn(async () => ({
        storageRef: "work-agent/run-1/artifact",
        sizeBytes: 42,
      })),
    });

    const waitForApproval = async () => {
      for (let i = 0; i < 20; i++) {
        if (mockWorkflowPendingConfirmation.create.mock.calls.length) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("approval was not requested");
    };

    await adapter.submitGoal({
      goal: "Run a command",
      authCtx: { userId: 12 },
      workspace: { id: 7, slug: "demo" },
      thread: { id: 33, slug: "thread-1" },
      workspaceRoot: tempDir,
      awaitCompletion: false,
    });

    await waitForApproval();
    expect(mockWorkflowPendingConfirmation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        planType: "work_agent_shell",
        runId: "run-1",
      })
    );
    expect(mockRun.updateStatus).toHaveBeenCalledWith(
      "run-1",
      Run.STATUS.BLOCKED
    );

    const active = adapter.activeRuns.get("run-1");
    await adapter.approve("run-1", { approvalId: "101", decision: "allow" });
    await active.promise;

    expect(mockRunEvent.append).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        type: "approval.resolved",
        payload: expect.objectContaining({ decision: "allow" }),
      })
    );
    expect(mockRun.updateStatus).toHaveBeenLastCalledWith(
      "run-1",
      Run.STATUS.SUCCEEDED,
      expect.any(Object)
    );
  });
});
