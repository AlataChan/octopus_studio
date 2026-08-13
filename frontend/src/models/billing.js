import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * 计费系统 API 模型 - V1.5
 */
const Billing = {
  // ============================================
  // 计费配置
  // ============================================

  /**
   * 获取计费系统配置
   */
  getConfig: async () => {
    return await fetch(`${API_BASE}/admin/billing/config`, {
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
   * 更新计费系统配置
   */
  updateConfig: async (data) => {
    return await fetch(`${API_BASE}/admin/billing/config`, {
      method: "PATCH",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // ============================================
  // 用户钱包管理
  // ============================================

  /**
   * 获取所有用户钱包列表
   */
  getWallets: async (page = 1, limit = 20) => {
    return await fetch(
      `${API_BASE}/admin/billing/wallets?page=${page}&limit=${limit}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取用户钱包详情
   */
  getWallet: async (userId) => {
    return await fetch(`${API_BASE}/admin/billing/wallets/${userId}`, {
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
   * 为用户充值
   */
  topup: async (userId, data) => {
    return await fetch(`${API_BASE}/admin/billing/wallets/${userId}/topup`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 更新用户套餐
   */
  updatePlan: async (userId, plan) => {
    return await fetch(`${API_BASE}/admin/billing/wallets/${userId}/plan`, {
      method: "PATCH",
      headers: baseHeaders(),
      body: JSON.stringify({ plan }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // ============================================
  // 充值记录
  // ============================================

  /**
   * 获取充值记录列表
   */
  getTopups: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await fetch(`${API_BASE}/admin/billing/topups?${query}`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // ============================================
  // 使用统计
  // ============================================

  /**
   * 获取使用统计概览
   */
  getUsageSummary: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await fetch(`${API_BASE}/admin/billing/usage/summary?${query}`, {
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
   * 获取用户使用详情
   */
  getUserUsage: async (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await fetch(
      `${API_BASE}/admin/billing/usage/users/${userId}?${query}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // ============================================
  // 用户自助查询 API (V1.5)
  // ============================================

  /**
   * 获取当前用户钱包信息
   */
  getMyWallet: async () => {
    return await fetch(`${API_BASE}/user/billing/wallet`, {
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
   * 获取当前用户使用记录
   */
  getMyUsage: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await fetch(`${API_BASE}/user/billing/usage?${query}`, {
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
   * 获取当前用户使用统计
   */
  getMyStats: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await fetch(`${API_BASE}/user/billing/stats?${query}`, {
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
   * 获取当前用户每日使用趋势
   */
  getMyDailyTrend: async (days = 30) => {
    return await fetch(`${API_BASE}/user/billing/trend?days=${days}`, {
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
   * 获取当前用户模型使用排行
   */
  getMyModelRanking: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await fetch(`${API_BASE}/user/billing/model-ranking?${query}`, {
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
   * 获取当前用户充值记录
   */
  getMyTopups: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await fetch(`${API_BASE}/user/billing/topups?${query}`, {
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
   * 获取定价信息
   */
  getPricing: async () => {
    return await fetch(`${API_BASE}/user/billing/pricing`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
};

export default Billing;
