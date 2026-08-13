import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * AI System API 模型
 * Admin 专属 - 用于获取和配置 AI 系统状态
 */
const AISystem = {
  /**
   * 获取 AI 系统状态概览
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  getStatus: async () => {
    return fetch(`${API_BASE}/ai-system/status`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[AISystem] getStatus error:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取详细的缓存统计
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  getCacheStats: async () => {
    return fetch(`${API_BASE}/ai-system/cache-stats`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[AISystem] getCacheStats error:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 更新 AI 系统设置
   * @param {Object} settings - 设置对象
   * @param {string} [settings.llmStrategy] - LLM 策略: cost | balanced | quality
   * @param {boolean} [settings.enhancedIntelligence] - 是否开启提升智能
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  updateSettings: async (settings) => {
    return fetch(`${API_BASE}/ai-system/settings`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(settings),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[AISystem] updateSettings error:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 重置缓存统计
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  resetCacheStats: async () => {
    return fetch(`${API_BASE}/ai-system/cache/reset`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[AISystem] resetCacheStats error:", e);
        return { success: false, error: e.message };
      });
  },
};

export default AISystem;
