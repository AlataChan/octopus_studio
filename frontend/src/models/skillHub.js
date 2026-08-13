import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

async function safeFetchJson(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...baseHeaders(),
        ...(options.headers || {}),
      },
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: json?.error || `HTTP error! status: ${res.status}`,
      };
    }
    return json;
  } catch (error) {
    return { success: false, error: error.message || "Network error" };
  }
}

const SkillHub = {
  search: async function (query, options = {}) {
    const params = new URLSearchParams();
    if (query) params.append("q", query);
    if (options.topN) params.append("topN", String(options.topN));
    if (options.source) params.append("source", String(options.source));
    const qs = params.toString();
    return await safeFetchJson(
      `${API_BASE}/skill-hub/search${qs ? `?${qs}` : ""}`,
      {
        method: "GET",
      }
    );
  },

  recommend: async function (query, options = {}) {
    const params = new URLSearchParams();
    if (query) params.append("q", query);
    if (options.topN) params.append("topN", String(options.topN));
    const qs = params.toString();
    return await safeFetchJson(
      `${API_BASE}/skill-hub/recommend${qs ? `?${qs}` : ""}`,
      { method: "GET" }
    );
  },

  discover: async function (filters = {}) {
    const params = new URLSearchParams();
    if (filters.category) params.append("category", String(filters.category));
    if (filters.source) params.append("source", String(filters.source));
    if (filters.page) params.append("page", String(filters.page));
    if (filters.limit) params.append("limit", String(filters.limit));
    const qs = params.toString();
    return await safeFetchJson(
      `${API_BASE}/skill-hub/discover${qs ? `?${qs}` : ""}`,
      { method: "GET" }
    );
  },

  getSkill: async function (skillId) {
    return await safeFetchJson(
      `${API_BASE}/skill-hub/skill/${encodeURIComponent(skillId)}`,
      { method: "GET" }
    );
  },

  getCategories: async function () {
    return await safeFetchJson(`${API_BASE}/skill-hub/categories`, {
      method: "GET",
    });
  },

  install: async function (data = {}) {
    return await safeFetchJson(`${API_BASE}/skill-hub/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  uninstall: async function (data = {}) {
    return await safeFetchJson(`${API_BASE}/skill-hub/uninstall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  createFromUrl: async function (data = {}) {
    return await safeFetchJson(`${API_BASE}/skill-hub/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  checkUpdates: async function () {
    return await safeFetchJson(`${API_BASE}/skill-hub/check-updates`, {
      method: "GET",
    });
  },

  upgrade: async function (skillId, options = {}) {
    return await safeFetchJson(
      `${API_BASE}/skill-hub/upgrade/${encodeURIComponent(skillId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      }
    );
  },

  validate: async function (skillId) {
    return await safeFetchJson(
      `${API_BASE}/skill-hub/validate/${encodeURIComponent(skillId)}`,
      { method: "POST" }
    );
  },

  getInstalled: async function (workspaceId) {
    const params = new URLSearchParams();
    if (workspaceId) params.append("workspaceId", String(workspaceId));
    const qs = params.toString();
    return await safeFetchJson(
      `${API_BASE}/skill-hub/installed${qs ? `?${qs}` : ""}`,
      { method: "GET" }
    );
  },

  updateConfig: async function (skillId, config = {}) {
    return await safeFetchJson(
      `${API_BASE}/skill-hub/skill/${encodeURIComponent(skillId)}/config`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      }
    );
  },

  toggle: async function (skillId, enabled) {
    return await safeFetchJson(
      `${API_BASE}/skill-hub/skill/${encodeURIComponent(skillId)}/toggle`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }
    );
  },

  refreshRegistry: async function () {
    return await safeFetchJson(`${API_BASE}/skill-hub/refresh-registry`, {
      method: "POST",
    });
  },

  getJobs: async function (options = {}) {
    const params = new URLSearchParams();
    if (options.workspaceId !== undefined && options.workspaceId !== null)
      params.append("workspaceId", String(options.workspaceId));
    if (options.status) params.append("status", String(options.status));
    if (options.type) params.append("type", String(options.type));
    if (options.skillId) params.append("skillId", String(options.skillId));
    if (options.scopeType)
      params.append("scopeType", String(options.scopeType));
    if (options.scopeId) params.append("scopeId", String(options.scopeId));
    if (options.limit) params.append("limit", String(options.limit));
    if (options.offset) params.append("offset", String(options.offset));

    const qs = params.toString();
    return await safeFetchJson(
      `${API_BASE}/skill-hub/jobs${qs ? `?${qs}` : ""}`,
      {
        method: "GET",
      }
    );
  },

  getSchedulerStatus: async function () {
    return await safeFetchJson(`${API_BASE}/skill-hub/scheduler/status`, {
      method: "GET",
    });
  },

  runSchedulerTask: async function (task) {
    return await safeFetchJson(`${API_BASE}/skill-hub/scheduler/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
    });
  },

  searchMemory: async function (options = {}) {
    const params = new URLSearchParams();
    if (options.q) params.append("q", String(options.q));
    if (options.kind) params.append("kind", String(options.kind));
    if (options.skillId) params.append("skillId", String(options.skillId));
    if (options.workspaceId !== undefined && options.workspaceId !== null)
      params.append("workspaceId", String(options.workspaceId));
    if (options.limit) params.append("limit", String(options.limit));
    const qs = params.toString();
    return await safeFetchJson(
      `${API_BASE}/skill-hub/memory/search${qs ? `?${qs}` : ""}`,
      { method: "GET" }
    );
  },

  autobot: async function (message, context = {}) {
    return await safeFetchJson(`${API_BASE}/skill-hub/autobot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context }),
    });
  },

  importFlowTemplate: async function (skillId, payload = {}) {
    if (!skillId) return { success: false, error: "skillId is required" };
    return await safeFetchJson(
      `${API_BASE}/skill-hub/skill/${encodeURIComponent(skillId)}/flow-templates/import`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
  },
};

export default SkillHub;
