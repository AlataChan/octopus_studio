import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...baseHeaders(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.code || "STUDIO_REQUEST_FAILED");
    error.code = payload.code || "STUDIO_REQUEST_FAILED";
    error.path = payload.path || "request";
    error.status = response.status;
    throw error;
  }
  return payload.data || payload;
}

const FdeWorkflow = {
  startSession: (slug) =>
    request(`/workspace/${slug}/fde-workflows/sessions`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  createTurn: (slug, sessionId, userMessage) =>
    request(`/workspace/${slug}/fde-workflows/sessions/${sessionId}/turns`, {
      method: "POST",
      body: JSON.stringify({ user_message: userMessage }),
    }),
  compileImport: (slug, sessionId, lineage = {}) =>
    request(
      `/workspace/${slug}/fde-workflows/sessions/${sessionId}/compile-import`,
      { method: "POST", body: JSON.stringify(lineage) }
    ),
  list: (slug) => request(`/workspace/${slug}/fde-workflows`),
  detail: (slug, draftId) =>
    request(`/workspace/${slug}/fde-workflows/${draftId}`),
  review: (slug, draftId, decision, expectedStateVersion) =>
    request(`/workspace/${slug}/fde-workflows/${draftId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, expectedStateVersion }),
    }),
  publish: (slug, draftId, expectedStateVersion) =>
    request(`/workspace/${slug}/fde-workflows/${draftId}/publish`, {
      method: "POST",
      body: JSON.stringify({ expectedStateVersion }),
    }),
  createRun: (slug, draftId, inputs) =>
    request(`/workspace/${slug}/fde-workflows/${draftId}/runs`, {
      method: "POST",
      body: JSON.stringify({ inputs }),
    }),
  run: (slug, runId) => request(`/workspace/${slug}/fde-runs/${runId}`),
  events: (slug, runId) =>
    request(`/workspace/${slug}/fde-runs/${runId}/events`),
  artifacts: (slug, runId) =>
    request(`/workspace/${slug}/fde-runs/${runId}/artifacts`),
  resume: (slug, runId) =>
    request(`/workspace/${slug}/fde-runs/${runId}/resume`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};

export default FdeWorkflow;
