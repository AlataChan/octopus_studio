/**
 * AI System 端点单元测试
 */

const { getRouterStatus, selectProvider } = require("../../utils/AiProviders/providerRouter");
const { globalCacheManager, CACHE_STRATEGIES } = require("../../utils/AiProviders/promptCache");
const { toolStats } = require("../../utils/agents/toolStats");

describe("AI System Modules", () => {
  // 保存原始环境变量
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // 设置测试环境
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    // 固定部署区域，避免默认 provider 选择依赖宿主机时区（detectRegion 的 AUTO
    // 启发式会在 GLOBAL 区域返回 anthropic，导致该测试在非 CN 时区机器上不稳定）
    process.env.DEPLOYMENT_REGION = "CN";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("ProviderRouter Integration", () => {
    it("should return complete router status", () => {
      const status = getRouterStatus();

      expect(status).toHaveProperty("region");
      expect(status).toHaveProperty("defaultProvider");
      expect(status).toHaveProperty("premiumProvider");
      expect(status).toHaveProperty("availableProviders");

      expect(status.availableProviders).toHaveProperty("deepseek");
      expect(status.availableProviders).toHaveProperty("anthropic");
      expect(status.availableProviders).toHaveProperty("openai");
      expect(status.availableProviders).toHaveProperty("ollama");
    });

    it("should select correct provider based on options", () => {
      // Default should be deepseek
      expect(selectProvider()).toBe("deepseek");

      // With enhancedIntelligence should use premium
      expect(selectProvider({ enhancedIntelligence: true })).toBe("anthropic");

      // With preferred provider should use that
      expect(selectProvider({ preferredProvider: "anthropic" })).toBe("anthropic");
    });
  });

  describe("PromptCacheManager Integration", () => {
    beforeEach(() => {
      globalCacheManager.reset();
    });

    it("should be a global singleton", () => {
      expect(globalCacheManager).toBeDefined();
      expect(globalCacheManager.enabled).toBe(true);
    });

    it("should track cache statistics", () => {
      // Simulate some cache hits
      globalCacheManager.updateStats(CACHE_STRATEGIES.DEEPSEEK, {
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 50,
      });

      const stats = globalCacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.savedTokens).toBe(100);
      expect(stats.totalCalls).toBe(1);
    });

    it("should reset statistics correctly", () => {
      globalCacheManager.updateStats(CACHE_STRATEGIES.ANTHROPIC, {
        cache_read_input_tokens: 200,
      });

      globalCacheManager.reset();
      const stats = globalCacheManager.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.savedTokens).toBe(0);
      expect(stats.totalCalls).toBe(0);
    });
  });

  describe("ToolStats Integration", () => {
    beforeEach(() => {
      toolStats.reset();
    });

    it("should track tool calls", () => {
      // 使用 startCall + endCall 模式
      const callId1 = toolStats.startCall("web-search");
      toolStats.endCall("web-search", callId1, true);

      const callId2 = toolStats.startCall("web-search");
      toolStats.endCall("web-search", callId2, true);

      const callId3 = toolStats.startCall("rag-retrieval");
      toolStats.endCall("rag-retrieval", callId3, false);

      const allStats = toolStats.getAllStats();
      expect(allStats.summary.totalCalls).toBe(3);
      expect(allStats.summary.totalSuccess).toBe(2);
      expect(allStats.summary.totalFailed).toBe(1);
    });

    it("should return top tools", () => {
      const callId1 = toolStats.startCall("tool-a");
      toolStats.endCall("tool-a", callId1, true);

      const callId2 = toolStats.startCall("tool-a");
      toolStats.endCall("tool-a", callId2, true);

      const callId3 = toolStats.startCall("tool-b");
      toolStats.endCall("tool-b", callId3, true);

      const topTools = toolStats.getTopTools(2);
      expect(topTools[0].name).toBe("tool-a");
      expect(topTools[0].totalCalls).toBe(2);
    });

    it("should reset correctly", () => {
      const callId = toolStats.startCall("test-tool");
      toolStats.endCall("test-tool", callId, true);
      toolStats.reset();

      const stats = toolStats.getAllStats();
      expect(stats.summary.totalCalls).toBe(0);
    });
  });

  describe("AI System Status Structure", () => {
    it("should provide all data needed for Admin panel", () => {
      // This test verifies the data structure expected by the frontend
      const routerStatus = getRouterStatus();
      const cacheStats = globalCacheManager.getStats();
      const toolStatsData = toolStats.getAllStats();

      // Build expected API response structure
      const apiResponse = {
        provider: {
          current: selectProvider(),
          region: routerStatus.region,
          default: routerStatus.defaultProvider,
          premium: routerStatus.premiumProvider,
          available: routerStatus.availableProviders,
        },
        cache: {
          enabled: globalCacheManager.enabled,
          strategy: globalCacheManager.strategy,
          stats: cacheStats,
        },
        tools: {
          totalCalls: Object.values(toolStatsData.tools || [])
            .reduce((sum, t) => sum + (t.calls || 0), 0),
          topTools: toolStats.getTopTools(5),
        },
      };

      // Verify structure
      expect(apiResponse.provider.current).toBeDefined();
      expect(apiResponse.provider.region).toBeDefined();
      expect(apiResponse.cache.enabled).toBeDefined();
      expect(apiResponse.tools.topTools).toBeInstanceOf(Array);
    });
  });
});

