/**
 * 图谱引导的检索模块
 * @module utils/chats/graphGuidedRetrieval
 * @description 使用知识图谱结构扩展查询范围，提升检索召回率
 *
 * 实现策略：兜底式二阶段增强
 * 1. 第一次照常向量检索
 * 2. 仅当满足"命中少/分数低/覆盖度低"等条件时，再执行图谱检索
 * 3. 图谱产出扩展关键词，进行第二次向量检索
 * 4. 合并两次结果并做应用层加权 rerank
 */

const { WorkspaceGraph } = require("../../models/workspaceGraph");
const {
  KG_FEATURE_FLAGS,
  KG_DEGRADATION_CONFIG,
  KG_GUIDED_RETRIEVAL_CONFIG,
  checkCircuitBreaker,
  recordSuccess,
  recordFailure,
  withTimeout,
} = require("../graphBuilder/featureFlags");

/**
 * 判断是否需要图谱增强
 * @param {Object} vectorResults - 向量检索结果
 * @param {Object} workspace - 工作空间对象
 * @returns {boolean} 是否需要图谱增强
 */
function shouldEnhanceWithGraph(vectorResults, workspace) {
  // 功能开关检查
  if (!KG_FEATURE_FLAGS.GUIDED_RETRIEVAL_ENABLED) {
    return false;
  }

  // 熔断器检查
  if (!checkCircuitBreaker()) {
    console.log(
      "[GraphGuidedRetrieval] Circuit breaker is open, skipping graph enhancement"
    );
    return false;
  }

  const sources = vectorResults.sources || [];
  const config = KG_GUIDED_RETRIEVAL_CONFIG;

  // 条件 1: 结果数量少于阈值
  if (sources.length < config.MIN_RESULTS_THRESHOLD) {
    console.log(
      `[GraphGuidedRetrieval] Triggering: only ${sources.length} results (threshold: ${config.MIN_RESULTS_THRESHOLD})`
    );
    return true;
  }

  // 条件 2: 最高分数低于阈值
  const maxScore = sources.reduce((max, s) => {
    const score = s.metadata?.score || s.score || 0;
    return Math.max(max, score);
  }, 0);

  if (maxScore < config.MIN_SCORE_THRESHOLD) {
    console.log(
      `[GraphGuidedRetrieval] Triggering: max score ${maxScore.toFixed(3)} below threshold ${config.MIN_SCORE_THRESHOLD}`
    );
    return true;
  }

  return false;
}

/**
 * 从图谱中提取扩展信息
 * @param {number} workspaceId - Workspace ID
 * @param {string} query - 用户查询
 * @returns {Promise<Object>} 扩展信息 { keywords, docIds, tagLabels }
 */
async function extractGraphExpansions(workspaceId, query) {
  const config = KG_GUIDED_RETRIEVAL_CONFIG;
  const result = {
    keywords: [],
    docIds: [],
    tagLabels: [],
    nodeCount: 0,
  };

  try {
    // 1. 在图谱中搜索与查询相关的节点
    const subgraph = await WorkspaceGraph.searchSubgraph({
      workspaceId,
      keyword: query,
      limit: config.MAX_GRAPH_NODES,
    });

    if (!subgraph.nodes || subgraph.nodes.length === 0) {
      return result;
    }

    result.nodeCount = subgraph.nodes.length;

    // 2. 扩展到二阶邻居（仅取前几个高 rank 节点）
    const expandedNodeIds = new Set();
    const topNodes = subgraph.nodes
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))
      .slice(0, 5);

    for (const node of topNodes) {
      const neighbors = await WorkspaceGraph.getSubgraphByNode({
        workspaceId,
        nodeId: node.nodeId,
        depth: Math.min(config.MAX_EXPANSION_DEPTH, 2),
      });

      neighbors.nodes.forEach((n) => expandedNodeIds.add(n.nodeId));
    }

    // 3. 从所有相关节点提取信息
    const allNodes = [
      ...subgraph.nodes,
      ...Array.from(expandedNodeIds)
        .filter((id) => !subgraph.nodes.find((n) => n.nodeId === id))
        .map((id) => subgraph.nodes.find((n) => n.nodeId === id))
        .filter(Boolean),
    ];

    for (const node of allNodes) {
      if (!node) continue;

      // 提取文档 ID
      if (node.type === "doc" && node.externalId) {
        if (!result.docIds.includes(node.externalId)) {
          result.docIds.push(node.externalId);
        }
      }

      // 提取标签
      if (node.type === "tag" && node.label) {
        if (!result.tagLabels.includes(node.label)) {
          result.tagLabels.push(node.label);
        }
      }

      // 提取关键词（从标签和文档标题）
      if (node.label && node.label !== query && node.label.length < 50) {
        if (!result.keywords.includes(node.label)) {
          result.keywords.push(node.label);
        }
      }
    }

    // 4. 限制数量
    result.keywords = result.keywords.slice(0, config.MAX_EXPANDED_KEYWORDS);
    result.docIds = result.docIds.slice(0, 10);
    result.tagLabels = result.tagLabels.slice(0, 5);

    return result;
  } catch (error) {
    console.error(
      "[GraphGuidedRetrieval] Error extracting graph expansions:",
      error
    );
    return result;
  }
}

/**
 * 对检索结果进行应用层加权重排序
 * @param {Array} sources - 原始检索结果
 * @param {Object} graphExpansions - 图谱扩展信息
 * @returns {Array} 重排序后的结果
 */
function rerankWithGraphBoost(sources, graphExpansions) {
  if (!sources || sources.length === 0) {
    return sources;
  }

  const { docIds, tagLabels } = graphExpansions;
  const docIdSet = new Set(docIds);
  const tagSet = new Set(tagLabels.map((t) => t.toLowerCase()));

  return sources
    .map((source) => {
      let boost = 0;
      const metadata = source.metadata || source;

      // 检查 docId 是否在图谱关联中
      const sourceDocId = metadata.docId || metadata.id;
      if (sourceDocId && docIdSet.has(sourceDocId)) {
        boost += 0.15; // 图谱关联 +0.15
      }

      // 检查是否包含相关标签
      const sourceText = (
        metadata.text ||
        metadata.content ||
        ""
      ).toLowerCase();
      for (const tag of tagSet) {
        if (sourceText.includes(tag)) {
          boost += 0.05; // 每个匹配标签 +0.05
          break; // 只加一次
        }
      }

      // 应用加权
      const originalScore = metadata.score || 0;
      const boostedScore = Math.min(1.0, originalScore + boost);

      return {
        ...source,
        metadata: {
          ...metadata,
          score: boostedScore,
          originalScore,
          graphBoost: boost,
          graphEnhanced: boost > 0,
        },
      };
    })
    .sort((a, b) => {
      const scoreA = a.metadata?.score || 0;
      const scoreB = b.metadata?.score || 0;
      return scoreB - scoreA;
    });
}

/**
 * 合并两次检索的结果并去重
 * @param {Array} firstResults - 第一次检索结果
 * @param {Array} secondResults - 第二次检索结果
 * @param {number} maxResults - 最大返回数量
 * @returns {Array} 合并后的结果
 */
function mergeResults(firstResults, secondResults, maxResults = 10) {
  const seen = new Set();
  const merged = [];

  // 优先添加第一次结果
  for (const result of firstResults) {
    const key =
      result.metadata?.docId || result.metadata?.id || JSON.stringify(result);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(result);
    }
  }

  // 添加第二次结果中的新内容
  for (const result of secondResults) {
    const key =
      result.metadata?.docId || result.metadata?.id || JSON.stringify(result);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({
        ...result,
        metadata: {
          ...result.metadata,
          fromSecondPass: true,
        },
      });
    }
  }

  // 按分数排序并限制数量
  return merged
    .sort((a, b) => (b.metadata?.score || 0) - (a.metadata?.score || 0))
    .slice(0, maxResults);
}

/**
 * 图谱引导的检索（主入口）
 *
 * 工作流程：
 * 1. 执行常规向量检索
 * 2. 评估是否需要图谱增强
 * 3. 如需增强，从图谱提取扩展关键词
 * 4. 执行第二次向量检索
 * 5. 合并结果并应用图谱加权
 *
 * @param {Object} params
 * @param {string} params.query - 用户查询
 * @param {Object} params.workspace - 工作空间对象
 * @param {Object} params.VectorDb - 向量数据库实例
 * @param {Object} params.LLMConnector - LLM 连接器
 * @param {Object} params.options - 额外选项
 * @returns {Promise<Object>} 检索结果
 */
async function graphGuidedRetrieval({
  query,
  workspace,
  VectorDb,
  LLMConnector,
  options = {},
}) {
  const startTime = Date.now();
  const workspaceId = workspace.id;

  // 构建检索参数
  const searchParams = {
    namespace: workspace.slug,
    input: query,
    LLMConnector,
    similarityThreshold: workspace?.similarityThreshold || 0.25,
    topN: workspace?.topN || 10,
    filterIdentifiers: options.filterIdentifiers || [],
  };

  try {
    // 第一次：常规向量检索
    const firstPassResults =
      await VectorDb.performSimilaritySearch(searchParams);

    // 检查是否有错误
    if (firstPassResults.message) {
      return firstPassResults;
    }

    // 评估是否需要图谱增强
    if (!shouldEnhanceWithGraph(firstPassResults, workspace)) {
      return {
        ...firstPassResults,
        graphEnhanced: false,
      };
    }

    // 执行图谱增强（带超时保护）
    try {
      const graphExpansions = await withTimeout(
        extractGraphExpansions(workspaceId, query),
        KG_DEGRADATION_CONFIG.SEARCH_TIMEOUT_MS,
        "Graph expansion"
      );

      // 如果没有找到有用的扩展，直接返回第一次结果
      if (
        graphExpansions.keywords.length === 0 &&
        graphExpansions.docIds.length === 0
      ) {
        recordSuccess();
        return {
          ...firstPassResults,
          graphEnhanced: false,
          graphSearched: true,
          graphNodeCount: graphExpansions.nodeCount,
        };
      }

      // 构建扩展查询
      const expandedQuery = [query, ...graphExpansions.keywords].join(" ");

      // 第二次：使用扩展查询检索
      const secondPassResults = await VectorDb.performSimilaritySearch({
        ...searchParams,
        input: expandedQuery,
      });

      // 合并结果
      const mergedSources = mergeResults(
        firstPassResults.sources || [],
        secondPassResults.sources || [],
        searchParams.topN
      );

      // 应用图谱加权重排序
      const rerankedSources = rerankWithGraphBoost(
        mergedSources,
        graphExpansions
      );

      recordSuccess();

      const duration = Date.now() - startTime;
      console.log(
        `[GraphGuidedRetrieval] Completed in ${duration}ms. ` +
          `First pass: ${(firstPassResults.sources || []).length}, ` +
          `Second pass: ${(secondPassResults.sources || []).length}, ` +
          `Merged: ${rerankedSources.length}`
      );

      return {
        contextTexts: rerankedSources.map(
          (s) => s.metadata?.text || s.text || ""
        ),
        sources: rerankedSources,
        message: false,
        graphEnhanced: true,
        graphExpansions: {
          keywords: graphExpansions.keywords,
          docIds: graphExpansions.docIds.length,
          tagLabels: graphExpansions.tagLabels,
        },
        durationMs: duration,
      };
    } catch (timeoutError) {
      // 图谱增强超时或失败，回退到第一次结果
      recordFailure();
      console.warn(
        "[GraphGuidedRetrieval] Graph enhancement failed, falling back:",
        timeoutError.message
      );

      if (KG_DEGRADATION_CONFIG.FALLBACK_ON_TIMEOUT) {
        return {
          ...firstPassResults,
          graphEnhanced: false,
          graphError: timeoutError.message,
        };
      }

      throw timeoutError;
    }
  } catch (error) {
    console.error("[GraphGuidedRetrieval] Error:", error);
    recordFailure();
    throw error;
  }
}

/**
 * 检查图谱引导检索是否可用
 * @returns {Object} 状态信息
 */
function getStatus() {
  return {
    enabled: KG_FEATURE_FLAGS.GUIDED_RETRIEVAL_ENABLED,
    circuitBreakerOpen: !checkCircuitBreaker(),
    config: KG_GUIDED_RETRIEVAL_CONFIG,
    degradationConfig: KG_DEGRADATION_CONFIG,
  };
}

module.exports = {
  graphGuidedRetrieval,
  shouldEnhanceWithGraph,
  extractGraphExpansions,
  rerankWithGraphBoost,
  mergeResults,
  getStatus,
};
