import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * 定时任务 API 封装
 */
const ScheduledTaskAPI = {
  /**
   * 获取 Workspace 的定时任务列表
   * @param {string} slug - Workspace slug
   * @returns {Promise<{tasks: Array}>}
   */
  list: async (slug) => {
    const response = await fetch(
      `${API_BASE}/workspace/${slug}/scheduled-tasks`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error("获取定时任务失败");
    }

    const data = await response.json();
    return data;
  },

  /**
   * 创建定时任务
   * @param {string} slug - Workspace slug
   * @param {Object} taskData - 任务数据
   * @returns {Promise<Object>}
   */
  create: async (slug, taskData) => {
    const response = await fetch(
      `${API_BASE}/workspace/${slug}/scheduled-tasks`,
      {
        method: "POST",
        headers: {
          ...baseHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "创建任务失败");
    }

    return data;
  },

  /**
   * 更新定时任务
   * @param {string} slug - Workspace slug
   * @param {string} taskId - 任务 ID
   * @param {Object} updates - 更新数据
   * @returns {Promise<Object>}
   */
  update: async (slug, taskId, updates) => {
    const response = await fetch(
      `${API_BASE}/workspace/${slug}/scheduled-tasks/${taskId}`,
      {
        method: "PATCH",
        headers: {
          ...baseHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "更新任务失败");
    }

    return data;
  },

  /**
   * 删除定时任务
   * @param {string} slug - Workspace slug
   * @param {string} taskId - 任务 ID
   * @returns {Promise<Object>}
   */
  delete: async (slug, taskId) => {
    const response = await fetch(
      `${API_BASE}/workspace/${slug}/scheduled-tasks/${taskId}`,
      {
        method: "DELETE",
        headers: baseHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "删除任务失败");
    }

    return data;
  },

  /**
   * 立即执行任务
   * @param {string} slug - Workspace slug
   * @param {string} taskId - 任务 ID
   * @returns {Promise<Object>}
   */
  runNow: async (slug, taskId) => {
    const response = await fetch(
      `${API_BASE}/workspace/${slug}/scheduled-tasks/${taskId}/run`,
      {
        method: "POST",
        headers: baseHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "执行任务失败");
    }

    return data;
  },

  /**
   * 获取任务执行日志
   * @param {string} slug - Workspace slug
   * @param {string} taskId - 任务 ID
   * @param {number} limit - 返回数量
   * @returns {Promise<{logs: Array}>}
   */
  getLogs: async (slug, taskId, limit = 20) => {
    const response = await fetch(
      `${API_BASE}/workspace/${slug}/scheduled-tasks/${taskId}/logs?limit=${limit}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "获取日志失败");
    }

    return data;
  },
};

export default ScheduledTaskAPI;
