/**
 * 上下文窗口分配算法
 *
 * 核心功能:
 * 1. 根据模型类型动态调整 Token 预算
 * 2. 在向量检索、图谱上下文、对话历史之间智能分配
 * 3. 支持用户自定义分配比例
 * 4. 动态调整规则 (如果某个来源为空,重新分配预算)
 *
 * @module contextAllocation
 */

const { encode } = require("../helpers/tiktoken");

/**
 * 模型上下文窗口大小映射表
 *
 * 注意: 这里的值是保守估计,实际可能更大
 * 我们预留 30% 给输出,所以实际可用上下文 = contextWindow * 0.7
 */
const MODEL_CONTEXT_WINDOWS = {
  // OpenAI
  "gpt-4": 8192,
  "gpt-4-32k": 32768,
  "gpt-4-turbo": 128000,
  "gpt-4o": 128000,
  "gpt-3.5-turbo": 16385,
  "gpt-3.5-turbo-16k": 16385,

  // Anthropic
  "claude-3-opus": 200000,
  "claude-3-sonnet": 200000,
  "claude-3-haiku": 200000,
  "claude-3-5-sonnet": 200000,
  "claude-2": 100000,

  // Google
  "gemini-pro": 32768,
  "gemini-1.5-pro": 1000000,
  "gemini-1.5-flash": 1000000,

  // 本地模型
  "llama-2-7b": 4096,
  "llama-2-13b": 4096,
  "llama-2-70b": 4096,
  "qwen-7b": 8192,
  "qwen-14b": 8192,
  "deepseek-coder": 16384,

  // 默认值
  default: 4096,
};

/**
 * 获取模型的上下文窗口大小
 *
 * @param {string} modelName - 模型名称
 * @returns {number} 上下文窗口大小 (tokens)
 */
function getModelContextWindow(modelName) {
  if (!modelName) return MODEL_CONTEXT_WINDOWS.default;

  const lowerModelName = modelName.toLowerCase();

  // 精确匹配优先
  if (MODEL_CONTEXT_WINDOWS[lowerModelName]) {
    return MODEL_CONTEXT_WINDOWS[lowerModelName];
  }

  // 模糊匹配 (按长度降序排序,优先匹配更具体的模型名)
  const sortedKeys = Object.keys(MODEL_CONTEXT_WINDOWS)
    .filter((k) => k !== "default")
    .sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (lowerModelName.includes(key.toLowerCase())) {
      return MODEL_CONTEXT_WINDOWS[key];
    }
  }

  return MODEL_CONTEXT_WINDOWS.default;
}

/**
 * 默认分配策略
 *
 * 可以通过 Workspace 配置覆盖
 */
const DEFAULT_ALLOCATION_STRATEGY = {
  // 分配比例 (总和应为 1.0)
  conversationHistory: 0.3, // 30% - 对话历史
  vectorRAG: 0.4, // 40% - 向量检索
  graphContext: 0.3, // 30% - 图谱上下文

  // 动态调整规则
  rules: {
    // 如果图谱上下文为空,将预算分配给向量检索
    ifGraphEmpty: "reallocate_to_vector",
    // 如果向量检索为空,将预算分配给图谱上下文
    ifVectorEmpty: "reallocate_to_graph",
    // 如果对话历史过长,压缩或截断
    ifHistoryTooLong: "compress_or_truncate",
  },

  // 最小保证 (即使重新分配,也要保证最小 Token 数)
  minimumTokens: {
    conversationHistory: 500, // 至少保留 500 tokens 给对话历史
    vectorRAG: 500, // 至少保留 500 tokens 给向量检索
    graphContext: 300, // 至少保留 300 tokens 给图谱上下文
  },
};

/**
 * 计算上下文窗口分配
 *
 * @param {Object} params
 * @param {string} params.modelName - 模型名称
 * @param {Object} params.strategy - 分配策略 (可选,默认使用 DEFAULT_ALLOCATION_STRATEGY)
 * @param {boolean} params.hasGraphContext - 是否有图谱上下文
 * @param {boolean} params.hasVectorContext - 是否有向量检索结果
 * @returns {Object} 分配结果
 */
function calculateContextAllocation({
  modelName,
  strategy = DEFAULT_ALLOCATION_STRATEGY,
  hasGraphContext = true,
  hasVectorContext = true,
}) {
  // 1. 获取模型上下文窗口大小
  const contextWindow = getModelContextWindow(modelName);

  // 2. 计算总 Token 预算 (预留 30% 给输出)
  const totalBudget = Math.floor(contextWindow * 0.7);

  // 3. 初始分配
  let allocation = {
    conversationHistory: Math.floor(totalBudget * strategy.conversationHistory),
    vectorRAG: Math.floor(totalBudget * strategy.vectorRAG),
    graphContext: Math.floor(totalBudget * strategy.graphContext),
  };

  // 4. 动态调整
  if (
    !hasGraphContext &&
    strategy.rules.ifGraphEmpty === "reallocate_to_vector"
  ) {
    // 图谱上下文为空,将预算分配给向量检索
    allocation.vectorRAG += allocation.graphContext;
    allocation.graphContext = 0;
  }

  if (
    !hasVectorContext &&
    strategy.rules.ifVectorEmpty === "reallocate_to_graph"
  ) {
    // 向量检索为空,将预算分配给图谱上下文
    allocation.graphContext += allocation.vectorRAG;
    allocation.vectorRAG = 0;
  }

  // 5. 确保最小保证
  if (
    hasGraphContext &&
    allocation.graphContext < strategy.minimumTokens.graphContext
  ) {
    allocation.graphContext = strategy.minimumTokens.graphContext;
  }

  if (
    hasVectorContext &&
    allocation.vectorRAG < strategy.minimumTokens.vectorRAG
  ) {
    allocation.vectorRAG = strategy.minimumTokens.vectorRAG;
  }

  // 6. 返回分配结果
  return {
    totalBudget,
    contextWindow,
    allocation,
    metadata: {
      modelName,
      hasGraphContext,
      hasVectorContext,
      strategy: strategy.rules,
    },
  };
}

module.exports = {
  getModelContextWindow,
  calculateContextAllocation,
  DEFAULT_ALLOCATION_STRATEGY,
  MODEL_CONTEXT_WINDOWS,
};
