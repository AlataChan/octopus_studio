/**
 * Confidence Strategy - 置信度策略服务
 *
 * 用于实现智能追问和拒答策略：
 * - 根据检索结果的置信度决定是否直接回答、追问澄清或拒答
 * - 支持多种拒答原因分类
 * - 支持自定义追问模板
 *
 * @module chats/confidenceStrategy
 */

/**
 * 响应策略类型
 */
const RESPONSE_STRATEGY = {
  ANSWER: "answer", // 直接回答
  CLARIFY: "clarify", // 追问澄清
  REFUSE: "refuse", // 拒绝回答
};

/**
 * 拒答原因分类
 */
const REFUSAL_REASON = {
  NO_CONTEXT: "no_context", // 无相关上下文
  LOW_CONFIDENCE: "low_confidence", // 置信度过低
  OUT_OF_SCOPE: "out_of_scope", // 超出知识范围
  SENSITIVE: "sensitive", // 敏感话题
  AMBIGUOUS: "ambiguous", // 问题模糊
};

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  // 置信度阈值（高于此值直接回答）
  answerThreshold: 0.7,
  // 追问阈值（介于此值和 answerThreshold 之间时追问）
  clarifyThreshold: 0.4,
  // 低于 clarifyThreshold 时拒答

  // 追问模板
  clarifyTemplate:
    "我找到了一些相关信息，但不太确定是否完全符合您的需求。您能否提供更多细节？\n\n找到的相关内容：\n{context}",

  // 拒答模板（按原因分类）
  refusalTemplates: {
    [REFUSAL_REASON.NO_CONTEXT]:
      "抱歉，我在知识库中没有找到与您问题相关的信息。",
    [REFUSAL_REASON.LOW_CONFIDENCE]:
      "抱歉，我找到的信息置信度较低，无法给出可靠答案。建议您尝试换个方式提问。",
    [REFUSAL_REASON.OUT_OF_SCOPE]: "抱歉，这个问题超出了我的知识范围。",
    [REFUSAL_REASON.SENSITIVE]: "抱歉，这个问题涉及敏感话题，我无法提供答案。",
    [REFUSAL_REASON.AMBIGUOUS]: "您的问题比较模糊，能否提供更具体的信息？",
  },
};

/**
 * 计算检索结果的平均置信度
 * @param {Array} sources - 检索到的源文档
 * @returns {number} 平均置信度 (0-1)
 */
function calculateAverageConfidence(sources = []) {
  if (!sources || sources.length === 0) return 0;

  const scores = sources
    .map((s) => s.score ?? s.metadata?.score ?? s._distance ?? 0)
    .filter((score) => typeof score === "number" && !isNaN(score));

  if (scores.length === 0) return 0;

  // 如果是距离（越小越好），转换为相似度
  const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  // 如果平均分大于 1，假设是距离，转换为相似度
  return avgScore > 1 ? 1 / (1 + avgScore) : avgScore;
}

/**
 * 确定响应策略
 * @param {Object} options - 配置选项
 * @param {Array} options.sources - 检索到的源文档
 * @param {Array} options.contextTexts - 上下文文本
 * @param {Object} options.workspace - 工作空间配置
 * @returns {Object} 策略结果 { strategy, reason, confidence, message }
 */
function determineStrategy(options = {}) {
  const { sources = [], contextTexts = [], workspace = {} } = options;

  // 合并配置（workspace 配置优先）
  const config = {
    ...DEFAULT_CONFIG,
    answerThreshold:
      workspace.confidenceThreshold ?? DEFAULT_CONFIG.answerThreshold,
    clarifyThreshold:
      workspace.clarifyThreshold ?? DEFAULT_CONFIG.clarifyThreshold,
  };

  // 无上下文
  if (!contextTexts || contextTexts.length === 0) {
    return {
      strategy: RESPONSE_STRATEGY.REFUSE,
      reason: REFUSAL_REASON.NO_CONTEXT,
      confidence: 0,
      message:
        workspace.queryRefusalResponse ||
        config.refusalTemplates[REFUSAL_REASON.NO_CONTEXT],
    };
  }

  // 计算置信度
  const confidence = calculateAverageConfidence(sources);

  // 高置信度 - 直接回答
  if (confidence >= config.answerThreshold) {
    return {
      strategy: RESPONSE_STRATEGY.ANSWER,
      reason: null,
      confidence,
      message: null,
    };
  }

  // 中等置信度 - 追问澄清
  if (confidence >= config.clarifyThreshold) {
    const contextSummary = contextTexts
      .slice(0, 2)
      .map((t) => `- ${t.substring(0, 100)}...`)
      .join("\n");

    return {
      strategy: RESPONSE_STRATEGY.CLARIFY,
      reason: REFUSAL_REASON.LOW_CONFIDENCE,
      confidence,
      message: config.clarifyTemplate.replace("{context}", contextSummary),
    };
  }

  // 低置信度 - 拒答
  return {
    strategy: RESPONSE_STRATEGY.REFUSE,
    reason: REFUSAL_REASON.LOW_CONFIDENCE,
    confidence,
    message:
      workspace.queryRefusalResponse ||
      config.refusalTemplates[REFUSAL_REASON.LOW_CONFIDENCE],
  };
}

/**
 * 检查是否应该拒绝回答（供现有代码调用的简化接口）
 * @param {Object} options - 选项
 * @returns {Object|null} 如果应该拒答，返回 { reason, message }；否则返回 null
 */
function shouldRefuse(options = {}) {
  const result = determineStrategy(options);

  if (result.strategy === RESPONSE_STRATEGY.REFUSE) {
    return {
      reason: result.reason,
      message: result.message,
      confidence: result.confidence,
    };
  }

  return null;
}

module.exports = {
  RESPONSE_STRATEGY,
  REFUSAL_REASON,
  DEFAULT_CONFIG,
  calculateAverageConfidence,
  determineStrategy,
  shouldRefuse,
};
