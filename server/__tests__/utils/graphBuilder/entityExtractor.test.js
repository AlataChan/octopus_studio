/**
 * Entity Extractor 模块单元测试
 */

const { hashString } = require("../../../utils/graphBuilder/entityExtractor");

describe("Entity Extractor Module", () => {
  describe("hashString", () => {
    it("should generate consistent hash for same input", () => {
      const hash1 = hashString("test");
      const hash2 = hashString("test");
      expect(hash1).toBe(hash2);
    });

    it("should generate different hash for different input", () => {
      const hash1 = hashString("test1");
      const hash2 = hashString("test2");
      expect(hash1).not.toBe(hash2);
    });

    it("should be case sensitive", () => {
      const hash1 = hashString("Test");
      const hash2 = hashString("test");
      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty string", () => {
      const hash = hashString("");
      expect(hash).toBe("0");
    });

    it("should handle unicode characters", () => {
      const hash = hashString("知识图谱");
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should return hex string", () => {
      const hash = hashString("test");
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  // 注意：extractEntities 和 storeExtractedEntities 需要真实的 LLM 和数据库连接
  // 这些测试应该放在集成测试中
});
