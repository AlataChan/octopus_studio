/**
 * @fileoverview AgentConfigChecker 单元测试
 */

const { AgentConfigChecker, SEARCH_ENGINE_CONFIGS } = require("../../../../../utils/agents/aibitat/utils/config-checker");

describe("AgentConfigChecker", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("SEARCH_ENGINE_CONFIGS", () => {
    it("should have all expected search engines", () => {
      expect(SEARCH_ENGINE_CONFIGS["google-search-engine"]).toBeDefined();
      expect(SEARCH_ENGINE_CONFIGS["serper-dot-dev"]).toBeDefined();
      expect(SEARCH_ENGINE_CONFIGS["duckduckgo-engine"]).toBeDefined();
      expect(SEARCH_ENGINE_CONFIGS["tavily-search"]).toBeDefined();
    });

    it("should have DuckDuckGo with no required env vars", () => {
      expect(SEARCH_ENGINE_CONFIGS["duckduckgo-engine"].requiredEnvs).toEqual([]);
    });
  });

  describe("checkSearchEngines()", () => {
    it("should return status for all search engines", () => {
      const results = AgentConfigChecker.checkSearchEngines();

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(Object.keys(SEARCH_ENGINE_CONFIGS).length);
    });

    it("should mark DuckDuckGo as available (no env required)", () => {
      const results = AgentConfigChecker.checkSearchEngines();
      const duckduckgo = results.find((r) => r.engine === "duckduckgo-engine");

      expect(duckduckgo.available).toBe(true);
      expect(duckduckgo.missing).toEqual([]);
    });

    it("should mark engines with missing env vars as unavailable", () => {
      delete process.env.AGENT_SERPER_DEV_KEY;

      const results = AgentConfigChecker.checkSearchEngines();
      const serper = results.find((r) => r.engine === "serper-dot-dev");

      expect(serper.available).toBe(false);
      expect(serper.missing).toContain("AGENT_SERPER_DEV_KEY");
    });

    it("should mark engines as available when env vars are set", () => {
      process.env.AGENT_SERPER_DEV_KEY = "test-key";

      const results = AgentConfigChecker.checkSearchEngines();
      const serper = results.find((r) => r.engine === "serper-dot-dev");

      expect(serper.available).toBe(true);
      expect(serper.missing).toEqual([]);
    });
  });

  describe("getAvailableSearchEngines()", () => {
    it("should return only available engines", () => {
      const available = AgentConfigChecker.getAvailableSearchEngines();

      // DuckDuckGo should always be available
      expect(available).toContain("duckduckgo-engine");
    });

    it("should include engines with configured env vars", () => {
      process.env.AGENT_TAVILY_API_KEY = "test-key";

      const available = AgentConfigChecker.getAvailableSearchEngines();

      expect(available).toContain("tavily-search");
    });
  });

  describe("isSearchEngineAvailable()", () => {
    it("should return true for DuckDuckGo", () => {
      expect(AgentConfigChecker.isSearchEngineAvailable("duckduckgo-engine")).toBe(true);
    });

    it("should return false for unknown engine", () => {
      expect(AgentConfigChecker.isSearchEngineAvailable("unknown-engine")).toBe(false);
    });

    it("should return false when required env vars are missing", () => {
      delete process.env.AGENT_SERPER_DEV_KEY;
      expect(AgentConfigChecker.isSearchEngineAvailable("serper-dot-dev")).toBe(false);
    });
  });

  describe("getSearchEngineRecommendation()", () => {
    it("should return ok status when engines are available", () => {
      const recommendation = AgentConfigChecker.getSearchEngineRecommendation();

      // DuckDuckGo is always available
      expect(recommendation.status).toBe("ok");
      expect(recommendation.available).toContain("duckduckgo-engine");
    });
  });

  describe("checkLLMConfig()", () => {
    it("should return error when LLM_PROVIDER is not set", () => {
      delete process.env.LLM_PROVIDER;

      const result = AgentConfigChecker.checkLLMConfig();

      expect(result.status).toBe("error");
      expect(result.message).toBe("未配置 LLM_PROVIDER");
    });

    it("should return ok when provider and key are configured", () => {
      process.env.LLM_PROVIDER = "deepseek";
      process.env.DEEPSEEK_API_KEY = "test-key";

      const result = AgentConfigChecker.checkLLMConfig();

      expect(result.status).toBe("ok");
      expect(result.provider).toBe("deepseek");
    });
  });

  describe("runFullCheck()", () => {
    it("should return complete check results", () => {
      const result = AgentConfigChecker.runFullCheck();

      expect(result.timestamp).toBeDefined();
      expect(result.llm).toBeDefined();
      expect(result.searchEngines).toBeDefined();
      expect(result.searchEngineDetails).toBeDefined();
    });
  });
});

