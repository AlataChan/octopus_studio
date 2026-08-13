/**
 * 记忆 API 模型
 *
 * Phase 1: 手动记忆（"记住"功能）前端 API 封装
 *
 * @module models/memory
 */

import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const Memory = {
  /**
   * 获取 Workspace 的所有手动记忆
   * @param {string} slug - Workspace slug
   * @param {Object} [options] - 可选参数
   * @param {string} [options.type] - 记忆类型筛选
   * @param {number} [options.limit] - 返回数量限制
   * @returns {Promise<{memories: Array}>}
   */
  getAll: async function (slug, options = {}) {
    const params = new URLSearchParams();
    if (options.type) params.append("type", options.type);
    if (options.limit) params.append("limit", options.limit);
    const query = params.toString() ? `?${params.toString()}` : "";

    return await fetch(`${API_BASE}/v1/workspace/${slug}/memories${query}`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Memory] Error fetching:", e);
        return { success: false, error: e.message, memories: [] };
      });
  },

  /**
   * 保存新的记忆（「记住」功能）
   * @param {string} slug - Workspace slug
   * @param {Object} data - 记忆数据
   * @param {string} data.content - 记忆内容
   * @param {string} [data.type] - 记忆类型
   * @param {string[]} [data.tags] - 标签数组
   * @param {string} [data.sourceMessageId] - 源消息 ID
   * @returns {Promise<{memory: Object}>}
   */
  save: async function (slug, data) {
    return await fetch(`${API_BASE}/v1/workspace/${slug}/memories`, {
      method: "POST",
      headers: {
        ...baseHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Memory] Error saving:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 删除记忆
   * @param {string} slug - Workspace slug
   * @param {string} memoryId - 记忆 ID
   * @returns {Promise<{success: boolean}>}
   */
  delete: async function (slug, memoryId) {
    return await fetch(
      `${API_BASE}/v1/workspace/${slug}/memories/${memoryId}`,
      {
        method: "DELETE",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Memory] Error deleting:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 搜索记忆
   * @param {string} slug - Workspace slug
   * @param {string} query - 搜索关键词
   * @param {number} [limit] - 返回数量限制
   * @returns {Promise<{memories: Array}>}
   */
  search: async function (slug, query, limit = 20) {
    const params = new URLSearchParams({ q: query, limit });
    return await fetch(
      `${API_BASE}/v1/workspace/${slug}/memories/search?${params}`,
      {
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Memory] Error searching:", e);
        return { success: false, error: e.message, memories: [] };
      });
  },

  /**
   * 获取记忆类型定义
   * @param {string} slug - Workspace slug
   * @returns {Promise<{types: Object}>}
   */
  getTypes: async function (slug) {
    return await fetch(`${API_BASE}/v1/workspace/${slug}/memories/types`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[Memory] Error fetching types:", e);
        return { success: false, error: e.message };
      });
  },
};

export default Memory;
