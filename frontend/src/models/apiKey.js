import { API_BASE, baseHeaders } from "@/utils/request";

/**
 * 用户 API Key 管理 API
 */
const ApiKeyAPI = {
  /**
   * 获取当前用户的 API Keys
   * @returns {Promise<Object>}
   */
  getList: async () => {
    return await fetch(`${API_BASE}/user/api-keys`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, apiKeys: [], error: e.message };
      });
  },

  /**
   * 创建新的 API Key
   * @param {Object} data - { name, expiresAt, rateLimit }
   * @returns {Promise<Object>}
   */
  create: async (data) => {
    return await fetch(`${API_BASE}/user/api-keys`, {
      method: "POST",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 更新 API Key
   * @param {number} id - API Key ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>}
   */
  update: async (id, data) => {
    return await fetch(`${API_BASE}/user/api-keys/${id}`, {
      method: "PATCH",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 重新生成 API Key 密钥
   * @param {number} id - API Key ID
   * @returns {Promise<Object>}
   */
  regenerate: async (id) => {
    return await fetch(`${API_BASE}/user/api-keys/${id}/regenerate`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 删除 API Key
   * @param {number} id - API Key ID
   * @returns {Promise<Object>}
   */
  delete: async (id) => {
    return await fetch(`${API_BASE}/user/api-keys/${id}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
};

export default ApiKeyAPI;
