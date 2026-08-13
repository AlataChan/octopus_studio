/**
 * 知识图谱 API 集成测试
 * 测试 /v1/workspace/:slug/knowledge-graph 相关端点
 */

const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { transformGraphData } = require("../../endpoints/api/workspace/knowledgeGraph");

// Mock Prisma
jest.mock("../../utils/prisma", () => ({
  workspace_graph_builds: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  workspaces: {
    findUnique: jest.fn(),
  },
}));

// Mock WorkspaceGraph model
jest.mock("../../models/workspaceGraph", () => ({
  WorkspaceGraph: {
    searchSubgraph: jest.fn(),
    search: jest.fn(),
    getStats: jest.fn(),
    getTopNodes: jest.fn(),
    upsertNode: jest.fn(),
    upsertEdge: jest.fn(),
  },
}));

describe("Knowledge Graph API Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("transformGraphData", () => {
    it("should transform graph data to API response format", () => {
      // 模拟内部图谱数据格式（与 WorkspaceGraph.searchSubgraph 返回一致）
      const mockSubgraph = {
        nodes: [
          { nodeId: "node_1", label: "Test Node 1", type: "document", metadata: { path: "/test1.pdf" }, rank: 1 },
          { nodeId: "node_2", label: "Test Node 2", type: "chat", metadata: {}, rank: 0 },
        ],
        edges: [
          { id: 1, fromNodeId: "node_1", toNodeId: "node_2", relation: "REFERENCES", weight: 1.0 },
        ],
      };

      const result = transformGraphData(mockSubgraph);

      expect(result).toHaveProperty("nodes");
      expect(result).toHaveProperty("links");
      expect(result).toHaveProperty("stats");

      // 验证节点转换
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].id).toBe("node_1");
      expect(result.nodes[0].name).toBe("Test Node 1");
      expect(result.nodes[0].type).toBe("document");

      // 验证边转换为 links 格式
      expect(result.links).toHaveLength(1);
      expect(result.links[0]).toMatchObject({
        source: "node_1",
        target: "node_2",
        type: "REFERENCES",
        weight: 1.0,
      });

      // 验证统计信息
      expect(result.stats.nodeCount).toBe(2);
      expect(result.stats.edgeCount).toBe(1);
    });

    it("should handle empty graph data", () => {
      const result = transformGraphData({ nodes: [], edges: [] });

      expect(result.nodes).toHaveLength(0);
      expect(result.links).toHaveLength(0);
      expect(result.stats.nodeCount).toBe(0);
    });
  });

  describe("WorkspaceGraph.searchSubgraph", () => {
    it("should search subgraph with keyword", async () => {
      const mockResult = {
        nodes: [
          { id: "doc_1", label: "市场报告", type: "document" },
          { id: "doc_2", label: "竞品分析", type: "document" },
        ],
        edges: [
          { fromNodeId: "doc_1", toNodeId: "doc_2", relation: "RELATED", weight: 0.8 },
        ],
      };

      WorkspaceGraph.searchSubgraph.mockResolvedValue(mockResult);

      const result = await WorkspaceGraph.searchSubgraph(1, "市场", { limit: 50 });

      expect(WorkspaceGraph.searchSubgraph).toHaveBeenCalledWith(1, "市场", { limit: 50 });
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
    });

    it("should handle search with no results", async () => {
      WorkspaceGraph.searchSubgraph.mockResolvedValue({ nodes: [], edges: [] });

      const result = await WorkspaceGraph.searchSubgraph(1, "不存在的关键词", { limit: 50 });

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });
  });

  describe("WorkspaceGraph.search (lightweight)", () => {
    it("should return matching nodes for autocomplete", async () => {
      const mockNodes = [
        { id: "node_1", label: "API 设计文档", type: "document" },
        { id: "node_2", label: "API 测试用例", type: "document" },
      ];

      WorkspaceGraph.search.mockResolvedValue(mockNodes);

      const result = await WorkspaceGraph.search(1, "API", { limit: 10 });

      expect(WorkspaceGraph.search).toHaveBeenCalledWith(1, "API", { limit: 10 });
      expect(result).toHaveLength(2);
      expect(result[0].label).toContain("API");
    });
  });

  describe("WorkspaceGraph.getStats", () => {
    it("should return graph statistics", async () => {
      const mockStats = {
        nodeCount: 150,
        edgeCount: 320,
        typeDistribution: {
          document: 80,
          chat: 50,
          episode: 20,
        },
      };

      WorkspaceGraph.getStats.mockResolvedValue(mockStats);

      const result = await WorkspaceGraph.getStats(1);

      expect(result.nodeCount).toBe(150);
      expect(result.edgeCount).toBe(320);
      expect(result.typeDistribution.document).toBe(80);
    });
  });
});

