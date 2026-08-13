import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const Admin = {
  // User Management
  users: async () => {
    return await fetch(`${API_BASE}/admin/users`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.users || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  newUser: async (data) => {
    return await fetch(`${API_BASE}/admin/users/new`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { user: null, error: e.message };
      });
  },
  updateUser: async (userId, data) => {
    return await fetch(`${API_BASE}/admin/user/${userId}`, {
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
  deleteUser: async (userId) => {
    return await fetch(`${API_BASE}/admin/user/${userId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // Invitations
  invites: async () => {
    return await fetch(`${API_BASE}/admin/invites`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.invites || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  newInvite: async ({ role = null, workspaceIds = null }) => {
    return await fetch(`${API_BASE}/admin/invite/new`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({
        role,
        workspaceIds,
      }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { invite: null, error: e.message };
      });
  },
  disableInvite: async (inviteId) => {
    return await fetch(`${API_BASE}/admin/invite/${inviteId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // Workspaces Mgmt
  workspaces: async () => {
    return await fetch(`${API_BASE}/admin/workspaces`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.workspaces || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  workspaceUsers: async (workspaceId) => {
    return await fetch(`${API_BASE}/admin/workspaces/${workspaceId}/users`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.users || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  newWorkspace: async (name) => {
    return await fetch(`${API_BASE}/admin/workspaces/new`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ name }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { workspace: null, error: e.message };
      });
  },
  updateUsersInWorkspace: async (workspaceId, userIds = []) => {
    return await fetch(
      `${API_BASE}/admin/workspaces/${workspaceId}/update-users`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ userIds }),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  deleteWorkspace: async (workspaceId) => {
    return await fetch(`${API_BASE}/admin/workspaces/${workspaceId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // System Preferences
  // TODO: remove this in favor of systemPreferencesByFields
  // DEPRECATED: use systemPreferencesByFields instead
  systemPreferences: async () => {
    return await fetch(`${API_BASE}/admin/system-preferences`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return null;
      });
  },

  /**
   * Fetches system preferences by fields
   * @param {string[]} labels - Array of labels for settings
   * @returns {Promise<{settings: Object, error: string}>} - System preferences object
   */
  systemPreferencesByFields: async (labels = []) => {
    return await fetch(
      `${API_BASE}/admin/system-preferences-for?labels=${labels.join(",")}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return null;
      });
  },
  updateSystemPreferences: async (updates = {}) => {
    return await fetch(`${API_BASE}/admin/system-preferences`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(updates),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  testVideoUnderstandingConnection: async (settings = {}) => {
    return await fetch(`${API_BASE}/admin/video-understanding/test`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(settings),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { ok: false, error: e.message };
      });
  },

  // API Keys
  getApiKeys: async function () {
    return fetch(`${API_BASE}/admin/api-keys`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error fetching api keys.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { apiKeys: [], error: e.message };
      });
  },
  /**
   * 生成新的 API Key
   * @param {Object} options - 可选配置
   * @param {string} options.name - API Key 名称
   * @param {string} options.expiresAt - 过期时间 ISO 字符串
   * @param {number} options.rateLimit - 速率限制（请求/分钟）
   * @returns {Promise<{apiKey: Object|null, error: string|null}>}
   */
  generateApiKey: async function (options = {}) {
    return fetch(`${API_BASE}/admin/generate-api-key`, {
      method: "POST",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(options),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error generating api key.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { apiKey: null, error: e.message };
      });
  },
  deleteApiKey: async function (apiKeyId = "") {
    return fetch(`${API_BASE}/admin/delete-api-key/${apiKeyId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.ok)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },

  // Knowledge Graph Settings - 知识图谱设置
  getKnowledgeGraphSettings: async function () {
    return fetch(`${API_BASE}/admin/knowledge-graph/settings`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error fetching KG settings.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { settings: null, status: null, error: e.message };
      });
  },

  updateKnowledgeGraphSettings: async function (settings) {
    return fetch(`${API_BASE}/admin/knowledge-graph/settings`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(settings),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error updating KG settings.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  resetKnowledgeGraphCircuitBreaker: async function () {
    return fetch(`${API_BASE}/admin/knowledge-graph/reset-circuit-breaker`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error resetting circuit breaker.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // Work Agent Settings
  getWorkAgentSettings: async function () {
    return fetch(`${API_BASE}/admin/work-agent/settings`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            res.statusText || "Error fetching Work Agent settings."
          );
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { success: false, data: null, error: e.message };
      });
  },

  updateWorkAgentSettings: async function (settings) {
    return fetch(`${API_BASE}/admin/work-agent/settings`, {
      method: "POST",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            res.statusText || "Error updating Work Agent settings."
          );
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
};

export default Admin;
