const mockDeleteWorkspaceMemoryPages = jest.fn();
const mockPrisma = {
  workspace_chats: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  workspace_threads: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  workspaces: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
};
const mockExternalThreadStateDelete = jest.fn();

jest.mock("../../utils/prisma", () => mockPrisma);
jest.mock("../../utils/octopusKb/retention", () => ({
  deleteWorkspaceMemoryPages: mockDeleteWorkspaceMemoryPages,
}));
jest.mock("../../models/externalThreadState", () => ({
  ExternalThreadState: {
    delete: mockExternalThreadStateDelete,
  },
}));

describe("kb memory retention model hooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.workspace_chats.deleteMany.mockResolvedValue({});
    mockPrisma.workspace_threads.deleteMany.mockResolvedValue({});
    mockPrisma.workspaces.delete.mockResolvedValue({});
    mockExternalThreadStateDelete.mockResolvedValue(true);
    mockDeleteWorkspaceMemoryPages.mockResolvedValue({ deleted: true });
  });

  it("does not delete workspace memory when deleting null-thread chats", async () => {
    mockPrisma.workspace_chats.findMany.mockResolvedValue([
      { workspaceId: 7, thread_id: null },
    ]);
    mockPrisma.workspaces.findMany.mockResolvedValue([
      { id: 7, slug: "workspace-a" },
    ]);
    const { WorkspaceChats } = require("../../models/workspaceChats");

    await expect(WorkspaceChats.delete({ id: 99 })).resolves.toBe(true);

    expect(mockDeleteWorkspaceMemoryPages).not.toHaveBeenCalled();
    expect(mockPrisma.workspace_chats.deleteMany).toHaveBeenCalledWith({
      where: { id: 99 },
    });
  });

  it("deletes only the matching thread memory when deleting threaded chats", async () => {
    mockPrisma.workspace_chats.findMany.mockResolvedValue([
      { workspaceId: 7, thread_id: 11 },
      { workspaceId: 7, thread_id: 11 },
      { workspaceId: 7, thread_id: null },
    ]);
    mockPrisma.workspaces.findMany.mockResolvedValue([
      { id: 7, slug: "workspace-a" },
    ]);
    const { WorkspaceChats } = require("../../models/workspaceChats");

    await expect(WorkspaceChats.delete({ workspaceId: 7 })).resolves.toBe(true);

    expect(mockDeleteWorkspaceMemoryPages).toHaveBeenCalledTimes(1);
    expect(mockDeleteWorkspaceMemoryPages).toHaveBeenCalledWith("workspace-a", 11);
  });

  it("deletes matching thread memory from WorkspaceThread.delete", async () => {
    mockPrisma.workspace_threads.findMany.mockResolvedValue([
      { id: 11, workspace_id: 7 },
    ]);
    mockPrisma.workspaces.findMany.mockResolvedValue([
      { id: 7, slug: "workspace-a" },
    ]);
    const { WorkspaceThread } = require("../../models/workspaceThread");

    await expect(WorkspaceThread.delete({ id: 11 })).resolves.toBe(true);

    expect(mockDeleteWorkspaceMemoryPages).toHaveBeenCalledWith("workspace-a", 11);
  });

  it("deletes all workspace memory from Workspace.delete", async () => {
    mockPrisma.workspaces.findFirst.mockResolvedValue({ slug: "workspace-a" });
    const { Workspace } = require("../../models/workspace");

    await expect(Workspace.delete({ id: 7 })).resolves.toBe(true);

    expect(mockDeleteWorkspaceMemoryPages).toHaveBeenCalledWith("workspace-a");
  });
});
