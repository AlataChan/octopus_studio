"use strict";

const mockSystemGet = jest.fn();
const mockFindWorkspace = jest.fn();
const mockCreateTrajectory = jest.fn();
const mockCountTrajectories = jest.fn();
const mockFindTrajectories = jest.fn();
const mockDeleteTrajectories = jest.fn();
const mockEmbedTextInput = jest.fn();
const mockUpsert = jest.fn();
const mockDeleteByIds = jest.fn();

jest.mock("../../../../models/systemSettings", () => ({
  SystemSettings: {
    get: (...args) => mockSystemGet(...args),
  },
}));

jest.mock("../../../prisma", () => ({
  workspaces: {
    findUnique: (...args) => mockFindWorkspace(...args),
  },
  agent_trajectories: {
    create: (...args) => mockCreateTrajectory(...args),
    count: (...args) => mockCountTrajectories(...args),
    findMany: (...args) => mockFindTrajectories(...args),
    deleteMany: (...args) => mockDeleteTrajectories(...args),
  },
}));

jest.mock("../../../EmbeddingEngines/native", () => ({
  NativeEmbedder: class {
    embedTextInput(...args) {
      return mockEmbedTextInput(...args);
    }
  },
}));

jest.mock("../vectorAdapter", () => ({
  upsert: (...args) => mockUpsert(...args),
  deleteByIds: (...args) => mockDeleteByIds(...args),
}));

const { recordTrajectory } = require("../recorder");

const runMetadata = Object.freeze({
  trajectoryScopeKey: "ws:7:user:42",
  trajectoryNamespace: "traj-ws-7-u-42",
  trajectoryUserId: 42,
  canonicalGoal: "Fix checkout flow",
});

describe("trajectory recorder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSystemGet.mockResolvedValue({ value: "true" });
    mockFindWorkspace.mockResolvedValue({ id: 7, trajectoryMemoryDisabled: false });
    mockCreateTrajectory.mockResolvedValue({
      id: "traj_1",
      createdAt: new Date("2026-07-12T00:00:00.000Z"),
    });
    mockCountTrajectories.mockResolvedValue(1);
    mockFindTrajectories.mockResolvedValue([]);
    mockEmbedTextInput.mockResolvedValue([0.1, 0.2, 0.3]);
    mockUpsert.mockResolvedValue(true);
    mockDeleteByIds.mockResolvedValue(true);
  });

  test("scope null fails closed and writes nothing", async () => {
    const result = await recordTrajectory({
      runId: "run-1",
      workspaceId: 7,
      userId: 42,
      runMetadata: { trajectoryScope: null },
      validatedPlan: [{ assistantId: "worker_1", subtask: "Do work" }],
      outcome: "success",
      successScore: 1,
    });

    expect(result.recorded).toBe(false);
    expect(mockFindWorkspace).not.toHaveBeenCalled();
    expect(mockCreateTrajectory).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("success writes a structured planShapeJson and only keeps safe roles", async () => {
    await recordTrajectory({
      runId: "run-1",
      workspaceId: 7,
      userId: 99,
      runMetadata,
      validatedPlan: [
        { assistantId: "worker_1", subtask: "Do work" },
        { assistantId: "bad]role", subtask: "Should be excluded" },
        { assistantId: "reviewer-2", subtask: "Review" },
      ],
      outcome: "success",
      successScore: 1,
      tokenCost: 123,
      durationMs: 456,
      provider: "openai",
      model: "gpt-4o-mini",
      tier: "C1",
    });

    const createArg = mockCreateTrajectory.mock.calls[0][0];
    expect(createArg.data).toEqual(
      expect.objectContaining({
        runId: "run-1",
        workspaceId: 7,
        userId: 42,
        scopeKey: "ws:7:user:42",
        goal: "Fix checkout flow",
        outcome: "success",
        successScore: 1,
        tokenCost: 123,
        durationMs: 456,
        provider: "openai",
        model: "gpt-4o-mini",
        tier: "C1",
      })
    );
    expect(JSON.parse(createArg.data.planShapeJson)).toEqual({
      v: 1,
      steps: 3,
      roles: ["worker_1", "reviewer-2"],
      outcome: "success",
      successScore: 1,
      tokenCost: 123,
    });
    expect(mockEmbedTextInput).toHaveBeenCalledWith("Fix checkout flow");
    expect(mockUpsert).toHaveBeenCalledWith(
      "traj-ws-7-u-42",
      expect.objectContaining({
        id: "traj_1",
        scopeKey: "ws:7:user:42",
      })
    );
  });

  test("recorder uses frozen run metadata instead of re-deriving resume user scope", async () => {
    await recordTrajectory({
      runId: "run-1",
      workspaceId: 7,
      userId: 777,
      runMetadata,
      validatedPlan: [{ assistantId: "worker_1", subtask: "Do work" }],
      outcome: "partial",
      successScore: 0.5,
    });

    expect(mockCreateTrajectory.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        userId: 42,
        scopeKey: "ws:7:user:42",
      })
    );
    expect(mockCreateTrajectory.mock.calls[0][0].data.scopeKey).not.toBe(
      "ws:7:user:777"
    );
  });

  test("retains at most 500 records per scope and deletes matching vector ids", async () => {
    mockCountTrajectories.mockResolvedValue(502);
    mockFindTrajectories.mockResolvedValue([{ id: "old_1" }, { id: "old_2" }]);

    await recordTrajectory({
      runId: "run-1",
      workspaceId: 7,
      userId: 42,
      runMetadata,
      validatedPlan: [{ assistantId: "worker_1", subtask: "Do work" }],
      outcome: "success",
      successScore: 1,
    });

    expect(mockFindTrajectories).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scopeKey: "ws:7:user:42" },
        orderBy: [{ successScore: "asc" }, { createdAt: "asc" }],
        take: 2,
      })
    );
    expect(mockDeleteTrajectories).toHaveBeenCalledWith({
      where: { id: { in: ["old_1", "old_2"] } },
    });
    expect(mockDeleteByIds).toHaveBeenCalledWith("traj-ws-7-u-42", [
      "old_1",
      "old_2",
    ]);
  });
});
