/**
 * Episode API 模型
 *
 * Phase 1: Episode 管理前端 API 封装
 *
 * @module models/episode
 */

import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const Episode = {
  /**
   * 获取 Workspace 下的所有 Episode（项目）
   * @param {string} slug - Workspace slug
   * @param {string} [status] - 可选状态筛选: active/completed/archived
   * @returns {Promise<{episodes: Array}>}
   */
  getAll: async function (slug, status = null) {
    const params = status ? `?status=${status}` : "";
    return await fetch(`${API_BASE}/v1/workspace/${slug}/episodes${params}`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Episode] Error fetching episodes:", e);
        return { success: false, error: e.message, episodes: [] };
      });
  },

  /**
   * 获取单个 Episode 详情
   * @param {string} slug - Workspace slug
   * @param {string} episodeId - Episode ID
   * @returns {Promise<{episode: Object}>}
   */
  get: async function (slug, episodeId) {
    return await fetch(
      `${API_BASE}/v1/workspace/${slug}/episodes/${episodeId}`,
      {
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Episode] Error fetching episode:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 创建新的 Episode（项目）
   * @param {string} slug - Workspace slug
   * @param {Object} data - Episode 数据
   * @param {string} data.name - 项目名称
   * @param {string} [data.description] - 项目描述
   * @param {string[]} [data.tags] - 标签数组
   * @returns {Promise<{episode: Object}>}
   */
  create: async function (slug, data) {
    return await fetch(`${API_BASE}/v1/workspace/${slug}/episodes`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Episode] Error creating episode:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 更新 Episode
   * @param {string} slug - Workspace slug
   * @param {string} episodeId - Episode ID
   * @param {Object} updates - 更新数据
   * @returns {Promise<{episode: Object}>}
   */
  update: async function (slug, episodeId, updates) {
    return await fetch(
      `${API_BASE}/v1/workspace/${slug}/episodes/${episodeId}`,
      {
        method: "PATCH",
        headers: baseHeaders(),
        body: JSON.stringify(updates),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Episode] Error updating episode:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 删除 Episode
   * @param {string} slug - Workspace slug
   * @param {string} episodeId - Episode ID
   * @returns {Promise<{success: boolean}>}
   */
  delete: async function (slug, episodeId) {
    return await fetch(
      `${API_BASE}/v1/workspace/${slug}/episodes/${episodeId}`,
      {
        method: "DELETE",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Episode] Error deleting episode:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 将聊天/文档关联到 Episode
   * @param {string} slug - Workspace slug
   * @param {string} episodeId - Episode ID
   * @param {string} targetNodeId - 要关联的节点 ID
   * @returns {Promise<{success: boolean}>}
   */
  link: async function (slug, episodeId, targetNodeId) {
    return await fetch(
      `${API_BASE}/v1/workspace/${slug}/episodes/${episodeId}/link`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ targetNodeId }),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Episode] Error linking:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 取消关联
   * @param {string} slug - Workspace slug
   * @param {string} episodeId - Episode ID
   * @param {string} targetNodeId - 要取消关联的节点 ID
   * @returns {Promise<{success: boolean}>}
   */
  unlink: async function (slug, episodeId, targetNodeId) {
    return await fetch(
      `${API_BASE}/v1/workspace/${slug}/episodes/${episodeId}/unlink`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ targetNodeId }),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Episode] Error unlinking:", e);
        return { success: false, error: e.message };
      });
  },
};

export default Episode;
