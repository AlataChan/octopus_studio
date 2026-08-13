import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const WorkflowConfirmation = {
  /**
   * 获取待确认列表
   * @param {string} slug - Workspace slug
   * @returns {Promise<Object>} 待确认列表
   */
  listPending: async (slug) => {
    return await fetch(`${API_BASE}/workspace/${slug}/confirmations/pending`, {
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
   * 批准执行计划
   * @param {string} slug - Workspace slug
   * @param {number} confirmationId - 确认记录 ID
   * @param {string|null} userResponse - 用户响应
   * @returns {Promise<Object>} 批准结果
   */
  approve: async (slug, confirmationId, userResponse = null) => {
    return await fetch(
      `${API_BASE}/workspace/${slug}/confirmations/${confirmationId}/approve`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ userResponse }),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 拒绝执行计划
   * @param {string} slug - Workspace slug
   * @param {number} confirmationId - 确认记录 ID
   * @param {string|null} userResponse - 用户响应
   * @returns {Promise<Object>} 拒绝结果
   */
  reject: async (slug, confirmationId, userResponse = null) => {
    return await fetch(
      `${API_BASE}/workspace/${slug}/confirmations/${confirmationId}/reject`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ userResponse }),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
};

export default WorkflowConfirmation;
