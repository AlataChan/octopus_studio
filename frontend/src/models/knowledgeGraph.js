import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * 知识图谱 API 模型
 * @module models/knowledgeGraph
 */
const KnowledgeGraph = {
  /**
   * 获取知识图谱子图
   * @param {string} slug - Workspace slug
   * @param {Object} options - 查询选项
   * @param {string} [options.q] - 搜索关键词
   * @param {number} [options.limit=200] - 最大节点数
   * @param {string} [options.types] - 节点类型过滤（逗号分隔）
   * @returns {Promise<Object>} 图谱数据 { nodes, links, stats, pagination }
   */
  getGraph: async (slug, options = {}) => {
    const params = new URLSearchParams();
    if (options.q) params.append("q", options.q);
    if (options.limit) params.append("limit", options.limit);
    if (options.types) params.append("types", options.types);

    const queryString = params.toString();
    const url = `${API_BASE}/workspace/${slug}/knowledge-graph${queryString ? `?${queryString}` : ""}`;

    return await fetch(url, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[KnowledgeGraph.getGraph]", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 搜索图谱节点（轻量级）
   * @param {string} slug - Workspace slug
   * @param {string} keyword - 搜索关键词（至少 2 个字符）
   * @param {number} [limit=50] - 最大结果数
   * @returns {Promise<Object>} 搜索结果 { nodes, total }
   */
  search: async (slug, keyword, limit = 50) => {
    return await fetch(
      `${API_BASE}/workspace/${slug}/knowledge-graph/search?q=${encodeURIComponent(keyword)}&limit=${limit}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error("[KnowledgeGraph.search]", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 触发图谱构建任务
   * @param {string} slug - Workspace slug
   * @param {Object} options - 构建选项
   * @param {string} [options.mode='full'] - 构建模式 (full/incremental)
   * @param {boolean} [options.includeDocs=true] - 是否包含文档
   * @param {boolean} [options.includeChats=true] - 是否包含聊天
   * @param {boolean} [options.includeEpisodes=true] - 是否包含 Episode
   * @returns {Promise<Object>} 任务信息 { taskId, status, message }
   */
  build: async (slug, options = {}) => {
    return await fetch(`${API_BASE}/workspace/${slug}/knowledge-graph/build`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({
        mode: options.mode || "full",
        options: {
          includeDocs: options.includeDocs !== false,
          includeChats: options.includeChats !== false,
          includeEpisodes: options.includeEpisodes !== false,
          computeSimilarity: options.computeSimilarity || false,
        },
      }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[KnowledgeGraph.build]", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 查询构建任务状态
   * @param {string} slug - Workspace slug
   * @param {string} [taskId] - 任务 ID（可选，不传则返回最新任务）
   * @returns {Promise<Object>} 任务状态
   */
  getBuildStatus: async (slug, taskId = null) => {
    const url = taskId
      ? `${API_BASE}/workspace/${slug}/knowledge-graph/build/status?taskId=${taskId}`
      : `${API_BASE}/workspace/${slug}/knowledge-graph/build/status`;

    return await fetch(url, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[KnowledgeGraph.getBuildStatus]", e);
        return { success: false, error: e.message };
      });
  },

  // ============================================
  // 兼容旧 API（保留以支持现有组件）
  // ============================================

  /**
   * @deprecated 使用 getGraph 替代
   */
  stats: async (slug) => {
    const result = await KnowledgeGraph.getGraph(slug, { limit: 1 });
    if (result.success && result.data) {
      return { success: true, data: result.data.stats };
    }
    return result;
  },

  /**
   * @deprecated 使用 getGraph 替代
   */
  overview: async (slug, limit = 50) => {
    const result = await KnowledgeGraph.getGraph(slug, { limit });
    if (result.success && result.data) {
      // 转换为旧格式
      return {
        success: true,
        data: {
          nodes: result.data.nodes,
          edges: result.data.links.map((link) => ({
            fromNodeId: link.source,
            toNodeId: link.target,
            relation: link.type,
            weight: link.weight,
          })),
        },
      };
    }
    return result;
  },

  /**
   * @deprecated 使用 getGraph 替代
   */
  nodeSubgraph: async (slug, nodeId, _depth = 1) => {
    // 使用搜索 API 模拟子图查询
    return await KnowledgeGraph.getGraph(slug, { q: nodeId, limit: 50 });
  },
};

export default KnowledgeGraph;
