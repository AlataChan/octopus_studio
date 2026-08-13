const mockClearWorkspace = jest.fn();

jest.mock("../../utils/chats/graphCache", () => ({
  graphCache: {
    clearWorkspace: mockClearWorkspace,
  },
}));

const mockTx = {
  workspace_graph_edges: {
    deleteMany: jest.fn(async () => ({ count: 3 })),
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => null),
    create: jest.fn(async () => ({})),
    update: jest.fn(async () => ({})),
  },
  workspace_graph_nodes: {
    deleteMany: jest.fn(async () => ({ count: 2 })),
    findMany: jest.fn(async () => []),
    upsert: jest.fn(async () => ({})),
    update: jest.fn(async () => ({})),
  },
};

const mockPrisma = {
  $transaction: jest.fn(async (handler) => handler(mockTx)),
  workspace_graph_edges: {
    deleteMany: jest.fn(),
  },
  workspace_graph_nodes: {
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
};

jest.mock("../../utils/prisma", () => mockPrisma);

describe("WorkspaceGraph octopus-kb replacement helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (handler) =>
      handler(mockTx)
    );
    mockTx.workspace_graph_edges.deleteMany.mockResolvedValue({ count: 3 });
    mockTx.workspace_graph_nodes.deleteMany.mockResolvedValue({ count: 2 });
    mockTx.workspace_graph_edges.findMany.mockResolvedValue([]);
    mockTx.workspace_graph_edges.findFirst.mockResolvedValue(null);
    mockTx.workspace_graph_edges.create.mockResolvedValue({});
    mockTx.workspace_graph_edges.update.mockResolvedValue({});
    mockTx.workspace_graph_nodes.findMany.mockResolvedValue([]);
    mockTx.workspace_graph_nodes.upsert.mockResolvedValue({});
    mockPrisma.workspace_graph_nodes.upsert.mockResolvedValue({ id: 1 });
  });

  it("clears graph rows transactionally for only the target workspace", async () => {
    const { WorkspaceGraph } = require("../../models/workspaceGraph");

    await expect(WorkspaceGraph.clearWorkspaceGraph(42)).resolves.toEqual({
      edgesDeleted: 3,
      nodesDeleted: 2,
    });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.workspace_graph_edges.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: 42 },
    });
    expect(mockTx.workspace_graph_nodes.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: 42 },
    });
    expect(mockClearWorkspace).toHaveBeenCalledWith(42);
  });

  it("replaces only kb projection rows and preserves non-kb graph rows", async () => {
    mockTx.workspace_graph_nodes.findMany.mockResolvedValue([
      {
        nodeId: "page:wiki/old.md",
        metadata: JSON.stringify({ source: "kb" }),
      },
      {
        nodeId: "custom-note",
        metadata: JSON.stringify({ note: 'literal "source":"kb" text' }),
      },
    ]);
    const { WorkspaceGraph } = require("../../models/workspaceGraph");

    await expect(
      WorkspaceGraph.replaceKbProjectionGraph({
        workspaceId: 42,
        nodes: [
          {
            nodeId: "page:wiki/new.md",
            type: "concept",
            label: "New",
            group: "kb",
            metadata: { source: "kb" },
          },
        ],
        edges: [
          {
            fromNodeId: "page:wiki/new.md",
            toNodeId: "page:wiki/target.md",
            relation: "reference",
            group: "kb",
            metadata: { source: "kb" },
          },
        ],
      })
    ).resolves.toEqual({ nodesCreated: 1, edgesCreated: 1 });

    expect(mockTx.workspace_graph_nodes.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 42 },
      select: { nodeId: true, metadata: true },
    });
    expect(mockTx.workspace_graph_edges.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 42,
        OR: [
          { group: "kb" },
          { fromNodeId: { in: ["page:wiki/old.md"] } },
          { toNodeId: { in: ["page:wiki/old.md"] } },
        ],
      },
    });
    expect(mockTx.workspace_graph_nodes.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 42,
        nodeId: { in: ["page:wiki/old.md"] },
      },
    });
    expect(mockTx.workspace_graph_nodes.deleteMany).not.toHaveBeenCalledWith({
      where: { workspaceId: 42 },
    });
    expect(mockTx.workspace_graph_nodes.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ group: null }),
        update: expect.objectContaining({ group: null }),
      })
    );
    expect(mockTx.workspace_graph_edges.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ group: "kb" }),
      })
    );
  });

  it("atomically persists computed ranks and deterministic communities", async () => {
    const { WorkspaceGraph } = require("../../models/workspaceGraph");

    await expect(
      WorkspaceGraph.applyAnalytics({
        workspaceId: 42,
        analytics: new Map([
          ["a", { rank: 1, group: "community-0" }],
          ["b", { rank: 0.5, group: "community-1" }],
        ]),
      })
    ).resolves.toEqual({ nodesUpdated: 2 });

    expect(mockTx.workspace_graph_nodes.update).toHaveBeenNthCalledWith(1, {
      where: { workspaceId_nodeId: { workspaceId: 42, nodeId: "a" } },
      data: { rank: 1, group: "community-0" },
    });
    expect(mockTx.workspace_graph_nodes.update).toHaveBeenNthCalledWith(2, {
      where: { workspaceId_nodeId: { workspaceId: 42, nodeId: "b" } },
      data: { rank: 0.5, group: "community-1" },
    });
    expect(mockClearWorkspace).toHaveBeenCalledWith(42);
  });

  it("preserves computed analytics when a producer omits those fields", async () => {
    const { WorkspaceGraph } = require("../../models/workspaceGraph");

    await WorkspaceGraph.upsertNode({
      workspaceId: 42,
      nodeId: "memory-a",
      type: "memory",
      label: "Memory",
      metadata: { accessCount: 2 },
    });

    expect(mockPrisma.workspace_graph_nodes.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId_nodeId: { workspaceId: 42, nodeId: "memory-a" },
      },
      update: expect.not.objectContaining({ group: expect.anything() }),
      create: expect.objectContaining({ group: null, rank: null }),
    });
    const update =
      mockPrisma.workspace_graph_nodes.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty("group");
    expect(update).not.toHaveProperty("rank");
  });
});
