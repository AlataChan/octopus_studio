/**
 * Feature Flags 模块单元测试
 */

const {
  KG_FEATURE_FLAGS,
  KG_THROTTLE_CONFIG,
  KG_DEGRADATION_CONFIG,
  KG_GUIDED_RETRIEVAL_CONFIG,
  isFeatureEnabled,
  checkCircuitBreaker,
  recordSuccess,
  recordFailure,
  getCircuitBreakerStatus,
  withTimeout,
  throttledBatchProcess,
  sleep,
  getAllFeatureFlags,
} = require("../../../utils/graphBuilder/featureFlags");

describe("Feature Flags Module", () => {
  describe("isFeatureEnabled", () => {
    it("should return false for disabled features by default", () => {
      // 默认所有功能都是关闭的
      expect(isFeatureEnabled("GUIDED_RETRIEVAL")).toBe(false);
      expect(isFeatureEnabled("ENTITY_EXTRACTION")).toBe(false);
    });

    it("should handle different naming formats", () => {
      expect(isFeatureEnabled("guided-retrieval")).toBe(false);
      expect(isFeatureEnabled("GUIDED-RETRIEVAL")).toBe(false);
    });
  });

  describe("Circuit Breaker", () => {
    beforeEach(() => {
      // 重置熔断器状态
      for (let i = 0; i < 10; i++) {
        recordSuccess();
      }
    });

    it("should allow requests when circuit is closed", () => {
      expect(checkCircuitBreaker()).toBe(true);
    });

    it("should open circuit after threshold failures", () => {
      const threshold = KG_DEGRADATION_CONFIG.CIRCUIT_BREAKER_THRESHOLD;

      for (let i = 0; i < threshold; i++) {
        recordFailure();
      }

      expect(checkCircuitBreaker()).toBe(false);
      expect(getCircuitBreakerStatus().isOpen).toBe(true);
    });

    it("should reset on success", () => {
      recordFailure();
      recordFailure();
      recordSuccess();

      expect(getCircuitBreakerStatus().failures).toBe(0);
    });
  });

  describe("withTimeout", () => {
    it("should resolve when promise completes in time", async () => {
      const result = await withTimeout(
        Promise.resolve("success"),
        1000,
        "test"
      );
      expect(result).toBe("success");
    });

    it("should reject when promise times out", async () => {
      const slowPromise = new Promise(() => {});

      await expect(
        withTimeout(slowPromise, 50, "test")
      ).rejects.toThrow("timed out");
    });
  });

  describe("sleep", () => {
    it("should wait for specified duration", async () => {
      const start = Date.now();
      await sleep(50);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(45);
    });
  });

  describe("throttledBatchProcess", () => {
    it("should process all items", async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await throttledBatchProcess(
        items,
        async (item) => item * 2,
        { batchSize: 2, sleepMs: 10 }
      );

      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it("should call progress callback", async () => {
      const items = [1, 2, 3, 4];
      const progressCalls = [];

      await throttledBatchProcess(
        items,
        async (item) => item,
        {
          batchSize: 2,
          sleepMs: 10,
          onProgress: (progress) => progressCalls.push(progress),
        }
      );

      expect(progressCalls.length).toBe(2);
      expect(progressCalls[0].processed).toBe(2);
      expect(progressCalls[1].processed).toBe(4);
    });
  });

  describe("getAllFeatureFlags", () => {
    it("should return all configuration", () => {
      const flags = getAllFeatureFlags();

      expect(flags).toHaveProperty("flags");
      expect(flags).toHaveProperty("throttle");
      expect(flags).toHaveProperty("degradation");
      expect(flags).toHaveProperty("guidedRetrieval");
      expect(flags).toHaveProperty("entityExtraction");
      expect(flags).toHaveProperty("circuitBreaker");
    });
  });
});
