import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

function errorMessageFrom(data, response) {
  return (
    data?.error ||
    data?.message ||
    response?.statusText ||
    `Request failed${response?.status ? ` (${response.status})` : ""}`
  );
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson(path, options = {}, fallback = {}) {
  const { preserveStatus = false, ...fetchOptions } = options;
  return await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    method: fetchOptions.method || "GET",
    headers: { ...baseHeaders(), ...(fetchOptions.headers || {}) },
  })
    .then(async (res) => {
      const data = await readJson(res);
      if (res?.ok === false) {
        return {
          success: false,
          error: errorMessageFrom(data, res),
          ...(preserveStatus
            ? { status: res.status, code: data?.code, hint: data?.hint }
            : {}),
        };
      }
      return data;
    })
    .catch(() => fallback);
}

async function getJson(path, fallback = {}) {
  return requestJson(path, { method: "GET" }, fallback);
}

async function postJson(path, body = {}, fallback = { success: false }) {
  return requestJson(
    path,
    {
      method: "POST",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    fallback
  );
}

async function postJsonNoBody(path, fallback = { success: false }) {
  return requestJson(path, { method: "POST" }, fallback);
}

async function postJsonNoBodyWithStatus(path, fallback = { success: false }) {
  return requestJson(path, { method: "POST", preserveStatus: true }, fallback);
}

async function postJsonWithStatus(
  path,
  body = {},
  fallback = { success: false }
) {
  return requestJson(
    path,
    {
      method: "POST",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      preserveStatus: true,
    },
    fallback
  );
}

async function patchJson(path, body = {}, fallback = { success: false }) {
  return requestJson(
    path,
    {
      method: "PATCH",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    fallback
  );
}

async function deleteJson(path, fallback = { success: false }) {
  return requestJson(path, { method: "DELETE" }, fallback);
}

function workspaceMoltPath(slug, suffix = "") {
  return `/workspace/${encodeURIComponent(slug)}/molt-agents${suffix}`;
}

const WORKSPACE_MOLT_AGENTS_CACHE_TTL_MS = 30_000;
const workspaceMoltAgentsCache = new Map();

function parseSseFrame(frame) {
  const lines = String(frame || "").split(/\r?\n/);
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.replace("event:", "")
    .trim();
  const dataText = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace("data:", "").trim())
    .join("\n");
  if (!event && !dataText) return null;

  try {
    return { event: event || "message", data: JSON.parse(dataText || "{}") };
  } catch {
    return { event: event || "message", data: { message: dataText } };
  }
}

function consumeSseBuffer(buffer, onFrame) {
  let remainder = buffer;
  let boundary = remainder.indexOf("\n\n");
  while (boundary >= 0) {
    const parsed = parseSseFrame(remainder.slice(0, boundary));
    if (parsed) onFrame(parsed);
    remainder = remainder.slice(boundary + 2);
    boundary = remainder.indexOf("\n\n");
  }
  return remainder;
}

async function parseStreamResponse(response, callbacks = {}, signal) {
  const {
    onChunk = () => {},
    onDone = () => {},
    onError = () => {},
  } = callbacks;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload = null;
  let errorPayload = null;
  let aborted = false;

  const abortHandler = () => {
    aborted = true;
    reader.cancel?.();
  };
  signal?.addEventListener?.("abort", abortHandler, { once: true });

  try {
    while (!aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer = consumeSseBuffer(
        buffer + decoder.decode(value, { stream: true }),
        ({ event, data }) => {
          if (event === "chunk") onChunk(data?.text || "", data);
          if (event === "done") {
            donePayload = data || {};
            onDone(donePayload);
          }
          if (event === "error") {
            errorPayload = data || {};
            onError(errorPayload);
          }
        }
      );
    }

    if (buffer.trim() && !aborted) {
      consumeSseBuffer(`${buffer}\n\n`, ({ event, data }) => {
        if (event === "chunk") onChunk(data?.text || "", data);
        if (event === "done") {
          donePayload = data || {};
          onDone(donePayload);
        }
        if (event === "error") {
          errorPayload = data || {};
          onError(errorPayload);
        }
      });
    }
  } finally {
    signal?.removeEventListener?.("abort", abortHandler);
  }

  if (errorPayload) {
    return {
      success: false,
      code: errorPayload.code,
      error: errorPayload.message || errorPayload.error || "Molt stream error",
    };
  }
  return { success: true, ...(donePayload || {}) };
}

const Molt = {
  status: async () => getJson("/molt/status", { success: false }),
  reconnect: async () => postJsonNoBody("/molt/reconnect", { success: false }),
  matrixInit: async () =>
    postJsonNoBodyWithStatus("/molt/matrix/init", { success: false }),
  capability: async () => getJson("/molt/capability", { success: false }),
  missionStatus: async () =>
    getJson("/molt/mission-control/status", { success: false }),
  archetypes: async () =>
    getJson("/molt/mission-control/archetypes", {
      success: false,
      archetypes: [],
    }),
  agents: async () => getJson("/molt/agents", { success: false, agents: [] }),
  chatConsoleAgent: async (agentId, message) =>
    postJson(`/molt/agents/${agentId}/chat`, { message }),
  chatAgent: async (agentId, message) =>
    Molt.chatConsoleAgent(agentId, message),
  kmStatus: async () => getJson("/molt/km/status", { success: false }),
  uploadTextFile: async ({ content, filename, agentId = null }) =>
    postJson("/molt/files/upload-text", { content, filename, agentId }),
  workspaceAgents: async (slug, { bypassCache = false } = {}) => {
    const cacheKey = String(slug || "");
    if (!bypassCache) {
      const cached = workspaceMoltAgentsCache.get(cacheKey);
      if (
        cached &&
        Date.now() - cached.cachedAt < WORKSPACE_MOLT_AGENTS_CACHE_TTL_MS
      ) {
        return cached.value;
      }
    }

    const result = await getJson(workspaceMoltPath(slug), {
      success: false,
      agents: [],
    });
    if (result?.success) {
      workspaceMoltAgentsCache.set(cacheKey, {
        value: result,
        cachedAt: Date.now(),
      });
    }
    return result;
  },
  attachWorkspaceAgent: async (slug, payload) =>
    postJsonWithStatus(workspaceMoltPath(slug), payload),
  updateWorkspaceAgent: async (slug, agentId, payload) =>
    patchJson(
      workspaceMoltPath(slug, `/${encodeURIComponent(agentId)}`),
      payload
    ),
  removeWorkspaceAgent: async (slug, agentId) =>
    deleteJson(workspaceMoltPath(slug, `/${encodeURIComponent(agentId)}`)),
  chatWorkspaceAgent: async (slug, agentId, payload = {}) =>
    postJson(
      workspaceMoltPath(slug, `/${encodeURIComponent(agentId)}/chat`),
      payload
    ),
  streamWorkspaceAgent: async ({
    slug,
    agentId,
    payload = {},
    onChunk = () => {},
    onDone = () => {},
    onError = () => {},
    signal,
  }) => {
    const path = workspaceMoltPath(
      slug,
      `/${encodeURIComponent(agentId)}/chat/stream`
    );
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { ...baseHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });

      if (response?.ok === false) {
        const data = await readJson(response);
        const error = {
          success: false,
          error: errorMessageFrom(data, response),
          code: data?.code,
          status: response.status,
        };
        onError({ code: error.code, message: error.error });
        return error;
      }

      if (!response?.body?.getReader) {
        return await Molt.chatWorkspaceAgent(slug, agentId, payload);
      }

      return await parseStreamResponse(
        response,
        { onChunk, onDone, onError },
        signal
      );
    } catch (error) {
      const result = {
        success: false,
        error: error?.name === "AbortError" ? "Stream aborted" : error.message,
        code: error?.name === "AbortError" ? "ABORTED" : "MOLT_STREAM_ERROR",
      };
      onError({ code: result.code, message: result.error });
      return result;
    }
  },
};

export default Molt;
