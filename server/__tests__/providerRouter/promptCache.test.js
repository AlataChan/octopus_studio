/**
 * PromptCacheManager 单元测试
 */

const {
  PromptCacheManager,
  CACHE_STRATEGIES,
  globalCacheManager,
} = require("../../utils/AiProviders/promptCache");

describe("PromptCacheManager", () => {
  describe("CACHE_STRATEGIES", () => {
    it("should have all expected strategies", () => {
      expect(CACHE_STRATEGIES.ANTHROPIC).toBe("anthropic");
      expect(CACHE_STRATEGIES.DEEPSEEK).toBe("deepseek");
      expect(CACHE_STRATEGIES.OPENAI).toBe("openai");
      expect(CACHE_STRATEGIES.NONE).toBe("none");
    });
  });

  describe("constructor", () => {
    it("should initialize with given strategy", () => {
      const manager = new PromptCacheManager(CACHE_STRATEGIES.ANTHROPIC);
      expect(manager.strategy).toBe("anthropic");
    });

    it("should default to NONE strategy", () => {
      const manager = new PromptCacheManager();
      expect(manager.strategy).toBe("none");
    });

    it("should initialize with zero stats", () => {
      const manager = new PromptCacheManager();
      const stats = manager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.savedTokens).toBe(0);
      expect(stats.totalCalls).toBe(0);
    });
  });

  describe("formatForAnthropic", () => {
    let manager;

    beforeEach(() => {
      manager = new PromptCacheManager(CACHE_STRATEGIES.ANTHROPIC);
    });

    it("should add cache_control to string content", () => {
      const result = manager.formatForAnthropic("System prompt");
      expect(result).toEqual([
        {
          type: "text",
          text: "System prompt",
          cache_control: { type: "ephemeral" },
        },
      ]);
    });

    it("should handle array of text objects", () => {
      const input = [{ type: "text", text: "Prompt 1" }];
      const result = manager.formatForAnthropic(input);
      expect(result[0].cache_control).toEqual({ type: "ephemeral" });
    });

    it("should split content at Context marker", () => {
      const input = "System prompt\nContext:\nDocument content here";
      const result = manager.formatForAnthropic(input);
      expect(result).toHaveLength(2);
      expect(result[0].cache_control).toEqual({ type: "ephemeral" });
      expect(result[1].cache_control).toBeUndefined();
    });

    it("should return original when caching disabled", () => {
      manager.enabled = false;
      const input = "System prompt";
      const result = manager.formatForAnthropic(input);
      expect(result).toBe(input);
    });
  });

  describe("formatForDeepSeek", () => {
    let manager;

    beforeEach(() => {
      manager = new PromptCacheManager(CACHE_STRATEGIES.DEEPSEEK);
    });

    it("should wrap messages with cache metadata", () => {
      const messages = [
        { role: "system", content: "System" },
        { role: "user", content: "Hello" },
      ];
      const result = manager.formatForDeepSeek(messages);
      expect(result.messages).toEqual(messages);
      expect(result._cacheEnabled).toBe(true);
    });

    it("should return plain messages when caching disabled", () => {
      manager.enabled = false;
      const messages = [{ role: "user", content: "Hello" }];
      const result = manager.formatForDeepSeek(messages);
      expect(result.messages).toEqual(messages);
      expect(result._cacheEnabled).toBeUndefined();
    });
  });

  describe("updateStats", () => {
    let manager;

    beforeEach(() => {
      manager = new PromptCacheManager(CACHE_STRATEGIES.DEEPSEEK);
    });

    it("should update stats for DeepSeek usage", () => {
      const usage = {
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 50,
      };
      manager.updateStats(CACHE_STRATEGIES.DEEPSEEK, usage);

      const stats = manager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.savedTokens).toBe(100);
      expect(stats.totalCalls).toBe(1);
    });

    it("should count miss when no cache hit", () => {
      const usage = {
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: 100,
      };
      manager.updateStats(CACHE_STRATEGIES.DEEPSEEK, usage);

      const stats = manager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
    });

    it("should update stats for Anthropic usage", () => {
      const usage = {
        cache_creation_input_tokens: 50,
        cache_read_input_tokens: 200,
      };
      manager.updateStats(CACHE_STRATEGIES.ANTHROPIC, usage);

      const stats = manager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.savedTokens).toBe(200);
    });

    it("should accumulate stats across multiple calls", () => {
      manager.updateStats(CACHE_STRATEGIES.DEEPSEEK, {
        prompt_cache_hit_tokens: 100,
      });
      manager.updateStats(CACHE_STRATEGIES.DEEPSEEK, {
        prompt_cache_hit_tokens: 150,
      });

      const stats = manager.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.savedTokens).toBe(250);
      expect(stats.totalCalls).toBe(2);
    });
  });

  describe("getStats", () => {
    it("should calculate hit rate correctly", () => {
      const manager = new PromptCacheManager();
      manager.updateStats(CACHE_STRATEGIES.DEEPSEEK, {
        prompt_cache_hit_tokens: 100,
      });
      manager.updateStats(CACHE_STRATEGIES.DEEPSEEK, {
        prompt_cache_hit_tokens: 100,
      });
      manager.updateStats(CACHE_STRATEGIES.DEEPSEEK, {
        prompt_cache_miss_tokens: 100,
      });

      const stats = manager.getStats();
      expect(stats.hitRate).toBe("66.67%");
    });

    it("should return 0% hit rate when no calls", () => {
      const manager = new PromptCacheManager();
      expect(manager.getStats().hitRate).toBe("0%");
    });
  });

  describe("reset", () => {
    it("should reset all stats to zero", () => {
      const manager = new PromptCacheManager();
      manager.updateStats(CACHE_STRATEGIES.DEEPSEEK, {
        prompt_cache_hit_tokens: 100,
      });

      manager.reset();
      const stats = manager.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.savedTokens).toBe(0);
      expect(stats.totalCalls).toBe(0);
    });
  });

  describe("globalCacheManager", () => {
    it("should be a singleton instance", () => {
      expect(globalCacheManager).toBeInstanceOf(PromptCacheManager);
    });
  });
});

