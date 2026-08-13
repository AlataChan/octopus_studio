/**
 * 记忆统计 API 模型
 *
 * Phase 1: 记忆健康度监控前端 API 封装
 *
 * @module models/memoryStats
 */

import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const MemoryStats = {
  /**
   * 获取系统级记忆统计
   * @returns {Promise<{stats: Object}>}
   */
  getSystemStats: async function () {
    return await fetch(`${API_BASE}/v1/system/memory-stats`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[MemoryStats] Error fetching system stats:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取 Workspace 级记忆统计
   * @param {string} slug - Workspace slug
   * @returns {Promise<{stats: Object}>}
   */
  getWorkspaceStats: async function (slug) {
    return await fetch(`${API_BASE}/v1/workspace/${slug}/memory-stats`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[MemoryStats] Error fetching workspace stats:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取记忆系统健康状态
   * @returns {Promise<{health: Object}>}
   */
  getHealth: async function () {
    return await fetch(`${API_BASE}/v1/system/memory-health`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[MemoryStats] Error fetching health:", e);
        return { success: false, error: e.message };
      });
  },
};

export default MemoryStats;
