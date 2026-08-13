jest.mock("../../utils/prisma", () => ({
  workspace_molt_agents: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { WorkspaceMoltAgent } = require("../../models/workspaceMoltAgent");

const baseRow = {
  id: 1,
  workspace_id: 7,
  molt_agent_id: "molt-agent-1",
  display_name: "Matrix Coordinator",
  enabled: true,
  metadata: JSON.stringify({ role: "coordinator" }),
  lastSeenAt: null,
  deletedAt: null,
  created_at: new Date("2026-05-05T00:00:00.000Z"),
  updated_at: new Date("2026-05-05T00:00:00.000Z"),
};

describe("WorkspaceMoltAgent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("attach creates a new workspace Molt agent binding", async () => {
    prisma.workspace_molt_agents.upsert.mockResolvedValue(baseRow);

    const row = await WorkspaceMoltAgent.attach({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      displayName: "Matrix Coordinator",
      metadata: { role: "coordinator" },
    });

    expect(prisma.workspace_molt_agents.upsert).toHaveBeenCalledWith({
      where: {
        workspace_id_molt_agent_id: {
          workspace_id: 7,
          molt_agent_id: "molt-agent-1",
        },
      },
      create: {
        workspace_id: 7,
        molt_agent_id: "molt-agent-1",
        display_name: "Matrix Coordinator",
        metadata: JSON.stringify({ role: "coordinator" }),
        deletedAt: null,
      },
      update: {
        display_name: "Matrix Coordinator",
        metadata: JSON.stringify({ role: "coordinator" }),
        deletedAt: null,
      },
    });
    expect(row).toEqual(baseRow);
  });

  test("attach updates existing metadata without resetting disabled state", async () => {
    prisma.workspace_molt_agents.upsert.mockResolvedValue({
      ...baseRow,
      enabled: false,
      display_name: "Renamed",
    });

    const row = await WorkspaceMoltAgent.attach({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      displayName: "Renamed",
    });

    expect(prisma.workspace_molt_agents.upsert.mock.calls[0][0].update).not.toHaveProperty(
      "enabled"
    );
    expect(row.enabled).toBe(false);
    expect(row.display_name).toBe("Renamed");
  });

  test("where returns all Molt agent bindings for a workspace including disabled rows", async () => {
    prisma.workspace_molt_agents.findMany.mockResolvedValue([
      baseRow,
      { ...baseRow, id: 2, molt_agent_id: "molt-agent-2", enabled: false },
    ]);

    const rows = await WorkspaceMoltAgent.where({ workspaceId: 7 });

    expect(prisma.workspace_molt_agents.findMany).toHaveBeenCalledWith({
      where: { workspace_id: 7, deletedAt: null },
      orderBy: [{ enabled: "desc" }, { created_at: "asc" }],
    });
    expect(rows).toHaveLength(2);
  });

  test("where can return only enabled Molt agent bindings", async () => {
    prisma.workspace_molt_agents.findMany.mockResolvedValue([baseRow]);

    const rows = await WorkspaceMoltAgent.where({
      workspaceId: 7,
      enabledOnly: true,
    });

    expect(prisma.workspace_molt_agents.findMany).toHaveBeenCalledWith({
      where: { workspace_id: 7, enabled: true, deletedAt: null },
      orderBy: [{ enabled: "desc" }, { created_at: "asc" }],
    });
    expect(rows).toEqual([baseRow]);
  });

  test("get returns one Molt agent binding by workspace and Molt agent id", async () => {
    prisma.workspace_molt_agents.findUnique.mockResolvedValue(baseRow);

    const row = await WorkspaceMoltAgent.get({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
    });

    expect(prisma.workspace_molt_agents.findUnique).toHaveBeenCalledWith({
      where: {
        workspace_id_molt_agent_id: {
          workspace_id: 7,
          molt_agent_id: "molt-agent-1",
        },
      },
    });
    expect(row).toEqual(baseRow);
  });

  test("where can include soft-deleted Molt agent bindings on request", async () => {
    prisma.workspace_molt_agents.findMany.mockResolvedValue([
      baseRow,
      { ...baseRow, id: 2, deletedAt: new Date("2026-05-05T01:00:00.000Z") },
    ]);

    const rows = await WorkspaceMoltAgent.where({
      workspaceId: 7,
      includeSoftDeleted: true,
    });

    expect(prisma.workspace_molt_agents.findMany).toHaveBeenCalledWith({
      where: { workspace_id: 7 },
      orderBy: [{ enabled: "desc" }, { created_at: "asc" }],
    });
    expect(rows).toHaveLength(2);
  });

  test("disable keeps the row and sets enabled false", async () => {
    prisma.workspace_molt_agents.update.mockResolvedValue({
      ...baseRow,
      enabled: false,
    });

    const row = await WorkspaceMoltAgent.disable({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
    });

    expect(prisma.workspace_molt_agents.update).toHaveBeenCalledWith({
      where: {
        workspace_id_molt_agent_id: {
          workspace_id: 7,
          molt_agent_id: "molt-agent-1",
        },
      },
      data: { enabled: false },
    });
    expect(row.enabled).toBe(false);
  });

  test("enable sets enabled true", async () => {
    prisma.workspace_molt_agents.update.mockResolvedValue(baseRow);

    const row = await WorkspaceMoltAgent.enable({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
    });

    expect(prisma.workspace_molt_agents.update).toHaveBeenCalledWith({
      where: {
        workspace_id_molt_agent_id: {
          workspace_id: 7,
          molt_agent_id: "molt-agent-1",
        },
      },
      data: { enabled: true, deletedAt: null },
    });
    expect(row.enabled).toBe(true);
  });

  test("remove deletes the Molt agent binding", async () => {
    prisma.workspace_molt_agents.delete.mockResolvedValue(baseRow);

    await expect(
      WorkspaceMoltAgent.remove({
        workspaceId: 7,
        moltAgentId: "molt-agent-1",
      })
    ).resolves.toBe(true);

    expect(prisma.workspace_molt_agents.delete).toHaveBeenCalledWith({
      where: {
        workspace_id_molt_agent_id: {
          workspace_id: 7,
          molt_agent_id: "molt-agent-1",
        },
      },
    });
  });

  test("duplicate attach for the same workspace and Molt agent does not throw", async () => {
    prisma.workspace_molt_agents.upsert.mockResolvedValue(baseRow);

    await expect(
      WorkspaceMoltAgent.attach({
        workspaceId: 7,
        moltAgentId: "molt-agent-1",
      })
    ).resolves.toEqual(baseRow);
  });

  test("same Molt agent can be attached to different workspaces independently", async () => {
    prisma.workspace_molt_agents.upsert
      .mockResolvedValueOnce(baseRow)
      .mockResolvedValueOnce({ ...baseRow, id: 2, workspace_id: 8 });

    await WorkspaceMoltAgent.attach({ workspaceId: 7, moltAgentId: "molt-agent-1" });
    await WorkspaceMoltAgent.attach({ workspaceId: 8, moltAgentId: "molt-agent-1" });

    expect(
      prisma.workspace_molt_agents.upsert.mock.calls.map(
        ([args]) => args.where.workspace_id_molt_agent_id.workspace_id
      )
    ).toEqual([7, 8]);
  });

  test("markOrphaned disables a binding, records lastSeenAt, and stores orphan metadata", async () => {
    prisma.workspace_molt_agents.findUnique.mockResolvedValue(baseRow);
    prisma.workspace_molt_agents.update.mockResolvedValue({
      ...baseRow,
      enabled: false,
      metadata: JSON.stringify({ role: "coordinator", moltStatus: "orphaned" }),
    });

    const row = await WorkspaceMoltAgent.markOrphaned({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
    });

    expect(prisma.workspace_molt_agents.update).toHaveBeenCalledWith({
      where: {
        workspace_id_molt_agent_id: {
          workspace_id: 7,
          molt_agent_id: "molt-agent-1",
        },
      },
      data: expect.objectContaining({
        enabled: false,
        lastSeenAt: expect.any(Date),
        metadata: JSON.stringify({
          role: "coordinator",
          moltStatus: "orphaned",
        }),
      }),
    });
    expect(row.enabled).toBe(false);
  });

  test("markReattached enables a previously orphaned binding", async () => {
    prisma.workspace_molt_agents.findUnique.mockResolvedValue({
      ...baseRow,
      enabled: false,
      metadata: JSON.stringify({ role: "coordinator", moltStatus: "orphaned" }),
    });
    prisma.workspace_molt_agents.update.mockResolvedValue({
      ...baseRow,
      enabled: true,
      metadata: JSON.stringify({ role: "coordinator", moltStatus: "active" }),
    });

    const row = await WorkspaceMoltAgent.markReattached({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
    });

    expect(prisma.workspace_molt_agents.update).toHaveBeenCalledWith({
      where: {
        workspace_id_molt_agent_id: {
          workspace_id: 7,
          molt_agent_id: "molt-agent-1",
        },
      },
      data: expect.objectContaining({
        enabled: true,
        deletedAt: null,
        lastSeenAt: expect.any(Date),
        metadata: JSON.stringify({
          role: "coordinator",
          moltStatus: "active",
        }),
      }),
    });
    expect(row.enabled).toBe(true);
  });

  test("softDelete marks a binding deleted without removing the row", async () => {
    prisma.workspace_molt_agents.update.mockResolvedValue({
      ...baseRow,
      enabled: false,
      deletedAt: new Date("2026-05-05T02:00:00.000Z"),
    });

    const row = await WorkspaceMoltAgent.softDelete({ id: 1 });

    expect(prisma.workspace_molt_agents.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        enabled: false,
        deletedAt: expect.any(Date),
      },
    });
    expect(row.deletedAt).toBeInstanceOf(Date);
  });

  test("listOrphanedOlderThan returns disabled orphaned bindings older than ageDays", async () => {
    prisma.workspace_molt_agents.findMany.mockResolvedValue([baseRow]);

    const rows = await WorkspaceMoltAgent.listOrphanedOlderThan({ ageDays: 30 });

    expect(prisma.workspace_molt_agents.findMany).toHaveBeenCalledWith({
      where: {
        enabled: false,
        deletedAt: null,
        lastSeenAt: { lt: expect.any(Date) },
        metadata: { contains: '"moltStatus":"orphaned"' },
      },
      orderBy: [{ lastSeenAt: "asc" }],
    });
    expect(rows).toEqual([baseRow]);
  });
});
