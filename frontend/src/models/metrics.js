/**
 * 观测性指标 API 封装
 */
import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

export const METRICS_EXPERIMENT_DISABLED_CODE = "EXPERIMENTS_ADMIN_DISABLED";
const METRICS_DISABLED_MESSAGE = "Observability metrics are not enabled.";

async function parseMetricsResponse(res) {
  const data = await res.json().catch(() => ({}));

  if (res.status === 404 && data?.code === METRICS_EXPERIMENT_DISABLED_CODE) {
    return {
      ...data,
      success: false,
      disabled: true,
      code: METRICS_EXPERIMENT_DISABLED_CODE,
      error: data.error || METRICS_DISABLED_MESSAGE,
    };
  }

  if (!res.ok) {
    return {
      ...data,
      success: false,
      error: data?.error || `Failed to fetch metrics (${res.status})`,
    };
  }

  return data;
}

function metricsFetchFailure(error) {
  return {
    success: false,
    error: error?.message || "Failed to fetch metrics",
  };
}

const Metrics = {
  /**
   * 获取 Chat 统计数据
   * @param {Object} params - 查询参数
   * @param {string} params.startDate - 开始日期 (ISO string)
   * @param {string} params.endDate - 结束日期 (ISO string)
   * @param {number} params.workspaceId - Workspace ID (可选)
   * @param {string} params.assistantId - 助手 ID (可选)
   * @returns {Promise<Object>} 统计数据
   */
  getChatStats: async function ({
    startDate,
    endDate,
    workspaceId,
    assistantId,
  }) {
    const params = new URLSearchParams({
      startDate,
      endDate,
    });

    if (workspaceId) params.append("workspaceId", workspaceId);
    if (assistantId) params.append("assistantId", assistantId);

    return await fetch(`${API_BASE}/metrics/chat-stats?${params.toString()}`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then(parseMetricsResponse)
      .catch(metricsFetchFailure);
  },

  /**
   * 获取知识模式分布
   * @param {Object} params - 查询参数
   * @param {string} params.startDate - 开始日期 (ISO string)
   * @param {string} params.endDate - 结束日期 (ISO string)
   * @param {number} params.workspaceId - Workspace ID (可选)
   * @returns {Promise<Object>} 知识模式分布
   */
  getKnowledgeModeDistribution: async function ({
    startDate,
    endDate,
    workspaceId,
  }) {
    const params = new URLSearchParams({
      startDate,
      endDate,
    });

    if (workspaceId) params.append("workspaceId", workspaceId);

    return await fetch(
      `${API_BASE}/metrics/knowledge-mode-distribution?${params.toString()}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then(parseMetricsResponse)
      .catch(metricsFetchFailure);
  },

  /**
   * 获取图谱统计数据
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise<Object>} 图谱统计数据
   */
  getGraphStats: async function (workspaceId) {
    return await fetch(
      `${API_BASE}/metrics/graph-stats?workspaceId=${workspaceId}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then(parseMetricsResponse)
      .catch(metricsFetchFailure);
  },
};

export default Metrics;
