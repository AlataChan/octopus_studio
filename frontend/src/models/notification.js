import { API_BASE } from "@/utils/constants";
import { baseHeaders, clearLocalAuthSession } from "@/utils/request";

function handleUnauthorized(response, fallback = {}) {
  if (response.status !== 401) return null;

  clearLocalAuthSession();
  return {
    success: false,
    unauthorized: true,
    error: "Unauthorized",
    ...fallback,
  };
}

/**
 * 通知系统 API 模型
 */
const NotificationAPI = {
  /**
   * 获取通知列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>}
   */
  getList: async ({ page = 1, limit = 20, unreadOnly = false } = {}) => {
    const query = new URLSearchParams({ page, limit, unreadOnly }).toString();
    return await fetch(`${API_BASE}/notifications?${query}`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => handleUnauthorized(res) || res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取未读数量
   * @returns {Promise<Object>}
   */
  getUnreadCount: async () => {
    return await fetch(`${API_BASE}/notifications/unread-count`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => handleUnauthorized(res, { count: 0 }) || res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, count: 0, error: e.message };
      });
  },

  /**
   * 标记为已读
   * @param {number} id - 通知 ID
   * @returns {Promise<Object>}
   */
  markAsRead: async (id) => {
    return await fetch(`${API_BASE}/notifications/${id}/read`, {
      method: "PATCH",
      headers: baseHeaders(),
    })
      .then((res) => handleUnauthorized(res) || res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 标记所有为已读
   * @returns {Promise<Object>}
   */
  markAllAsRead: async () => {
    return await fetch(`${API_BASE}/notifications/read-all`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => handleUnauthorized(res) || res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 删除通知
   * @param {number} id - 通知 ID
   * @returns {Promise<Object>}
   */
  delete: async (id) => {
    return await fetch(`${API_BASE}/notifications/${id}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => handleUnauthorized(res) || res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
};

export default NotificationAPI;
