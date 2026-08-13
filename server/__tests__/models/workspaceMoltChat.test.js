jest.mock("../../utils/prisma", () => ({
  workspace_molt_chats: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { WorkspaceMoltChat } = require("../../models/workspaceMoltChat");

const createdAt = new Date("2026-05-05T00:00:00.000Z");
const baseRow = {
  id: 1,
  workspace_id: 7,
  molt_agent_id: "molt-agent-1",
  scope_key: "user:1",
  created_by_user_id: 1,
  molt_thread_id: "molt-thread-1",
  status: "active",
  last_user_message_at: createdAt,
  created_at: createdAt,
  updated_at: createdAt,
};

describe("WorkspaceMoltChat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("upsert creates a new active Molt chat pointer", async () => {
    prisma.workspace_molt_chats.upsert.mockResolvedValue(baseRow);

    const row = await WorkspaceMoltChat.upsert({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "user:1",
      createdByUserId: 1,
      moltThreadId: "molt-thread-1",
    });

    expect(prisma.workspace_molt_chats.upsert).toHaveBeenCalledWith({
      where: {
        workspace_id_molt_agent_id_scope_key: {
          workspace_id: 7,
          molt_agent_id: "molt-agent-1",
          scope_key: "user:1",
        },
      },
      create: {
        workspace_id: 7,
        molt_agent_id: "molt-agent-1",
        scope_key: "user:1",
        created_by_user_id: 1,
        molt_thread_id: "molt-thread-1",
        status: "active",
        last_user_message_at: expect.any(Date),
      },
      update: {
        molt_thread_id: "molt-thread-1",
        status: "active",
        last_user_message_at: expect.any(Date),
      },
    });
    expect(row).toEqual(baseRow);
  });

  test("upsert updates the unique row without creating a duplicate", async () => {
    prisma.workspace_molt_chats.upsert.mockResolvedValue({
      ...baseRow,
      molt_thread_id: "molt-thread-2",
    });

    const row = await WorkspaceMoltChat.upsert({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "user:1",
      createdByUserId: 1,
      moltThreadId: "molt-thread-2",
    });

    expect(prisma.workspace_molt_chats.upsert.mock.calls[0][0].where).toEqual({
      workspace_id_molt_agent_id_scope_key: {
        workspace_id: 7,
        molt_agent_id: "molt-agent-1",
        scope_key: "user:1",
      },
    });
    expect(prisma.workspace_molt_chats.upsert.mock.calls[0][0].update).toEqual({
      molt_thread_id: "molt-thread-2",
      status: "active",
      last_user_message_at: expect.any(Date),
    });
    expect(row.molt_thread_id).toBe("molt-thread-2");
  });

  test("getActive returns the active row for the exact workspace agent scope", async () => {
    prisma.workspace_molt_chats.findFirst.mockResolvedValue(baseRow);

    const row = await WorkspaceMoltChat.getActive({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "user:1",
    });

    expect(prisma.workspace_molt_chats.findFirst).toHaveBeenCalledWith({
      where: {
        workspace_id: 7,
        molt_agent_id: "molt-agent-1",
        scope_key: "user:1",
        status: "active",
      },
    });
    expect(row).toEqual(baseRow);
  });

  test("getActive returns null when no active row exists", async () => {
    prisma.workspace_molt_chats.findFirst.mockResolvedValue(null);

    await expect(
      WorkspaceMoltChat.getActive({
        workspaceId: 7,
        moltAgentId: "molt-agent-1",
        scopeKey: "user:missing",
      })
    ).resolves.toBeNull();
  });

  test("markStale hides the row from getActive", async () => {
    prisma.workspace_molt_chats.update.mockResolvedValue({
      ...baseRow,
      status: "stale",
    });
    prisma.workspace_molt_chats.findFirst.mockResolvedValue(null);

    await WorkspaceMoltChat.markStale({ id: 1 });
    const row = await WorkspaceMoltChat.getActive({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "user:1",
    });

    expect(prisma.workspace_molt_chats.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: "stale" },
    });
    expect(row).toBeNull();
  });

  test("archive hides the row from getActive", async () => {
    prisma.workspace_molt_chats.update.mockResolvedValue({
      ...baseRow,
      status: "archived",
    });
    prisma.workspace_molt_chats.findFirst.mockResolvedValue(null);

    await WorkspaceMoltChat.archive({ id: 1 });
    const row = await WorkspaceMoltChat.getActive({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "user:1",
    });

    expect(prisma.workspace_molt_chats.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: "archived" },
    });
    expect(row).toBeNull();
  });

  test("bumpLastUserMessage updates last_user_message_at", async () => {
    prisma.workspace_molt_chats.update.mockResolvedValue({
      ...baseRow,
      last_user_message_at: new Date("2026-05-05T01:00:00.000Z"),
    });

    const row = await WorkspaceMoltChat.bumpLastUserMessage({ id: 1 });

    expect(prisma.workspace_molt_chats.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { last_user_message_at: expect.any(Date) },
    });
    expect(row.last_user_message_at.toISOString()).toBe(
      "2026-05-05T01:00:00.000Z"
    );
  });

  test("upsert resets a stale pointer back to active", async () => {
    prisma.workspace_molt_chats.upsert.mockResolvedValue({
      ...baseRow,
      status: "active",
      molt_thread_id: "molt-thread-restored",
    });

    await WorkspaceMoltChat.upsert({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "user:1",
      createdByUserId: 1,
      moltThreadId: "molt-thread-restored",
    });

    expect(prisma.workspace_molt_chats.upsert.mock.calls[0][0].update).toEqual({
      molt_thread_id: "molt-thread-restored",
      status: "active",
      last_user_message_at: expect.any(Date),
    });
  });

  test("same workspace and agent keep user:1 and user:2 in separate scope rows", async () => {
    prisma.workspace_molt_chats.upsert
      .mockResolvedValueOnce(baseRow)
      .mockResolvedValueOnce({ ...baseRow, id: 2, scope_key: "user:2" });

    await WorkspaceMoltChat.upsert({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "user:1",
      createdByUserId: 1,
      moltThreadId: "thread-user-1",
    });
    await WorkspaceMoltChat.upsert({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "user:2",
      createdByUserId: 2,
      moltThreadId: "thread-user-2",
    });

    expect(
      prisma.workspace_molt_chats.upsert.mock.calls.map(
        ([args]) => args.where.workspace_id_molt_agent_id_scope_key.scope_key
      )
    ).toEqual(["user:1", "user:2"]);
  });

  test("workspace-thread and user scopes are independent for the same workspace agent", async () => {
    prisma.workspace_molt_chats.upsert
      .mockResolvedValueOnce({
        ...baseRow,
        scope_key: "workspace-thread:slug-A",
      })
      .mockResolvedValueOnce({ ...baseRow, id: 2, scope_key: "user:1" });

    await WorkspaceMoltChat.upsert({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "workspace-thread:slug-A",
      createdByUserId: 1,
      moltThreadId: "thread-workspace",
    });
    await WorkspaceMoltChat.upsert({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "user:1",
      createdByUserId: 1,
      moltThreadId: "thread-user",
    });

    expect(
      prisma.workspace_molt_chats.upsert.mock.calls.map(
        ([args]) => args.create.scope_key
      )
    ).toEqual(["workspace-thread:slug-A", "user:1"]);
  });

  test("getActive requires scopeKey and never falls back to a cross-scope row", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      WorkspaceMoltChat.getActive({
        workspaceId: 7,
        moltAgentId: "molt-agent-1",
      })
    ).resolves.toBeNull();

    expect(prisma.workspace_molt_chats.findFirst).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("createdByUserId null works for single-user mode", async () => {
    prisma.workspace_molt_chats.upsert.mockResolvedValue({
      ...baseRow,
      created_by_user_id: null,
    });

    await WorkspaceMoltChat.upsert({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "workspace-thread:default",
      createdByUserId: null,
      moltThreadId: "molt-thread-1",
    });

    expect(prisma.workspace_molt_chats.upsert.mock.calls[0][0].create).toEqual(
      expect.objectContaining({ created_by_user_id: null })
    );
  });

  test("createdByUserId is stored for multi-user mode", async () => {
    prisma.workspace_molt_chats.upsert.mockResolvedValue(baseRow);

    await WorkspaceMoltChat.upsert({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "user:1",
      createdByUserId: 1,
      moltThreadId: "molt-thread-1",
    });

    expect(prisma.workspace_molt_chats.upsert.mock.calls[0][0].create).toEqual(
      expect.objectContaining({ created_by_user_id: 1 })
    );
  });

  test("whereWorkspace returns only active rows ordered by latest user message", async () => {
    prisma.workspace_molt_chats.findMany.mockResolvedValue([baseRow]);

    const rows = await WorkspaceMoltChat.whereWorkspace({ workspaceId: 7 });

    expect(prisma.workspace_molt_chats.findMany).toHaveBeenCalledWith({
      where: { workspace_id: 7, status: "active" },
      orderBy: [{ last_user_message_at: "desc" }, { updated_at: "desc" }],
    });
    expect(rows).toEqual([baseRow]);
  });
});
