import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

async function safeFetchJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...baseHeaders(),
        ...(options.headers || {}),
      },
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: json?.error || `HTTP error! status: ${response.status}`,
      };
    }
    return json;
  } catch (error) {
    return { success: false, error: error.message || "Network error" };
  }
}

function withQuery(path, query = {}) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.append(key, String(value));
  });
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}

const ImGateway = {
  accounts: async (filters = {}) =>
    await safeFetchJson(withQuery(`${API_BASE}/im-gateway/accounts`, filters), {
      method: "GET",
    }),

  upsertAccount: async (data = {}) =>
    await safeFetchJson(`${API_BASE}/im-gateway/accounts/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  account: async (provider, accountId) =>
    await safeFetchJson(
      `${API_BASE}/im-gateway/accounts/${encodeURIComponent(provider)}/${encodeURIComponent(accountId)}`,
      { method: "GET" }
    ),

  bindings: async (filters = {}) =>
    await safeFetchJson(withQuery(`${API_BASE}/im-gateway/bindings`, filters), {
      method: "GET",
    }),

  upsertBinding: async (data = {}) =>
    await safeFetchJson(`${API_BASE}/im-gateway/bindings/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  runtimes: async () =>
    await safeFetchJson(`${API_BASE}/im-gateway/runtimes`, {
      method: "GET",
    }),

  createRuntime: async (data = {}) =>
    await safeFetchJson(`${API_BASE}/im-gateway/runtimes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  rotateRuntimeToken: async (id) =>
    await safeFetchJson(`${API_BASE}/im-gateway/runtimes/${id}/rotate-token`, {
      method: "POST",
    }),

  health: async () =>
    await safeFetchJson(`${API_BASE}/im-gateway/health`, {
      method: "GET",
    }),

  securityAudit: async () =>
    await safeFetchJson(`${API_BASE}/im-gateway/security-audit`, {
      method: "GET",
    }),

  runtimeConfig: async (id) =>
    await safeFetchJson(
      `${API_BASE}/im-gateway/runtimes/${encodeURIComponent(id)}/config-admin`,
      { method: "GET" }
    ),
};

export default ImGateway;
