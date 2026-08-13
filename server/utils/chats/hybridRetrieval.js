/**
 * 混合检索模块
 *
 * Phase 0 改进：实现 2 因子混合检索
 * - 相似度权重 70%
 * - 时间衰减权重 30%
 *
 * 公式：finalScore = similarity × 0.7 + exp(-days/30) × 0.3
 *
 * @module chats/hybridRetrieval
 */

/**
 * 混合检索配置
 */
const HYBRID_CONFIG = {
  /** 相似度权重 */
  similarityWeight: 0.7,
  /** 时间衰减权重 */
  recencyWeight: 0.3,
  /** 时间衰减半衰期（天数） */
  decayHalfLifeDays: 30,
  /** 是否启用混合检索 */
  enabled: true,
};

/**
 * 计算时间衰减分数
 *
 * 使用指数衰减函数：exp(-days / halfLifeDays)
 * - 当天文档：score ≈ 1.0
 * - 30 天前文档：score ≈ 0.37
 * - 60 天前文档：score ≈ 0.14
 *
 * @param {Date|string|number} documentDate - 文档日期
 * @param {number} halfLifeDays - 半衰期天数
 * @returns {number} 时间衰减分数 (0-1)
 */
function calculateRecencyScore(
  documentDate,
  halfLifeDays = HYBRID_CONFIG.decayHalfLifeDays
) {
  if (!documentDate) return 0.5; // 无日期信息时返回中等分数

  const docTime = new Date(documentDate).getTime();
  const now = Date.now();
  const daysDiff = (now - docTime) / (1000 * 60 * 60 * 24);

  // 指数衰减：exp(-days / halfLife)
  return Math.exp(-daysDiff / halfLifeDays);
}

/**
 * 计算混合检索分数
 *
 * @param {number} similarityScore - 向量相似度分数 (0-1)
 * @param {number} recencyScore - 时间衰减分数 (0-1)
 * @param {Object} weights - 权重配置
 * @returns {number} 混合分数 (0-1)
 */
function calculateHybridScore(
  similarityScore,
  recencyScore,
  weights = {
    similarity: HYBRID_CONFIG.similarityWeight,
    recency: HYBRID_CONFIG.recencyWeight,
  }
) {
  return similarityScore * weights.similarity + recencyScore * weights.recency;
}

/**
 * 对向量搜索结果应用混合检索重排序
 *
 * @param {Object} params - 参数对象
 * @param {Object[]} params.sources - 向量搜索返回的源文档数组
 * @param {string[]} params.contextTexts - 上下文文本数组
 * @param {boolean} params.enabled - 是否启用混合检索
 * @returns {Object} 重排序后的结果
 */
function applyHybridRetrieval({
  sources = [],
  contextTexts = [],
  enabled = HYBRID_CONFIG.enabled,
}) {
  if (!enabled || sources.length === 0) {
    return { sources, contextTexts, hybridApplied: false };
  }

  // 为每个源文档计算混合分数
  const scoredSources = sources.map((source, index) => {
    // 从 metadata 中提取相似度分数和日期
    const similarityScore = source.score ?? source.metadata?.score ?? 0.5;
    const documentDate =
      source.published ??
      source.metadata?.published ??
      source.createdAt ??
      source.metadata?.createdAt ??
      null;

    const recencyScore = calculateRecencyScore(documentDate);
    const hybridScore = calculateHybridScore(similarityScore, recencyScore);

    return {
      source,
      contextText: contextTexts[index],
      originalIndex: index,
      scores: {
        similarity: similarityScore,
        recency: recencyScore,
        hybrid: hybridScore,
      },
    };
  });

  // 按混合分数降序排序
  scoredSources.sort((a, b) => b.scores.hybrid - a.scores.hybrid);

  // 重建排序后的数组
  const reorderedSources = scoredSources.map((item) => ({
    ...item.source,
    hybridScore: item.scores.hybrid,
    recencyScore: item.scores.recency,
  }));
  const reorderedContextTexts = scoredSources.map((item) => item.contextText);

  console.log(
    `[HybridRetrieval] Reranked ${sources.length} sources. ` +
      `Top score: ${scoredSources[0]?.scores.hybrid.toFixed(3) || "N/A"}`
  );

  return {
    sources: reorderedSources,
    contextTexts: reorderedContextTexts,
    hybridApplied: true,
    scoringDetails: scoredSources.map((s) => ({
      title: s.source.title || s.source.metadata?.title || "Unknown",
      ...s.scores,
    })),
  };
}

module.exports = {
  HYBRID_CONFIG,
  calculateRecencyScore,
  calculateHybridScore,
  applyHybridRetrieval,
};
