/**
 * 知识图谱增强功能集成测试
 * @description 测试新增功能的纯函数逻辑，不依赖数据库
 */

describe("Knowledge Graph Enhancement Integration Tests", () => {
  describe("Feature Flags", () => {
    const {
      isFeatureEnabled,
      checkCircuitBreaker,
      recordSuccess,
      recordFailure,
      getAllFeatureFlags,
      KG_FEATURE_FLAGS,
      KG_THROTTLE_CONFIG,
      KG_DEGRADATION_CONFIG,
    } = require("../../utils/graphBuilder/featureFlags");

    beforeEach(() => {
      // 重置熔断器状态
      recordSuccess();
    });

    it("should have correct default feature flag values", () => {
      expect(KG_FEATURE_FLAGS.GUIDED_RETRIEVAL_ENABLED).toBe(false);
      expect(KG_FEATURE_FLAGS.ENTITY_EXTRACTION_ENABLED).toBe(false);
      expect(KG_FEATURE_FLAGS.SIMILARITY_EDGES_ENABLED).toBe(false);
    });

    it("should have reasonable throttle defaults", () => {
      expect(KG_THROTTLE_CONFIG.BUILD_WRITES_PER_SEC).toBeGreaterThan(0);
      expect(KG_THROTTLE_CONFIG.BUILD_BATCH_SIZE).toBeGreaterThan(0);
    });

    it("should have reasonable degradation defaults", () => {
      expect(KG_DEGRADATION_CONFIG.SEARCH_TIMEOUT_MS).toBeGreaterThan(0);
      expect(KG_DEGRADATION_CONFIG.CIRCUIT_BREAKER_THRESHOLD).toBeGreaterThan(0);
    });

    it("should manage circuit breaker state correctly", () => {
      expect(checkCircuitBreaker()).toBe(true);

      // 触发熔断
      const threshold = KG_DEGRADATION_CONFIG.CIRCUIT_BREAKER_THRESHOLD;
      for (let i = 0; i < threshold; i++) {
        recordFailure();
      }

      expect(checkCircuitBreaker()).toBe(false);

      // 重置
      recordSuccess();
      expect(checkCircuitBreaker()).toBe(true);
    });

    it("should return complete configuration", () => {
      const flags = getAllFeatureFlags();

      expect(flags).toHaveProperty("flags");
      expect(flags).toHaveProperty("throttle");
      expect(flags).toHaveProperty("degradation");
      expect(flags).toHaveProperty("guidedRetrieval");
      expect(flags).toHaveProperty("entityExtraction");
      expect(flags).toHaveProperty("similarity");
      expect(flags).toHaveProperty("pathFinder");
      expect(flags).toHaveProperty("circuitBreaker");
    });
  });

  describe("Path Finder Pure Functions", () => {
    const {
      buildAdjacencyList,
      bfsShortestPath,
      buildDetailedPath,
      formatPathAsText,
      formatPathAsMarkdown,
    } = require("../../utils/graphBuilder/pathFinder");

    it("should build bidirectional adjacency list", () => {
      const edges = [
        { fromNodeId: "A", toNodeId: "B", relation: "link", weight: 1.0 },
        { fromNodeId: "B", toNodeId: "C", relation: "tag", weight: 0.5 },
      ];

      const adj = buildAdjacencyList(edges);

      // A should connect to B
      expect(adj.get("A")).toContainEqual(
        expect.objectContaining({ nodeId: "B", relation: "link" })
      );
      // B should connect back to A
      expect(adj.get("B")).toContainEqual(
        expect.objectContaining({ nodeId: "A", relation: "link" })
      );
      // B should also connect to C
      expect(adj.get("B")).toContainEqual(
        expect.objectContaining({ nodeId: "C", relation: "tag" })
      );
    });

    it("should find shortest path using BFS", () => {
      const adj = new Map([
        ["A", [{ nodeId: "B" }, { nodeId: "D" }]],
        ["B", [{ nodeId: "A" }, { nodeId: "C" }]],
        ["C", [{ nodeId: "B" }]],
        ["D", [{ nodeId: "A" }]],
      ]);

      // A -> B -> C (shortest path)
      const path = bfsShortestPath("A", "C", adj, 5, 100);
      expect(path).toEqual(["A", "B", "C"]);
    });

    it("should return null when no path exists", () => {
      const adj = new Map([
        ["A", [{ nodeId: "B" }]],
        ["B", [{ nodeId: "A" }]],
        ["C", []], // C is isolated
      ]);

      const path = bfsShortestPath("A", "C", adj, 5, 100);
      expect(path).toBeNull();
    });

    it("should build detailed path with node info", () => {
      const nodeIds = ["A", "B", "C"];
      const nodesMap = new Map([
        ["A", { nodeId: "A", label: "Start", type: "doc" }],
        ["B", { nodeId: "B", label: "Middle", type: "tag" }],
        ["C", { nodeId: "C", label: "End", type: "entity" }],
      ]);
      const edges = [
        { fromNodeId: "A", toNodeId: "B", relation: "tag" },
        { fromNodeId: "B", toNodeId: "C", relation: "similar" },
      ];

      const path = buildDetailedPath(nodeIds, nodesMap, edges);

      expect(path).toHaveLength(3);
      expect(path[0]).toMatchObject({ label: "Start", type: "doc", relationToNext: "tag" });
      expect(path[1]).toMatchObject({ label: "Middle", type: "tag", relationToNext: "similar" });
      expect(path[2]).toMatchObject({ label: "End", type: "entity" });
    });

    it("should format path as readable text", () => {
      const path = [
        { label: "OAuth", relationToNext: "实现" },
        { label: "JWT", relationToNext: "用于" },
        { label: "用户认证" },
      ];

      const text = formatPathAsText(path);
      expect(text).toBe("OAuth -[实现]→ JWT -[用于]→ 用户认证");
    });

    it("should format path as markdown", () => {
      const path = [
        { label: "Start", type: "doc", relationToNext: "link" },
        { label: "End", type: "entity" },
      ];

      const md = formatPathAsMarkdown(path);
      expect(md).toContain("**推理路径:**");
      expect(md).toContain("🔵"); // 起点标记
      expect(md).toContain("🎯"); // 终点标记
      expect(md).toContain("**Start**");
      expect(md).toContain("**End**");
    });
  });

  describe("Entity Extractor Functions", () => {
    const { hashString } = require("../../utils/graphBuilder/entityExtractor");

    it("should generate consistent hashes", () => {
      const hash1 = hashString("test");
      const hash2 = hashString("test");
      expect(hash1).toBe(hash2);
    });

    it("should generate different hashes for different strings", () => {
      expect(hashString("hello")).not.toBe(hashString("world"));
    });

    it("should be case sensitive", () => {
      expect(hashString("Test")).not.toBe(hashString("test"));
    });

    it("should handle edge cases", () => {
      expect(hashString("")).toBe("0");
      expect(hashString("中文")).toBeTruthy();
      expect(hashString("special!@#$%^&*()")).toBeTruthy();
      expect(hashString("   spaces   ")).toBeTruthy();
    });

    it("should return hex string", () => {
      const hash = hashString("test");
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("Graph Guided Retrieval Helpers", () => {
    const {
      rerankWithGraphBoost,
      mergeResults,
    } = require("../../utils/chats/graphGuidedRetrieval");

    describe("rerankWithGraphBoost", () => {
      it("should boost documents that are in graph expansions", () => {
        const sources = [
          { metadata: { docId: "doc1", score: 0.5, text: "" } },
          { metadata: { docId: "doc2", score: 0.6, text: "" } },
        ];

        const expansions = {
          docIds: ["doc1"],
          tagLabels: [],
        };

        const result = rerankWithGraphBoost(sources, expansions);
        const doc1 = result.find((r) => r.metadata.docId === "doc1");

        expect(doc1.metadata.graphBoost).toBe(0.15);
        expect(doc1.metadata.score).toBe(0.65);
        expect(doc1.metadata.graphEnhanced).toBe(true);
      });

      it("should boost documents containing matching tags", () => {
        const sources = [
          { metadata: { docId: "doc1", score: 0.5, text: "This is about authentication" } },
          { metadata: { docId: "doc2", score: 0.6, text: "Other content" } },
        ];

        const expansions = {
          docIds: [],
          tagLabels: ["Authentication"],
        };

        const result = rerankWithGraphBoost(sources, expansions);
        const doc1 = result.find((r) => r.metadata.docId === "doc1");

        expect(doc1.metadata.graphBoost).toBe(0.05);
      });

      it("should re-sort by boosted score", () => {
        const sources = [
          { metadata: { docId: "doc1", score: 0.5, text: "" } },
          { metadata: { docId: "doc2", score: 0.55, text: "" } },
        ];

        const expansions = {
          docIds: ["doc1"], // doc1 boosted by 0.15 → 0.65 > 0.55
          tagLabels: [],
        };

        const result = rerankWithGraphBoost(sources, expansions);
        expect(result[0].metadata.docId).toBe("doc1");
      });

      it("should handle empty inputs", () => {
        expect(rerankWithGraphBoost([], { docIds: [], tagLabels: [] })).toEqual([]);
        expect(rerankWithGraphBoost(null, { docIds: [], tagLabels: [] })).toEqual(null);
      });
    });

    describe("mergeResults", () => {
      it("should merge and deduplicate results", () => {
        const first = [
          { metadata: { docId: "doc1", score: 0.8 } },
          { metadata: { docId: "doc2", score: 0.7 } },
        ];
        const second = [
          { metadata: { docId: "doc2", score: 0.75 } }, // duplicate
          { metadata: { docId: "doc3", score: 0.6 } },
        ];

        const merged = mergeResults(first, second);

        expect(merged).toHaveLength(3);
        const docIds = merged.map((r) => r.metadata.docId);
        expect(docIds).toContain("doc1");
        expect(docIds).toContain("doc2");
        expect(docIds).toContain("doc3");
      });

      it("should mark second pass results", () => {
        const first = [{ metadata: { docId: "doc1", score: 0.8 } }];
        const second = [{ metadata: { docId: "doc2", score: 0.6 } }];

        const merged = mergeResults(first, second);
        const doc2 = merged.find((r) => r.metadata.docId === "doc2");

        expect(doc2.metadata.fromSecondPass).toBe(true);
      });

      it("should respect max results limit", () => {
        const first = [
          { metadata: { docId: "doc1", score: 0.9 } },
          { metadata: { docId: "doc2", score: 0.8 } },
        ];
        const second = [
          { metadata: { docId: "doc3", score: 0.7 } },
          { metadata: { docId: "doc4", score: 0.6 } },
        ];

        const merged = mergeResults(first, second, 3);
        expect(merged).toHaveLength(3);
      });

      it("should sort by score descending", () => {
        const first = [{ metadata: { docId: "doc1", score: 0.5 } }];
        const second = [{ metadata: { docId: "doc2", score: 0.9 } }];

        const merged = mergeResults(first, second);
        expect(merged[0].metadata.docId).toBe("doc2");
        expect(merged[1].metadata.docId).toBe("doc1");
      });
    });
  });
});
