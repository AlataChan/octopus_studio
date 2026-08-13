/**
 * 混合检索模块测试
 */
const {
  HYBRID_CONFIG,
  calculateRecencyScore,
  calculateHybridScore,
  applyHybridRetrieval,
} = require("../../../utils/chats/hybridRetrieval");

describe("hybridRetrieval", () => {
  describe("calculateRecencyScore", () => {
    it("should return ~1.0 for documents created today", () => {
      const today = new Date();
      const score = calculateRecencyScore(today);
      expect(score).toBeCloseTo(1.0, 1);
    });

    it("should return ~0.37 for documents 30 days old (half-life)", () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const score = calculateRecencyScore(thirtyDaysAgo);
      expect(score).toBeCloseTo(0.368, 1); // e^-1 ≈ 0.368
    });

    it("should return ~0.14 for documents 60 days old", () => {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const score = calculateRecencyScore(sixtyDaysAgo);
      expect(score).toBeCloseTo(0.135, 1); // e^-2 ≈ 0.135
    });

    it("should return 0.5 for null/undefined date", () => {
      expect(calculateRecencyScore(null)).toBe(0.5);
      expect(calculateRecencyScore(undefined)).toBe(0.5);
    });

    it("should handle ISO date strings", () => {
      const today = new Date().toISOString();
      const score = calculateRecencyScore(today);
      expect(score).toBeCloseTo(1.0, 1);
    });
  });

  describe("calculateHybridScore", () => {
    it("should apply default weights (0.7 similarity + 0.3 recency)", () => {
      const score = calculateHybridScore(0.8, 0.5);
      // 0.8 * 0.7 + 0.5 * 0.3 = 0.56 + 0.15 = 0.71
      expect(score).toBeCloseTo(0.71, 2);
    });

    it("should allow custom weights", () => {
      const score = calculateHybridScore(0.8, 0.5, { similarity: 0.5, recency: 0.5 });
      // 0.8 * 0.5 + 0.5 * 0.5 = 0.4 + 0.25 = 0.65
      expect(score).toBeCloseTo(0.65, 2);
    });

    it("should handle edge cases (0, 1 scores)", () => {
      expect(calculateHybridScore(1, 1)).toBeCloseTo(1, 2);
      expect(calculateHybridScore(0, 0)).toBeCloseTo(0, 2);
    });
  });

  describe("applyHybridRetrieval", () => {
    const mockSources = [
      { id: 1, title: "Old doc", score: 0.9, published: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 2, title: "Recent doc", score: 0.7, published: new Date().toISOString() },
      { id: 3, title: "Medium doc", score: 0.8, published: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
    ];
    const mockContextTexts = ["Old doc content", "Recent doc content", "Medium doc content"];

    it("should reorder sources by hybrid score", () => {
      const result = applyHybridRetrieval({
        sources: mockSources,
        contextTexts: mockContextTexts,
        enabled: true,
      });

      expect(result.hybridApplied).toBe(true);
      // Recent doc (high recency) should rank higher than old doc (high similarity but low recency)
      expect(result.sources[0].title).not.toBe("Old doc");
      expect(result.sources.length).toBe(3);
    });

    it("should not modify results when disabled", () => {
      const result = applyHybridRetrieval({
        sources: mockSources,
        contextTexts: mockContextTexts,
        enabled: false,
      });

      expect(result.hybridApplied).toBe(false);
      expect(result.sources[0]).toEqual(mockSources[0]);
    });

    it("should handle empty sources", () => {
      const result = applyHybridRetrieval({
        sources: [],
        contextTexts: [],
        enabled: true,
      });

      expect(result.hybridApplied).toBe(false);
      expect(result.sources).toEqual([]);
    });

    it("should add hybrid scores to sources", () => {
      const result = applyHybridRetrieval({
        sources: mockSources,
        contextTexts: mockContextTexts,
        enabled: true,
      });

      result.sources.forEach((source) => {
        expect(source).toHaveProperty("hybridScore");
        expect(source).toHaveProperty("recencyScore");
        expect(source.hybridScore).toBeGreaterThanOrEqual(0);
        expect(source.hybridScore).toBeLessThanOrEqual(1);
      });
    });

    it("should handle sources without date information", () => {
      const sourcesNoDate = [
        { id: 1, title: "No date doc 1", score: 0.9 },
        { id: 2, title: "No date doc 2", score: 0.7 },
      ];

      const result = applyHybridRetrieval({
        sources: sourcesNoDate,
        contextTexts: ["Content 1", "Content 2"],
        enabled: true,
      });

      // Should still work, using default recency of 0.5
      expect(result.hybridApplied).toBe(true);
      expect(result.sources.length).toBe(2);
    });
  });

  describe("HYBRID_CONFIG", () => {
    it("should have correct default values", () => {
      expect(HYBRID_CONFIG.similarityWeight).toBe(0.7);
      expect(HYBRID_CONFIG.recencyWeight).toBe(0.3);
      expect(HYBRID_CONFIG.decayHalfLifeDays).toBe(30);
      expect(HYBRID_CONFIG.enabled).toBe(true);
    });
  });
});

