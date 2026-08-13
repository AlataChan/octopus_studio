jest.mock("../../utils/prisma", () => ({
  $transaction: jest.fn(),
  coding_agent_runs: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  coding_agent_events: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  coding_agent_artifacts: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");

function loadModels() {
  return {
    CodingAgentRun: require("../../models/codingAgentRun").CodingAgentRun,
    CodingAgentEvent: require("../../models/codingAgentEvent").CodingAgentEvent,
    CodingAgentArtifact: require("../../models/codingAgentArtifact").CodingAgentArtifact,
  };
}

describe("coding agent persistence models", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
  });

  test("T-PS1 run/event/artifact wrappers store JSON metadata and parse it on reads", async () => {
    const { CodingAgentRun, CodingAgentEvent, CodingAgentArtifact } = loadModels();
    const createdAt = new Date("2026-07-07T12:00:00.000Z");
    prisma.coding_agent_runs.create.mockResolvedValue({
      id: "run-1",
      sourceRepoPath: "/repo",
      sandboxPath: "/sandbox",
      status: "pending",
      provider: "deepseek",
      model: "deepseek-chat",
      maxTurns: 4,
      totalTurns: 0,
      totalCostUsd: 0,
      metadata: JSON.stringify({ manifest: { sourceHead: "abc" } }),
      createdAt,
      updatedAt: createdAt,
    });
    prisma.coding_agent_events.findFirst.mockResolvedValue(null);
    prisma.coding_agent_events.create.mockResolvedValue({
      id: "evt-1",
      runId: "run-1",
      seq: 1,
      type: "coding.run.created",
      payload: JSON.stringify({ token: "[REDACTED]" }),
      createdAt,
    });
    prisma.coding_agent_artifacts.create.mockResolvedValue({
      id: "art-1",
      runId: "run-1",
      artifactType: "patch",
      storageRef: "inline:patch",
      label: "patch",
      metadata: JSON.stringify({ changedFiles: 1 }),
      createdAt,
    });

    const run = await CodingAgentRun.create({
      id: "run-1",
      sourceRepoPath: "/repo",
      sandboxPath: "/sandbox",
      provider: "deepseek",
      model: "deepseek-chat",
      maxTurns: 4,
      metadata: { manifest: { sourceHead: "abc" } },
    });
    const event = await CodingAgentEvent.append({
      runId: "run-1",
      type: "coding.run.created",
      payload: { apiKey: "sk-test-secret" },
    });
    const artifact = await CodingAgentArtifact.create({
      runId: "run-1",
      artifactType: "patch",
      storageRef: "inline:patch",
      label: "patch",
      metadata: { changedFiles: 1 },
    });

    expect(prisma.coding_agent_runs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "run-1",
        sourceRepoPath: "/repo",
        sandboxPath: "/sandbox",
        metadata: JSON.stringify({ manifest: { sourceHead: "abc" } }),
      }),
    });
    expect(prisma.coding_agent_events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        seq: 1,
        payload: expect.not.stringContaining("sk-test-secret"),
      }),
    });
    expect(run.metadata).toEqual({ manifest: { sourceHead: "abc" } });
    expect(event.payload).toEqual({ token: "[REDACTED]" });
    expect(artifact.metadata).toEqual({ changedFiles: 1 });
  });

  test("T-PS2 appendEvent retries explicit Prisma P2002 sequence collisions and stays monotonic", async () => {
    const { CodingAgentEvent } = loadModels();
    const uniqueError = Object.assign(new Error("unique failed"), {
      code: "P2002",
      meta: { target: ["runId", "seq"] },
    });
    prisma.$transaction
      .mockImplementationOnce(async (fn) => {
        prisma.coding_agent_events.findFirst.mockResolvedValueOnce({ seq: 1 });
        prisma.coding_agent_events.create.mockRejectedValueOnce(uniqueError);
        return fn(prisma);
      })
      .mockImplementationOnce(async (fn) => {
        prisma.coding_agent_events.findFirst.mockResolvedValueOnce({ seq: 2 });
        prisma.coding_agent_events.create.mockResolvedValueOnce({
          id: "evt-2",
          runId: "run-1",
          seq: 3,
          type: "coding.model.delta",
          payload: "{}",
        });
        return fn(prisma);
      });

    const event = await CodingAgentEvent.append({
      runId: "run-1",
      type: "coding.model.delta",
      payload: {},
    });

    expect(event.seq).toBe(3);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
