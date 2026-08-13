const {
  reconcileAttachedAgents,
  softDeleteStaleAttachments,
} = require("../orphanCleanup");
const { createMoltOrphanScheduler } = require("../scheduler");

function row(overrides = {}) {
  return {
    id: 1,
    workspace_id: 7,
    molt_agent_id: "agent-1",
    enabled: true,
    metadata: null,
    lastSeenAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function monitor(available = true) {
  return { isAvailable: () => available };
}

function brokerWithAgents(agents = []) {
  return {
    listAgents: jest.fn(async () => ({ success: true, agents })),
  };
}

describe("Molt orphan cleanup", () => {
  let model;
  let eventLogs;

  beforeEach(() => {
    jest.useRealTimers();
    model = {
      all: jest.fn(async () => []),
      markOrphaned: jest.fn(async (args) => args),
      markReattached: jest.fn(async (args) => args),
      listOrphanedOlderThan: jest.fn(async () => []),
      softDelete: jest.fn(async (args) => args),
    };
    eventLogs = {
      logEvent: jest.fn(async () => true),
    };
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test("reconcile leaves enabled attachments unchanged when every agent exists", async () => {
    model.all.mockResolvedValue([row({ molt_agent_id: "agent-1" })]);

    const stats = await reconcileAttachedAgents({
      broker: brokerWithAgents([{ id: "agent-1" }]),
      monitor: monitor(true),
      model,
      eventLogs,
    });

    expect(stats).toEqual({ orphaned: 0, reattached: 0, alive: 1 });
    expect(model.markOrphaned).not.toHaveBeenCalled();
    expect(eventLogs.logEvent).not.toHaveBeenCalled();
  });

  test("reconcile marks a missing Molt agent as orphaned and writes audit", async () => {
    model.all.mockResolvedValue([
      row({ workspace_id: 7, molt_agent_id: "missing" }),
    ]);

    const stats = await reconcileAttachedAgents({
      broker: brokerWithAgents([{ id: "agent-1" }]),
      monitor: monitor(true),
      model,
      eventLogs,
    });

    expect(stats.orphaned).toBe(1);
    expect(model.markOrphaned).toHaveBeenCalledWith({
      workspaceId: 7,
      moltAgentId: "missing",
    });
    expect(eventLogs.logEvent).toHaveBeenCalledWith(
      "molt.agent_orphaned",
      expect.objectContaining({
        workspace_id: 7,
        molt_agent_id: "missing",
      }),
      null
    );
  });

  test("reconcile re-enables an orphaned attachment when Molt reports it again", async () => {
    model.all.mockResolvedValue([
      row({
        enabled: false,
        metadata: JSON.stringify({ moltStatus: "orphaned" }),
      }),
    ]);

    const stats = await reconcileAttachedAgents({
      broker: brokerWithAgents([{ id: "agent-1" }]),
      monitor: monitor(true),
      model,
      eventLogs,
    });

    expect(stats.reattached).toBe(1);
    expect(model.markReattached).toHaveBeenCalledWith({
      workspaceId: 7,
      moltAgentId: "agent-1",
    });
    expect(eventLogs.logEvent).toHaveBeenCalledWith(
      "molt.agent_reattached",
      expect.objectContaining({
        workspace_id: 7,
        molt_agent_id: "agent-1",
      }),
      null
    );
  });

  test("reconcile skips the entire run when Molt is offline", async () => {
    const broker = brokerWithAgents([{ id: "agent-1" }]);

    const stats = await reconcileAttachedAgents({
      broker,
      monitor: monitor(false),
      model,
      eventLogs,
    });

    expect(stats).toEqual({
      orphaned: 0,
      reattached: 0,
      alive: 0,
      skipped: true,
      reason: "MOLT_OFFLINE",
    });
    expect(broker.listAgents).not.toHaveBeenCalled();
    expect(model.all).not.toHaveBeenCalled();
  });

  test("reconcile classifies multiple workspaces and agents correctly", async () => {
    model.all.mockResolvedValue([
      row({ id: 1, workspace_id: 7, molt_agent_id: "alive" }),
      row({ id: 2, workspace_id: 7, molt_agent_id: "missing" }),
      row({
        id: 3,
        workspace_id: 8,
        molt_agent_id: "returned",
        enabled: false,
        metadata: JSON.stringify({ moltStatus: "orphaned" }),
      }),
    ]);

    const stats = await reconcileAttachedAgents({
      broker: brokerWithAgents([{ id: "alive" }, { id: "returned" }]),
      monitor: monitor(true),
      model,
      eventLogs,
    });

    expect(stats).toEqual({ orphaned: 1, reattached: 1, alive: 1 });
  });

  test("reconcile skips and logs when broker.listAgents throws", async () => {
    const broker = {
      listAgents: jest.fn(async () => {
        throw new Error("network down");
      }),
    };

    const stats = await reconcileAttachedAgents({
      broker,
      monitor: monitor(true),
      model,
      eventLogs,
    });

    expect(stats.skipped).toBe(true);
    expect(stats.reason).toBe("MOLT_LIST_FAILED");
    expect(console.warn).toHaveBeenCalled();
  });

  test("softDelete ignores orphaned attachments younger than ageDays", async () => {
    model.listOrphanedOlderThan.mockResolvedValue([]);

    const stats = await softDeleteStaleAttachments({
      ageDays: 30,
      model,
      eventLogs,
    });

    expect(stats).toEqual({ deleted: 0 });
    expect(model.softDelete).not.toHaveBeenCalled();
  });

  test("softDelete marks old disabled orphaned attachments and writes audit", async () => {
    model.listOrphanedOlderThan.mockResolvedValue([
      row({ id: 4, enabled: false, molt_agent_id: "old" }),
    ]);

    const stats = await softDeleteStaleAttachments({
      ageDays: 30,
      model,
      eventLogs,
    });

    expect(stats.deleted).toBe(1);
    expect(model.softDelete).toHaveBeenCalledWith({ id: 4 });
    expect(eventLogs.logEvent).toHaveBeenCalledWith(
      "molt.attachment_soft_deleted",
      expect.objectContaining({
        workspace_id: 7,
        molt_agent_id: "old",
      }),
      null
    );
  });

  test("softDelete relies on model filtering so enabled rows are not deleted", async () => {
    await softDeleteStaleAttachments({ ageDays: 30, model, eventLogs });

    expect(model.listOrphanedOlderThan).toHaveBeenCalledWith({ ageDays: 30 });
  });

  test("scheduler starts with an immediate reconcile", () => {
    jest.useFakeTimers();
    const reconcile = jest.fn(async () => ({ orphaned: 0 }));
    const softDelete = jest.fn(async () => ({ deleted: 0 }));
    const scheduler = createMoltOrphanScheduler({ reconcile, softDelete });

    scheduler.start({
      reconcileIntervalMs: 300_000,
      softDeleteIntervalMs: 86_400_000,
    });

    expect(reconcile).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  test("scheduler periodically calls reconcile", () => {
    jest.useFakeTimers();
    const reconcile = jest.fn(async () => ({ orphaned: 0 }));
    const softDelete = jest.fn(async () => ({ deleted: 0 }));
    const scheduler = createMoltOrphanScheduler({ reconcile, softDelete });

    scheduler.start({
      reconcileIntervalMs: 300_000,
      softDeleteIntervalMs: 86_400_000,
    });
    jest.advanceTimersByTime(300_000);

    expect(reconcile).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});
