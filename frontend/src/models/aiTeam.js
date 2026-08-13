import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const AITeam = {
  /**
   * 获取 AI 团队概览
   * @param {string} workspaceSlug - Workspace slug
   * @returns {Promise<Object>} AI 团队概览数据
   */
  getOverview: async function (workspaceSlug) {
    return await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/ai-team/overview`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取 AI 团队图谱数据
   * @param {string} workspaceSlug - Workspace slug
   * @returns {Promise<Object>} 图谱数据 { nodes, edges }
   */
  getGraph: async function (workspaceSlug) {
    return await fetch(`${API_BASE}/workspace/${workspaceSlug}/ai-team/graph`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取 AI 团队性能统计
   * @param {string} workspaceSlug - Workspace slug
   * @param {Object} [options] - 查询选项
   * @param {string} [options.period='7d'] - 时间周期: '24h', '7d', '30d'
   * @param {string} [options.assistantId] - 筛选特定助手
   * @returns {Promise<Object>} 性能统计数据
   */
  getPerformance: async function (workspaceSlug, options = {}) {
    const params = new URLSearchParams();
    if (options.period) params.append("period", options.period);
    if (options.assistantId) params.append("assistantId", options.assistantId);

    const queryString = params.toString();
    const url = `${API_BASE}/workspace/${workspaceSlug}/ai-team/performance${queryString ? `?${queryString}` : ""}`;

    return await fetch(url, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取单个助手的详细性能统计
   * @param {string} workspaceSlug - Workspace slug
   * @param {string} assistantId - 助手 ID
   * @param {Object} [options] - 查询选项
   * @param {string} [options.period='7d'] - 时间周期
   * @returns {Promise<Object>} 助手性能统计
   */
  getAssistantPerformance: async function (
    workspaceSlug,
    assistantId,
    options = {}
  ) {
    const params = new URLSearchParams();
    if (options.period) params.append("period", options.period);

    const queryString = params.toString();
    const url = `${API_BASE}/workspace/${workspaceSlug}/ai-team/assistant/${assistantId}/performance${queryString ? `?${queryString}` : ""}`;

    return await fetch(url, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取指定助手的调用历史
   * @param {string} workspaceSlug - Workspace slug
   * @param {string} assistantId - 助手 ID
   * @param {Object} [options] - 查询选项
   * @param {number} [options.limit=20] - 返回数量
   * @param {number} [options.offset=0] - 偏移量
   * @returns {Promise<Object>} 调用历史 { invocations, total }
   */
  getInvocationHistory: async function (
    workspaceSlug,
    assistantId,
    options = {}
  ) {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", options.limit.toString());
    if (options.offset) params.append("offset", options.offset.toString());

    const queryString = params.toString();
    const url = `${API_BASE}/workspace/${workspaceSlug}/ai-team/assistant/${assistantId}/invocations${queryString ? `?${queryString}` : ""}`;

    return await fetch(url, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取单次调用的详情（包含步骤）
   * @param {string} workspaceSlug - Workspace slug
   * @param {string|number} invocationId - 调用 ID
   * @returns {Promise<Object>} 调用详情
   */
  getInvocationDetails: async function (workspaceSlug, invocationId) {
    return await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/ai-team/invocations/${invocationId}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取单次调用的步骤列表
   * @param {string} workspaceSlug - Workspace slug
   * @param {string|number} invocationId - 调用 ID
   * @returns {Promise<Object>} 步骤列表 { steps }
   */
  getInvocationSteps: async function (workspaceSlug, invocationId) {
    return await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/ai-team/invocations/${invocationId}/steps`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取增强版协作图谱数据（包含共用会话关系、活跃度、来源等）
   * @param {string} workspaceSlug - Workspace slug
   * @param {Object} [options] - 查询选项
   * @param {string} [options.period='7d'] - 统计周期: '24h', '7d', '30d'
   * @returns {Promise<Object>} 协作图谱数据 { nodes, edges, stats }
   */
  getCollaborationGraph: async function (workspaceSlug, options = {}) {
    const params = new URLSearchParams();
    if (options.period) params.append("period", options.period);

    const queryString = params.toString();
    const url = `${API_BASE}/workspace/${workspaceSlug}/ai-team/collaboration-graph${queryString ? `?${queryString}` : ""}`;

    return await fetch(url, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
};

export default AITeam;
