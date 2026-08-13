/**
 * PromptCacheManager - 统一的 Prompt 缓存抽象层
 * 为不同 LLM Provider 提供统一的缓存接口
 *
 * 支持的 Provider:
 * - Anthropic: 使用 cache_control 标记
 * - DeepSeek: 使用 Context Caching API
 * - OpenAI: 自动缓存，无需特殊处理
 */

const CACHE_STRATEGIES = {
  ANTHROPIC: "anthropic",
  DEEPSEEK: "deepseek",
  OPENAI: "openai",
  NONE: "none",
};

/**
 * 统一的缓存统计结构
 */
class CacheStats {
  constructor() {
    this.hits = 0;
    this.misses = 0;
    this.savedTokens = 0;
    this.totalCalls = 0;
  }

  recordHit(savedTokens = 0) {
    this.hits++;
    this.totalCalls++;
    this.savedTokens += savedTokens;
  }

  recordMiss() {
    this.misses++;
    this.totalCalls++;
  }

  getHitRate() {
    if (this.totalCalls === 0) return 0;
    return ((this.hits / this.totalCalls) * 100).toFixed(2);
  }

  toJSON() {
    return {
      hits: this.hits,
      misses: this.misses,
      savedTokens: this.savedTokens,
      totalCalls: this.totalCalls,
      hitRate: `${this.getHitRate()}%`,
    };
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
    this.savedTokens = 0;
    this.totalCalls = 0;
  }
}

/**
 * PromptCacheManager - 核心缓存管理器
 */
class PromptCacheManager {
  constructor(strategy = CACHE_STRATEGIES.NONE) {
    this.strategy = strategy;
    this.stats = new CacheStats();
    this.enabled = true;
  }

  /**
   * 根据 Provider 类型获取对应的缓存策略
   * @param {string} providerName - Provider 名称
   * @returns {string} 缓存策略
   */
  static getStrategyForProvider(providerName) {
    const strategies = {
      anthropic: CACHE_STRATEGIES.ANTHROPIC,
      deepseek: CACHE_STRATEGIES.DEEPSEEK,
      openai: CACHE_STRATEGIES.OPENAI,
      "azure-openai": CACHE_STRATEGIES.OPENAI,
    };
    return strategies[providerName?.toLowerCase()] || CACHE_STRATEGIES.NONE;
  }

  /**
   * 为 Anthropic 格式化 System Prompt（带缓存标记）
   * @param {string} systemContent - System prompt 内容
   * @returns {Array|string} 格式化后的内容
   */
  formatForAnthropic(systemContent) {
    if (!this.enabled) return systemContent;

    const contextMarker = "\nContext:\n";
    const contextIndex = systemContent.indexOf(contextMarker);

    if (contextIndex === -1) {
      return [
        {
          type: "text",
          text: systemContent,
          cache_control: { type: "ephemeral" },
        },
      ];
    }

    const basePrompt = systemContent.substring(0, contextIndex);
    const contextPart = systemContent.substring(contextIndex);

    return [
      {
        type: "text",
        text: basePrompt,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: contextPart,
      },
    ];
  }

  /**
   * 为 DeepSeek 格式化消息（带缓存标记）
   * DeepSeek 使用 prefix_caching 参数
   * @param {Array} messages - 消息数组
   * @returns {Object} 格式化后的请求参数
   */
  formatForDeepSeek(messages) {
    if (!this.enabled) {
      return { messages };
    }

    // DeepSeek 的 Context Caching 通过 prefix 参数启用
    // 系统消息和前几轮对话会被自动缓存
    return {
      messages,
      // DeepSeek V3 自动启用前缀缓存，无需额外参数
      // 但我们标记以便统计
      _cacheEnabled: true,
    };
  }

  /**
   * 通用格式化方法 - 根据策略自动选择
   * @param {string} strategy - 缓存策略
   * @param {string|Array} content - 内容
   * @returns {*} 格式化后的内容
   */
  format(strategy, content) {
    switch (strategy) {
      case CACHE_STRATEGIES.ANTHROPIC:
        return this.formatForAnthropic(content);
      case CACHE_STRATEGIES.DEEPSEEK:
        return this.formatForDeepSeek(content);
      default:
        return content;
    }
  }

  /**
   * 更新缓存统计（从 API 响应中提取）
   * @param {string} strategy - 缓存策略
   * @param {Object} usage - API 返回的 usage 对象
   */
  updateStats(strategy, usage) {
    if (!usage) return;

    switch (strategy) {
      case CACHE_STRATEGIES.ANTHROPIC:
        if (usage.cache_read_input_tokens > 0) {
          this.stats.recordHit(usage.cache_read_input_tokens);
        } else if (usage.cache_creation_input_tokens > 0) {
          this.stats.recordMiss();
        }
        break;
      case CACHE_STRATEGIES.DEEPSEEK:
        // DeepSeek 返回 prompt_cache_hit_tokens 和 prompt_cache_miss_tokens
        if (usage.prompt_cache_hit_tokens > 0) {
          this.stats.recordHit(usage.prompt_cache_hit_tokens);
        } else {
          this.stats.recordMiss();
        }
        break;
      default:
        break;
    }
  }

  getStats() {
    return this.stats.toJSON();
  }

  reset() {
    this.stats.reset();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

// 全局单例
const globalCacheManager = new PromptCacheManager();

module.exports = {
  PromptCacheManager,
  CacheStats,
  CACHE_STRATEGIES,
  globalCacheManager,
};
