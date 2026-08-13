/**
 * 用户偏好 API 模型
 *
 * Phase 1: 用户偏好设置前端 API 封装
 *
 * @module models/userPreferences
 */

import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const UserPreferences = {
  /**
   * 获取当前用户的偏好设置
   * @returns {Promise<{preferences: Object}>}
   */
  get: async function () {
    return await fetch(`${API_BASE}/v1/user/preferences`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[UserPreferences] Error fetching:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取偏好字段定义（用于渲染表单）
   * @returns {Promise<{fields: Object}>}
   */
  getFields: async function () {
    return await fetch(`${API_BASE}/v1/user/preferences/fields`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[UserPreferences] Error fetching fields:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 更新用户偏好设置
   * @param {Object} updates - 要更新的字段
   * @param {string} [updates.language] - 语言偏好
   * @param {string} [updates.explanation_depth] - 解释详细度
   * @param {string} [updates.code_style] - 代码风格
   * @returns {Promise<{preferences: Object}>}
   */
  update: async function (updates) {
    return await fetch(`${API_BASE}/v1/user/preferences`, {
      method: "PATCH",
      headers: baseHeaders(),
      body: JSON.stringify(updates),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[UserPreferences] Error updating:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 重置偏好为默认值
   * @returns {Promise<{preferences: Object}>}
   */
  reset: async function () {
    return await fetch(`${API_BASE}/v1/user/preferences/reset`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("[UserPreferences] Error resetting:", e);
        return { success: false, error: e.message };
      });
  },
};

export default UserPreferences;
