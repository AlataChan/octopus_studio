/**
 * @fileoverview Agent 配置检查工具
 * @description 检查 Agent 相关配置（如搜索引擎、API Key 等）是否正确配置
 */

/**
 * 搜索引擎配置要求
 */
const SEARCH_ENGINE_CONFIGS = {
  "google-search-engine": {
    name: "Google Custom Search",
    requiredEnvs: ["AGENT_GSE_KEY", "AGENT_GSE_CTX"],
    setupUrl: "https://programmablesearchengine.google.com/controlpanel/create",
    freeQuota: "100次/天",
  },
  "serper-dot-dev": {
    name: "Serper.dev",
    requiredEnvs: ["AGENT_SERPER_DEV_KEY"],
    setupUrl: "https://serper.dev",
    freeQuota: "一次性2,500次",
  },
  "bing-search": {
    name: "Bing Web Search",
    requiredEnvs: ["AGENT_BING_SEARCH_API_KEY"],
    setupUrl: "https://portal.azure.com/",
    freeQuota: "Azure免费层",
  },
  "tavily-search": {
    name: "Tavily",
    requiredEnvs: ["AGENT_TAVILY_API_KEY"],
    setupUrl: "https://tavily.com/",
    freeQuota: "有免费层",
  },
  searchapi: {
    name: "SearchAPI",
    requiredEnvs: ["AGENT_SEARCHAPI_API_KEY"],
    setupUrl: "https://www.searchapi.io/",
    freeQuota: "有免费额度",
  },
  "serply-engine": {
    name: "Serply",
    requiredEnvs: ["AGENT_SERPLY_API_KEY"],
    setupUrl: "https://serply.io",
    freeQuota: "有免费额度",
  },
  "searxng-engine": {
    name: "SearXNG",
    requiredEnvs: ["AGENT_SEARXNG_API_URL"],
    setupUrl: "https://docs.searxng.org/",
    freeQuota: "自托管，免费",
  },
  "duckduckgo-engine": {
    name: "DuckDuckGo",
    requiredEnvs: [],
    setupUrl: null,
    freeQuota: "免费，无需API Key",
  },
  "exa-search": {
    name: "Exa",
    requiredEnvs: ["AGENT_EXA_API_KEY"],
    setupUrl: "https://exa.ai",
    freeQuota: "有免费层",
  },
};

/**
 * Agent 配置检查器
 * @class AgentConfigChecker
 */
class AgentConfigChecker {
  /**
   * 检查所有搜索引擎的配置状态
   * @returns {Object[]} 搜索引擎配置状态数组
   */
  static checkSearchEngines() {
    return Object.entries(SEARCH_ENGINE_CONFIGS).map(([engine, config]) => ({
      engine,
      name: config.name,
      available: config.requiredEnvs.every((env) => !!process.env[env]),
      missing: config.requiredEnvs.filter((env) => !process.env[env]),
      setupUrl: config.setupUrl,
      freeQuota: config.freeQuota,
    }));
  }

  /**
   * 获取可用的搜索引擎列表
   * @returns {string[]} 可用的搜索引擎 ID 数组
   */
  static getAvailableSearchEngines() {
    return this.checkSearchEngines()
      .filter((e) => e.available)
      .map((e) => e.engine);
  }

  /**
   * 检查特定搜索引擎是否可用
   * @param {string} engine - 搜索引擎 ID
   * @returns {boolean} 是否可用
   */
  static isSearchEngineAvailable(engine) {
    const config = SEARCH_ENGINE_CONFIGS[engine];
    if (!config) return false;
    return config.requiredEnvs.every((env) => !!process.env[env]);
  }

  /**
   * 获取搜索引擎配置建议
   * @returns {Object} 配置建议
   */
  static getSearchEngineRecommendation() {
    const available = this.getAvailableSearchEngines();

    if (available.length === 0) {
      return {
        status: "warning",
        message: "未配置任何搜索引擎，Agent 网络搜索功能将不可用",
        recommendation:
          "建议配置 DuckDuckGo（免费，无需 API Key）或 Serper.dev（一次性 2,500 次免费）",
        quickFix: "duckduckgo-engine",
      };
    }

    return {
      status: "ok",
      message: `已配置 ${available.length} 个搜索引擎`,
      available,
    };
  }

  /**
   * 检查 LLM Provider 配置
   * @returns {Object} LLM 配置状态
   */
  static checkLLMConfig() {
    const provider = process.env.LLM_PROVIDER;
    const configs = {
      deepseek: ["DEEPSEEK_API_KEY"],
      openai: ["OPEN_AI_KEY"],
      anthropic: ["ANTHROPIC_API_KEY"],
      ollama: ["OLLAMA_BASE_PATH"],
    };

    if (!provider) {
      return { status: "error", message: "未配置 LLM_PROVIDER" };
    }

    const requiredEnvs = configs[provider] || [];
    const missing = requiredEnvs.filter((env) => !process.env[env]);

    return {
      status: missing.length === 0 ? "ok" : "error",
      provider,
      missing,
    };
  }

  /**
   * 运行完整的配置检查
   * @returns {Object} 完整配置检查结果
   */
  static runFullCheck() {
    return {
      timestamp: new Date().toISOString(),
      llm: this.checkLLMConfig(),
      searchEngines: this.getSearchEngineRecommendation(),
      searchEngineDetails: this.checkSearchEngines(),
    };
  }
}

module.exports = { AgentConfigChecker, SEARCH_ENGINE_CONFIGS };
