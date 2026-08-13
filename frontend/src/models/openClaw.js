import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

async function safeFetchJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...baseHeaders(), ...(options.headers || {}) },
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: json?.error || `HTTP ${response.status}`,
      };
    }
    return json;
  } catch (error) {
    return { success: false, error: error.message || "Network error" };
  }
}

const OpenClaw = {
  checkInstalled: () =>
    safeFetchJson(`${API_BASE}/openclaw/install/check`, { method: "GET" }),

  checkNodeVersion: () =>
    safeFetchJson(`${API_BASE}/openclaw/env/node`, { method: "GET" }),

  checkGit: () =>
    safeFetchJson(`${API_BASE}/openclaw/env/git`, { method: "GET" }),

  getNodeDownloadUrl: () =>
    safeFetchJson(`${API_BASE}/openclaw/env/node/download-url`, {
      method: "GET",
    }),

  getGitDownloadUrl: () =>
    safeFetchJson(`${API_BASE}/openclaw/env/git/download-url`, {
      method: "GET",
    }),

  getStatus: () =>
    safeFetchJson(`${API_BASE}/openclaw/status`, { method: "GET" }),

  startGateway: (port = 18790) =>
    safeFetchJson(`${API_BASE}/openclaw/gateway/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port }),
    }),

  stopGateway: () =>
    safeFetchJson(`${API_BASE}/openclaw/gateway/stop`, { method: "POST" }),

  restartGateway: () =>
    safeFetchJson(`${API_BASE}/openclaw/gateway/restart`, { method: "POST" }),

  syncConfig: (provider, model, apiKey = "", apiBase = "") =>
    safeFetchJson(`${API_BASE}/openclaw/config/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, apiKey, apiBase }),
    }),

  getConfig: () =>
    safeFetchJson(`${API_BASE}/openclaw/config`, { method: "GET" }),

  getDashboardUrl: () =>
    safeFetchJson(`${API_BASE}/openclaw/dashboard/url`, { method: "GET" }),
};

export default OpenClaw;
