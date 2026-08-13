/**
 * ProviderRouter 单元测试
 */

const {
  DEPLOYMENT_REGIONS,
  DEFAULT_PROVIDERS,
  detectRegion,
  isProviderAvailable,
  selectProvider,
  getRouterStatus,
} = require("../../utils/AiProviders/providerRouter");

describe("ProviderRouter", () => {
  // 保存原始环境变量
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 每个测试前重置环境变量
    jest.resetModules();
    process.env = { ...originalEnv };
    // 清除所有 API Key
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPEN_AI_KEY;
    delete process.env.OLLAMA_BASE_PATH;
    delete process.env.DEPLOYMENT_REGION;
    delete process.env.DEFAULT_LLM_PROVIDER;
    delete process.env.PREMIUM_LLM_PROVIDER;
    delete process.env.FALLBACK_CHAIN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("DEPLOYMENT_REGIONS", () => {
    it("should have all expected regions", () => {
      expect(DEPLOYMENT_REGIONS.CN).toBe("CN");
      expect(DEPLOYMENT_REGIONS.GLOBAL).toBe("GLOBAL");
      expect(DEPLOYMENT_REGIONS.AUTO).toBe("AUTO");
    });
  });

  describe("DEFAULT_PROVIDERS", () => {
    it("should have correct default values", () => {
      expect(DEFAULT_PROVIDERS.DEFAULT).toBe("deepseek");
      expect(DEFAULT_PROVIDERS.PREMIUM).toBe("anthropic");
    });
  });

  describe("detectRegion", () => {
    it("should return CN when DEPLOYMENT_REGION is CN", () => {
      process.env.DEPLOYMENT_REGION = "CN";
      expect(detectRegion()).toBe("CN");
    });

    it("should return GLOBAL when DEPLOYMENT_REGION is GLOBAL", () => {
      process.env.DEPLOYMENT_REGION = "GLOBAL";
      expect(detectRegion()).toBe("GLOBAL");
    });

    it("should be case-insensitive", () => {
      process.env.DEPLOYMENT_REGION = "cn";
      expect(detectRegion()).toBe("CN");

      process.env.DEPLOYMENT_REGION = "global";
      expect(detectRegion()).toBe("GLOBAL");
    });

    it("should return CN when only DeepSeek is configured", () => {
      process.env.DEEPSEEK_API_KEY = "test-key";
      expect(detectRegion()).toBe("CN");
    });

    it("should return GLOBAL when only Anthropic is configured", () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      expect(detectRegion()).toBe("GLOBAL");
    });

    it("should return CN by default when no keys configured", () => {
      expect(detectRegion()).toBe("CN");
    });
  });

  describe("isProviderAvailable", () => {
    it("should return true when DeepSeek API key is set", () => {
      process.env.DEEPSEEK_API_KEY = "test-key";
      expect(isProviderAvailable("deepseek")).toBe(true);
    });

    it("should return true when Anthropic API key is set", () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      expect(isProviderAvailable("anthropic")).toBe(true);
    });

    it("should return true when OpenAI API key is set", () => {
      // Real OpenAI provider reads OPEN_AI_KEY (server/utils/AiProviders/openAi),
      // so the router availability check must key off the same var.
      process.env.OPEN_AI_KEY = "test-key";
      expect(isProviderAvailable("openai")).toBe(true);
    });

    it("should return true when Ollama base path is set", () => {
      process.env.OLLAMA_BASE_PATH = "http://localhost:11434";
      expect(isProviderAvailable("ollama")).toBe(true);
    });

    it("should return false when provider is not configured", () => {
      expect(isProviderAvailable("deepseek")).toBe(false);
      expect(isProviderAvailable("anthropic")).toBe(false);
    });

    it("should be case-insensitive", () => {
      process.env.DEEPSEEK_API_KEY = "test-key";
      expect(isProviderAvailable("DeepSeek")).toBe(true);
      expect(isProviderAvailable("DEEPSEEK")).toBe(true);
    });

    it("should return false for unknown provider", () => {
      expect(isProviderAvailable("unknown-provider")).toBe(false);
    });
  });

  describe("selectProvider", () => {
    it("should use preferred provider when available", () => {
      process.env.DEEPSEEK_API_KEY = "test-key";
      process.env.ANTHROPIC_API_KEY = "test-key";
      
      const result = selectProvider({ preferredProvider: "anthropic" });
      expect(result).toBe("anthropic");
    });

    it("should use premium provider when enhancedIntelligence is true", () => {
      process.env.DEEPSEEK_API_KEY = "test-key";
      process.env.ANTHROPIC_API_KEY = "test-key";
      
      const result = selectProvider({ enhancedIntelligence: true });
      expect(result).toBe("anthropic");
    });

    it("should use default provider when enhancedIntelligence is false", () => {
      process.env.DEEPSEEK_API_KEY = "test-key";
      process.env.ANTHROPIC_API_KEY = "test-key";
      process.env.DEPLOYMENT_REGION = "CN";
      
      const result = selectProvider({ enhancedIntelligence: false });
      expect(result).toBe("deepseek");
    });

    it("should use Claude for GLOBAL region", () => {
      process.env.DEEPSEEK_API_KEY = "test-key";
      process.env.ANTHROPIC_API_KEY = "test-key";
      process.env.DEPLOYMENT_REGION = "GLOBAL";
      
      const result = selectProvider();
      expect(result).toBe("anthropic");
    });
  });
});

