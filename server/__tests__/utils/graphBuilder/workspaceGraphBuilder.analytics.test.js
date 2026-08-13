const mockAnalyzeWorkspaceGraph = jest.fn();
const mockApplyAnalytics = jest.fn();
const mockCreateAssistantCollaborationEdges = jest.fn();
const mockGetStats = jest.fn();
const mockKbEnabled = jest.fn();

jest.mock("../../../utils/graphBuilder/graphAnalytics", () => ({
  analyzeWorkspaceGraph: mockAnalyzeWorkspaceGraph,
}));

jest.mock("../../../models/workspaceGraph", () => ({
  WorkspaceGraph: {
    applyAnalytics: mockApplyAnalytics,
    clearWorkspaceGraph: jest.fn(),
    createAssistantCollaborationEdges: mockCreateAssistantCollaborationEdges,
    getStats: mockGetStats,
  },
}));

jest.mock("../../../models/documents", () => ({
  Document: { where: jest.fn(async () => []) },
}));

jest.mock("../../../utils/octopusKb/KbClient", () => ({
  KbClient: jest.fn(() => ({ enabled: mockKbEnabled })),
  buildLlmProfile: jest.fn(),
}));

jest.mock("../../../utils/octopusKb/settings", () => ({
  getOctopusKbCurationLimits: jest.fn(),
  isOctopusKbCurationEnabled: jest.fn(async () => false),
}));

const mockPrisma = {
  workspace_graph_builds: { update: jest.fn(async () => ({})) },
  workspace_graph_nodes: { findMany: jest.fn() },
  workspace_graph_edges: { findMany: jest.fn() },
};

jest.mock("../../../utils/prisma", () => mockPrisma);

describe("WorkspaceGraphBuilder analytics pipeline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKbEnabled.mockResolvedValue(false);
    mockCreateAssistantCollaborationEdges.mockResolvedValue({ created: 0 });
    mockGetStats.mockResolvedValue({ nodeCount: 2, edgeCount: 1 });
    mockPrisma.workspace_graph_nodes.findMany.mockResolvedValue([
      { nodeId: "a" },
      { nodeId: "b" },
    ]);
    mockPrisma.workspace_graph_edges.findMany.mockResolvedValue([
      { fromNodeId: "a", toNodeId: "b", weight: 2 },
    ]);
    mockAnalyzeWorkspaceGraph.mockResolvedValue({
      nodes: new Map([
        ["a", { rank: 1, group: "community-0" }],
        ["b", { rank: 1, group: "community-0" }],
      ]),
      pageRank: { iterations: 1, converged: true },
      louvain: { levels: 1 },
    });
    mockApplyAnalytics.mockResolvedValue({ nodesUpdated: 2 });
  });

  it("computes and persists analytics after all nodes and edges materialize", async () => {
    const {
      WorkspaceGraphBuilder,
    } = require("../../../utils/graphBuilder/workspaceGraphBuilder");

    await WorkspaceGraphBuilder.build({
      workspaceId: 7,
      taskId: "graph-task",
      mode: "incremental",
      options: {
        includeDocs: false,
        includeChats: false,
        includeEpisodes: false,
        computeSimilarity: false,
      },
    });

    expect(mockAnalyzeWorkspaceGraph).toHaveBeenCalledWith({
      nodes: [{ nodeId: "a" }, { nodeId: "b" }],
      edges: [{ fromNodeId: "a", toNodeId: "b", weight: 2 }],
    });
    expect(mockApplyAnalytics).toHaveBeenCalledWith({
      workspaceId: 7,
      analytics: expect.any(Map),
    });
    expect(mockGetStats.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockApplyAnalytics.mock.invocationCallOrder[0]
    );
  });
});
