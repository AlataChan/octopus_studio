/**
 * 知识感知模块 (KnowledgeSensing)
 *
 * 为 Agent Planning 提供知识全景，让 Planning 不在"信息真空"中盲目决策。
 *
 * 核心功能：
 * 1. 图谱搜索 - 复用 WorkspaceGraph.searchSubgraph()
 * 2. 向量检索 - 复用 VectorDb.performSimilaritySearch()
 * 3. 智能总结 - 复用 summarizeGraphContext() 的 3000 token 限制
 * 4. 覆盖度评估 - 返回 low/medium/high 三档
 *
 * Feature Flag: ENABLE_KNOWLEDGE_SENSING
 * - 设置为 "true" 启用知识感知
 * - 默认为 "true"（启用）
 *
 * @module knowledgeSensing
 */

const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { summarizeGraphContext } = require("../chats/graphSummarization");
const { getVectorDbClass, getEmbeddingEngineSelection } = require("../helpers");
const { knowledgeCache } = require("./knowledgeCache");

/**
 * 知识覆盖度级别
 */
const COVERAGE_LEVEL = {
  LOW: "low", // 低覆盖：知识库几乎无相关内容
  MEDIUM: "medium", // 中等覆盖：部分相关信息
  HIGH: "high", // 高覆盖：知识库充分覆盖
};

/**
 * 检查知识感知功能是否启用
 * @returns {boolean}
 */
function isKnowledgeSensingEnabled() {
  // 默认启用，仅当明确设置为 "false" 时禁用
  return process.env.ENABLE_KNOWLEDGE_SENSING !== "false";
}

/**
 * KnowledgeSensing 类
 * 为 Planning 提供知识上下文
 */
class KnowledgeSensing {
  /**
   * 检查知识感知功能是否启用
   * @returns {boolean}
   */
  static isEnabled() {
    return isKnowledgeSensingEnabled();
  }

  /**
   * 默认超时时间（毫秒）
   */
  static DEFAULT_TIMEOUT_MS = parseInt(
    process.env.KNOWLEDGE_SENSING_TIMEOUT_MS || "5000",
    10
  );

  /**
   * 获取知识上下文（核心方法）
   * @param {Object} params - 参数
   * @param {string} params.task - 用户任务
   * @param {Object} params.workspace - Workspace 对象
   * @param {number} params.maxTokens - 最大 token 限制（默认 3000）
   * @param {number} params.timeoutMs - 超时时间（默认 5000ms）
   * @param {boolean} params.skipCache - 跳过缓存（默认 false）
   * @returns {Promise<Object>} 知识上下文
   */
  static async getKnowledgeContext({
    task,
    workspace,
    maxTokens = 3000,
    timeoutMs = null,
    skipCache = false,
  }) {
    const startTime = Date.now();
    const timeout = timeoutMs || this.DEFAULT_TIMEOUT_MS;

    // Feature Flag 检查
    if (!isKnowledgeSensingEnabled()) {
      return this._emptyContext(
        "知识感知功能已禁用 (ENABLE_KNOWLEDGE_SENSING=false)"
      );
    }

    try {
      if (!workspace || !workspace.id) {
        return this._emptyContext("无效的 workspace");
      }

      // 🔥 Phase C: 检查缓存
      if (!skipCache) {
        const cached = knowledgeCache.get(task, workspace.id);
        if (cached) {
          console.log(
            `[KnowledgeSensing] Cache hit for workspace ${workspace.id} (${Date.now() - startTime}ms)`
          );
          return {
            ...cached,
            metadata: {
              ...cached.metadata,
              processingTimeMs: Date.now() - startTime,
              fromCache: true,
            },
          };
        }
      }

      // 【降级策略】超时保护 - 并行执行带超时
      const searchPromise = Promise.all([
        this._searchGraph(workspace.id, task, Math.floor(maxTokens * 0.5)),
        this._searchVector(workspace, task, 10),
      ]);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`知识感知超时 (${timeout}ms)`)),
          timeout
        )
      );

      let graphResult, vectorResult;
      try {
        [graphResult, vectorResult] = await Promise.race([
          searchPromise,
          timeoutPromise,
        ]);
      } catch (timeoutError) {
        console.warn(
          `[KnowledgeSensing] ${timeoutError.message}，使用空上下文降级`
        );
        return this._emptyContext(timeoutError.message, Date.now() - startTime);
      }

      // 评估知识覆盖度
      const coverage = this._estimateCoverage(graphResult, vectorResult);

      // 格式化摘要
      const summary = this._formatSummary(graphResult, vectorResult, coverage);

      const tokenCount =
        (graphResult.tokenCount || 0) +
        this._estimateTokens(vectorResult.summary || "");

      const context = {
        summary,
        coverage,
        graphContext: graphResult,
        vectorContext: vectorResult,
        tokenCount: Math.min(tokenCount, maxTokens),
        metadata: {
          graphNodes: graphResult.nodeCount || 0,
          graphEdges: graphResult.edgeCount || 0,
          vectorSources: vectorResult.sources?.length || 0,
          processingTimeMs: Date.now() - startTime,
          timedOut: false,
          fromCache: false,
        },
      };

      // 🔥 Phase C: 存入缓存
      knowledgeCache.set(task, workspace.id, context);

      return context;
    } catch (error) {
      // 【降级策略】失败不阻塞 - 返回空上下文继续执行
      console.error("[KnowledgeSensing] Error:", error.message);
      return this._emptyContext(error.message, Date.now() - startTime);
    }
  }

  /**
   * 搜索知识图谱
   * @private
   */
  static async _searchGraph(workspaceId, keyword, maxTokens) {
    try {
      // 【修复】空关键词检查 - 避免返回全部节点
      if (!keyword || keyword.trim().length === 0) {
        return { summary: "", tokenCount: 0, nodeCount: 0, edgeCount: 0 };
      }

      const subgraph = await WorkspaceGraph.searchSubgraph({
        workspaceId,
        keyword: keyword.trim(),
        limit: 50,
      });

      if (!subgraph || !subgraph.nodes || subgraph.nodes.length === 0) {
        return { summary: "", tokenCount: 0, nodeCount: 0, edgeCount: 0 };
      }

      // 调用 3000 token 智能总结
      const summaryResult = await summarizeGraphContext(
        subgraph,
        keyword,
        maxTokens
      );

      return {
        ...summaryResult,
        rawSubgraph: subgraph,
      };
    } catch (error) {
      console.error("[KnowledgeSensing] Graph search error:", error.message);
      return { summary: "", tokenCount: 0, nodeCount: 0, edgeCount: 0 };
    }
  }

  /**
   * 搜索向量数据库
   * @private
   */
  static async _searchVector(workspace, query, topN = 10) {
    try {
      // 【修复】空查询检查
      if (!query || query.trim().length === 0) {
        return { summary: "", sources: [], tokenCount: 0 };
      }

      const VectorDb = getVectorDbClass();
      if (!VectorDb) {
        return { summary: "", sources: [], tokenCount: 0 };
      }

      // 【修复】获取 Embedding 引擎用于向量化查询
      const embedder = getEmbeddingEngineSelection();
      if (!embedder) {
        console.warn("[KnowledgeSensing] No embedding engine available");
        return { summary: "", sources: [], tokenCount: 0 };
      }

      const result = await VectorDb.performSimilaritySearch({
        namespace: workspace.slug,
        input: query.trim(),
        LLMConnector: embedder, // 【修复】传入 embedder 而非 null
        similarityThreshold: workspace?.similarityThreshold || 0.25,
        topN,
      });

      if (!result || !result.contextTexts || result.contextTexts.length === 0) {
        return { summary: "", sources: [], tokenCount: 0 };
      }

      // 简化向量结果（减少 token）
      const simplifiedTexts = result.contextTexts
        .slice(0, 5)
        .map((text, idx) => {
          const source = result.sources?.[idx]?.title || "未知来源";
          const truncated = text.slice(0, 500); // 每个文档最多 500 字符
          return `[${source}] ${truncated}${text.length > 500 ? "..." : ""}`;
        });

      return {
        summary: simplifiedTexts.join("\n\n"),
        sources: result.sources?.slice(0, 5) || [],
        tokenCount: this._estimateTokens(simplifiedTexts.join("\n\n")),
      };
    } catch (error) {
      console.error("[KnowledgeSensing] Vector search error:", error.message);
      return { summary: "", sources: [], tokenCount: 0 };
    }
  }

  /**
   * 评估知识覆盖度（MVP 简化版）
   * 返回 "low" | "medium" | "high"
   * @private
   */
  static _estimateCoverage(graphResult, vectorResult) {
    // 评分逻辑：图谱节点数 + 文档来源数
    const graphScore = (graphResult.nodeCount || 0) * 2;
    const vectorScore = (vectorResult.sources?.length || 0) * 10;
    const totalScore = graphScore + vectorScore;

    // 三档分类
    if (totalScore >= 80) return COVERAGE_LEVEL.HIGH;
    if (totalScore >= 30) return COVERAGE_LEVEL.MEDIUM;
    return COVERAGE_LEVEL.LOW;
  }

  /**
   * 格式化知识摘要
   * @private
   */
  static _formatSummary(graphResult, vectorResult, coverage) {
    let summary = "";

    if (graphResult.summary) {
      summary += "## 知识图谱上下文\n\n" + graphResult.summary + "\n\n";
    }

    if (vectorResult.summary) {
      summary += "## 文档检索结果\n\n" + vectorResult.summary + "\n\n";
    }

    if (!summary) {
      summary = "## 知识库检索\n\n暂无相关知识，建议使用外部搜索工具。\n";
    }

    // 添加覆盖度提示
    const coverageHints = {
      [COVERAGE_LEVEL.HIGH]: "知识库已充分覆盖此任务，建议优先使用内部文档。",
      [COVERAGE_LEVEL.MEDIUM]: "知识库部分覆盖，建议结合内部知识和外部搜索。",
      [COVERAGE_LEVEL.LOW]: "知识库覆盖不足，建议使用互联网搜索或 API 调用。",
    };

    summary += `\n**覆盖度评估**: ${coverage} - ${coverageHints[coverage] || ""}`;

    return summary.trim();
  }

  /**
   * 返回空上下文（降级处理）
   * @param {string} errorMessage - 错误信息
   * @param {number} processingTimeMs - 处理耗时（毫秒）
   * @private
   */
  static _emptyContext(errorMessage = "", processingTimeMs = 0) {
    return {
      summary: "",
      coverage: COVERAGE_LEVEL.LOW,
      graphContext: { summary: "", nodeCount: 0, edgeCount: 0 },
      vectorContext: { summary: "", sources: [] },
      tokenCount: 0,
      metadata: {
        graphNodes: 0,
        graphEdges: 0,
        vectorSources: 0,
        processingTimeMs: processingTimeMs || 0,
        timedOut: errorMessage?.includes("超时") || false,
        degraded: true, // 标记为降级响应
      },
      error: errorMessage || null,
    };
  }

  /**
   * 粗略估算 token 数
   * @private
   */
  static _estimateTokens(text) {
    if (!text) return 0;
    // 中文约 1.5 字符/token，英文约 4 字符/token，取平均
    return Math.ceil(text.length / 2.5);
  }
}

module.exports = {
  KnowledgeSensing,
  COVERAGE_LEVEL,
  isKnowledgeSensingEnabled,
  knowledgeCache, // 导出缓存实例，供文档操作时触发失效
};
