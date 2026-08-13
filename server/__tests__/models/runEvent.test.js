jest.mock("../../utils/prisma", () => ({
  runs: {
    update: jest.fn(),
  },
  run_events: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
}));

const prisma = require("../../utils/prisma");
const { RunEvent } = require("../../models/runEvent");

describe("RunEvent model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma)
    );
  });

  it("allocates sequence atomically, stores the base type, and returns the dotted transport type", async () => {
    prisma.runs.update.mockResolvedValue({ eventSeq: 3 });
    prisma.run_events.create.mockResolvedValue({
      id: "evt-1",
      runId: "run-1",
      seq: 3,
      type: "tool",
      payload: JSON.stringify({ phase: "result", toolName: "summarize_goal" }),
      createdAt: new Date("2026-06-13T12:00:00.000Z"),
    });

    const event = await RunEvent.append({
      runId: "run-1",
      type: "tool.result",
      payload: { toolName: "summarize_goal" },
    });

    expect(prisma.runs.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { eventSeq: { increment: 1 } },
      select: { eventSeq: true },
    });
    expect(prisma.run_events.create).toHaveBeenCalledWith({
      data: {
        runId: "run-1",
        seq: 3,
        type: "tool",
        payload: JSON.stringify({
          toolName: "summarize_goal",
          phase: "result",
        }),
      },
    });
    expect(event.type).toBe("tool.result");
    expect(event.payload).toEqual({
      phase: "result",
      toolName: "summarize_goal",
    });
  });

  it("redacts secret values before persistence", async () => {
    prisma.runs.update.mockResolvedValue({ eventSeq: 1 });
    prisma.run_events.create.mockImplementation(async ({ data }) => ({
      id: "evt-1",
      ...data,
    }));

    await RunEvent.append({
      runId: "run-1",
      type: "step.completed",
      payload: { outputPreview: "Bearer do-not-store" },
    });

    const payload = prisma.run_events.create.mock.calls[0][0].data.payload;
    expect(payload).toContain("[REDACTED]");
    expect(payload).not.toContain("do-not-store");
  });

  it("lists WorkEvents in sequence order and parses payload JSON", async () => {
    prisma.run_events.findMany.mockResolvedValue([
      {
        id: "evt-1",
        runId: "run-1",
        seq: 1,
        type: "status",
        payload: '{"status":"running"}',
      },
    ]);

    const events = await RunEvent.listByRun("run-1");

    expect(prisma.run_events.findMany).toHaveBeenCalledWith({
      where: { runId: "run-1" },
      orderBy: { seq: "asc" },
      take: 200,
    });
    expect(events[0].payload).toEqual({ status: "running" });
    expect(events[0].type).toBe("status");
  });
});
