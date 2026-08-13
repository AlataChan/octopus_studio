/**
 * Path Finder 模块单元测试
 */

const {
  buildAdjacencyList,
  bfsShortestPath,
  buildDetailedPath,
  formatPathAsText,
  formatPathAsMarkdown,
} = require("../../../utils/graphBuilder/pathFinder");

describe("Path Finder Module", () => {
  describe("buildAdjacencyList", () => {
    it("should build bidirectional adjacency list", () => {
      const edges = [
        { fromNodeId: "A", toNodeId: "B", relation: "link", weight: 1 },
        { fromNodeId: "B", toNodeId: "C", relation: "tag", weight: 0.5 },
      ];

      const adjacency = buildAdjacencyList(edges);

      expect(adjacency.get("A")).toContainEqual({
        nodeId: "B",
        relation: "link",
        weight: 1,
      });
      expect(adjacency.get("B")).toContainEqual({
        nodeId: "A",
        relation: "link",
        weight: 1,
      });
      expect(adjacency.get("B")).toContainEqual({
        nodeId: "C",
        relation: "tag",
        weight: 0.5,
      });
    });

    it("should handle empty edges", () => {
      const adjacency = buildAdjacencyList([]);
      expect(adjacency.size).toBe(0);
    });
  });

  describe("bfsShortestPath", () => {
    it("should find direct path", () => {
      const adjacency = new Map([
        ["A", [{ nodeId: "B" }]],
        ["B", [{ nodeId: "A" }]],
      ]);

      const path = bfsShortestPath("A", "B", adjacency, 5, 100);
      expect(path).toEqual(["A", "B"]);
    });

    it("should find multi-hop path", () => {
      const adjacency = new Map([
        ["A", [{ nodeId: "B" }]],
        ["B", [{ nodeId: "A" }, { nodeId: "C" }]],
        ["C", [{ nodeId: "B" }, { nodeId: "D" }]],
        ["D", [{ nodeId: "C" }]],
      ]);

      const path = bfsShortestPath("A", "D", adjacency, 5, 100);
      expect(path).toEqual(["A", "B", "C", "D"]);
    });

    it("should return null when path not found within depth", () => {
      const adjacency = new Map([
        ["A", [{ nodeId: "B" }]],
        ["B", [{ nodeId: "A" }, { nodeId: "C" }]],
        ["C", [{ nodeId: "B" }]],
        // D is disconnected
        ["D", []],
      ]);

      const path = bfsShortestPath("A", "D", adjacency, 3, 100);
      expect(path).toBeNull();
    });

    it("should respect max depth", () => {
      const adjacency = new Map([
        ["A", [{ nodeId: "B" }]],
        ["B", [{ nodeId: "A" }, { nodeId: "C" }]],
        ["C", [{ nodeId: "B" }, { nodeId: "D" }]],
        ["D", [{ nodeId: "C" }]],
      ]);

      // 深度为 2 时找不到 A->D（需要 3 跳）
      const path = bfsShortestPath("A", "D", adjacency, 2, 100);
      expect(path).toBeNull();
    });

    it("should respect max nodes limit", () => {
      const adjacency = new Map([
        ["A", [{ nodeId: "B" }]],
        ["B", [{ nodeId: "A" }, { nodeId: "C" }]],
        ["C", [{ nodeId: "B" }, { nodeId: "D" }]],
        ["D", [{ nodeId: "C" }]],
      ]);

      // 只允许访问 1 个节点，找不到路径
      const path = bfsShortestPath("A", "D", adjacency, 5, 1);
      expect(path).toBeNull();
    });
  });

  describe("buildDetailedPath", () => {
    it("should build detailed path with node info", () => {
      const nodeIds = ["A", "B", "C"];
      const nodesMap = new Map([
        ["A", { nodeId: "A", label: "Start", type: "doc" }],
        ["B", { nodeId: "B", label: "Middle", type: "tag" }],
        ["C", { nodeId: "C", label: "End", type: "entity" }],
      ]);
      const edges = [
        { fromNodeId: "A", toNodeId: "B", relation: "tag", weight: 1 },
        { fromNodeId: "B", toNodeId: "C", relation: "similar", weight: 0.8 },
      ];

      const path = buildDetailedPath(nodeIds, nodesMap, edges);

      expect(path).toHaveLength(3);
      expect(path[0].label).toBe("Start");
      expect(path[0].relationToNext).toBe("tag");
      expect(path[1].label).toBe("Middle");
      expect(path[1].relationToNext).toBe("similar");
      expect(path[2].label).toBe("End");
      expect(path[2].relationToNext).toBeUndefined();
    });
  });

  describe("formatPathAsText", () => {
    it("should format path as readable text", () => {
      const path = [
        { label: "OAuth", relationToNext: "实现" },
        { label: "JWT", relationToNext: "用于" },
        { label: "用户认证" },
      ];

      const text = formatPathAsText(path);
      expect(text).toBe("OAuth -[实现]→ JWT -[用于]→ 用户认证");
    });

    it("should handle empty path", () => {
      expect(formatPathAsText([])).toBe("");
      expect(formatPathAsText(null)).toBe("");
    });

    it("should handle single node path", () => {
      const path = [{ label: "Single" }];
      expect(formatPathAsText(path)).toBe("Single");
    });
  });

  describe("formatPathAsMarkdown", () => {
    it("should format path as markdown", () => {
      const path = [
        { label: "Start", type: "doc", relationToNext: "link" },
        { label: "End", type: "entity" },
      ];

      const md = formatPathAsMarkdown(path);
      expect(md).toContain("**推理路径:**");
      expect(md).toContain("**Start**");
      expect(md).toContain("**End**");
      expect(md).toContain("🔵"); // 起点
      expect(md).toContain("🎯"); // 终点
    });

    it("should handle empty path", () => {
      const md = formatPathAsMarkdown([]);
      expect(md).toContain("No path found");
    });
  });
});
