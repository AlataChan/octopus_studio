const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CIRCUIT_COOLDOWN_MS = 30_000;
const DEFAULT_FAILURE_THRESHOLD = 3;

function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || "").trim();
  if (!value) throw new Error("MoltClient baseUrl is required");
  return value.replace(/\/+$/, "");
}

function joinUrl(baseUrl, path) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readResponseBody(response) {
  try {
    return await response.json();
  } catch {
    try {
      const text = await response.text();
      return text ? { error: text } : {};
    } catch {
      return {};
    }
  }
}

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
    return { event: event || "message", data: { text: dataText } };
  }
}

function consumeSseBuffer(buffer, onFrame) {
  let remainder = buffer;
  let boundary = remainder.indexOf("\n\n");
  while (boundary >= 0) {
    const frame = remainder.slice(0, boundary);
    const parsed = parseSseFrame(frame);
    if (parsed) onFrame(parsed);
    remainder = remainder.slice(boundary + 2);
    boundary = remainder.indexOf("\n\n");
  }
  return remainder;
}

class MoltClient {
  constructor({
    baseUrl,
    getToken,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    circuitCooldownMs = DEFAULT_CIRCUIT_COOLDOWN_MS,
    failureThreshold = DEFAULT_FAILURE_THRESHOLD,
  } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.getToken =
      typeof getToken === "function" ? getToken : async () => null;
    this.timeoutMs = Number.isFinite(Number(timeoutMs))
      ? Number(timeoutMs)
      : DEFAULT_TIMEOUT_MS;
    this.circuitCooldownMs = Number.isFinite(Number(circuitCooldownMs))
      ? Number(circuitCooldownMs)
      : DEFAULT_CIRCUIT_COOLDOWN_MS;
    this.failureThreshold = Math.max(1, Number(failureThreshold) || 3);
    this.failureCount = 0;
    this.circuitOpenUntil = 0;
  }

  async health() {
    return this.#request("/healthz");
  }

  async capabilitySnapshot() {
    return this.#request("/api/v1/capability/snapshot");
  }

  async setupStatus() {
    return this.#request("/api/v1/setup/status");
  }

  async matrixStatus({ includeAgents = false, agentId = null } = {}) {
    const search = new URLSearchParams();
    if (includeAgents) search.set("include_agents", "true");
    if (agentId) search.set("agent_id", agentId);
    const query = search.toString();
    return this.#request(`/api/v1/matrix/status${query ? `?${query}` : ""}`);
  }

  async matrixArchetypes() {
    return this.#request("/api/v1/matrix/archetypes");
  }

  async listAgents() {
    return this.#request("/api/v1/agents");
  }

  async chatAgent(
    agentId,
    {
      message,
      user,
      conversationId = null,
      responseMode = "blocking",
      extra = {},
    } = {}
  ) {
    if (!agentId) throw new Error("Molt agentId is required");
    return this.#request(`/api/v1/agents/${encodeURIComponent(agentId)}/chat`, {
      method: "POST",
      body: {
        message,
        user,
        response_mode: responseMode,
        ...(conversationId ? { conversation_id: conversationId } : {}),
        ...extra,
      },
    });
  }

  async streamChatAgent(
    agentId,
    {
      message,
      user,
      conversationId = null,
      responseMode = "streaming",
      extra = {},
      onChunk = () => {},
      signal = undefined,
    } = {}
  ) {
    if (!agentId) throw new Error("Molt agentId is required");
    return this.#streamRequest(
      `/api/v1/agents/${encodeURIComponent(agentId)}/chat`,
      {
        method: "POST",
        body: {
          message,
          user,
          response_mode: responseMode,
          ...(conversationId ? { conversation_id: conversationId } : {}),
          ...extra,
        },
        onChunk,
        signal,
      }
    );
  }

  async createMatrixAgent(payload = {}) {
    return this.#request("/api/v1/matrix/agents", {
      method: "POST",
      body: payload,
    });
  }

  async matrixInit({ adminToken = undefined } = {}) {
    return this.#request("/api/v1/matrix/init", {
      method: "POST",
      tokenOverride: adminToken,
    });
  }

  async uploadAgentFile(agentId, { filename, dataBase64 } = {}) {
    if (!agentId) throw new Error("Molt agentId is required");
    return this.#request(
      `/api/v1/agents/${encodeURIComponent(agentId)}/files`,
      {
        method: "POST",
        body: {
          filename,
          data_base64: dataBase64,
        },
      }
    );
  }

  async listAgentConversations(
    agentId,
    { userId = null, limit = 20, offset = 0 } = {}
  ) {
    if (!agentId) throw new Error("Molt agentId is required");
    const search = new URLSearchParams();
    if (userId) search.set("user_id", userId);
    if (limit !== null && limit !== undefined)
      search.set("limit", String(limit));
    if (offset !== null && offset !== undefined) {
      search.set("offset", String(offset));
    }
    const query = search.toString();
    return this.#request(
      `/api/v1/agents/${encodeURIComponent(agentId)}/conversations${
        query ? `?${query}` : ""
      }`
    );
  }

  #isCircuitOpen() {
    return Date.now() < this.circuitOpenUntil;
  }

  #recordFailure(statusCode) {
    if (!statusCode || statusCode < 500) return;
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.circuitOpenUntil = Date.now() + this.circuitCooldownMs;
    }
  }

  #recordSuccess() {
    this.failureCount = 0;
    this.circuitOpenUntil = 0;
  }

  async #request(
    path,
    { method = "GET", body: payload = null, tokenOverride = undefined } = {}
  ) {
    if (this.#isCircuitOpen()) {
      return {
        ok: false,
        code: "CIRCUIT_OPEN",
        error: "Molt circuit breaker is open",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const token =
        tokenOverride !== undefined ? tokenOverride : await this.getToken();
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (payload) headers["Content-Type"] = "application/json";

      const response = await fetch(joinUrl(this.baseUrl, path), {
        method,
        headers,
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: controller.signal,
      });
      const body = await readResponseBody(response);

      if (response.ok) {
        this.#recordSuccess();
        return body;
      }

      this.#recordFailure(response.status);
      return {
        ok: false,
        statusCode: response.status,
        error: body?.error || body?.message || response.statusText,
        body,
      };
    } catch (error) {
      const isAbort = error?.name === "AbortError";
      this.#recordFailure(500);
      return {
        ok: false,
        statusCode: isAbort ? 408 : 500,
        error: isAbort ? "Molt request timed out" : error.message,
        code: isAbort ? "TIMEOUT" : "FETCH_ERROR",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async #streamRequest(
    path,
    { method = "POST", body: payload = null, onChunk = () => {}, signal } = {}
  ) {
    if (this.#isCircuitOpen()) {
      return {
        ok: false,
        code: "CIRCUIT_OPEN",
        error: "Molt circuit breaker is open",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener?.("abort", abortFromCaller, { once: true });

    try {
      const token = await this.getToken();
      const headers = { Accept: "text/event-stream, application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (payload) headers["Content-Type"] = "application/json";

      const response = await fetch(joinUrl(this.baseUrl, path), {
        method,
        headers,
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await readResponseBody(response);
        this.#recordFailure(response.status);
        return {
          ok: false,
          statusCode: response.status,
          error: body?.error || body?.message || response.statusText,
          body,
        };
      }

      if (!response.body?.getReader) {
        this.#recordSuccess();
        return await readResponseBody(response);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawSse = false;
      let donePayload = {};
      let errorPayload = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (!sawSse && !text.includes("event:") && !text.includes("data:")) {
          onChunk(text);
          continue;
        }

        sawSse = true;
        buffer = consumeSseBuffer(buffer + text, ({ event, data }) => {
          if (event === "chunk") onChunk(data?.text || "");
          if (event === "done") donePayload = data || {};
          if (event === "error") errorPayload = data || {};
        });
      }

      if (buffer.trim()) {
        consumeSseBuffer(`${buffer}\n\n`, ({ event, data }) => {
          if (event === "chunk") onChunk(data?.text || "");
          if (event === "done") donePayload = data || {};
          if (event === "error") errorPayload = data || {};
        });
      }

      this.#recordSuccess();
      if (errorPayload) {
        return {
          ok: false,
          statusCode: errorPayload.statusCode,
          code: errorPayload.code,
          error: errorPayload.message || errorPayload.error || "Molt error",
          body: errorPayload,
        };
      }
      return donePayload;
    } catch (error) {
      const isAbort = error?.name === "AbortError";
      this.#recordFailure(isAbort ? null : 500);
      return {
        ok: false,
        statusCode: isAbort ? 499 : 500,
        error: isAbort ? "Molt stream aborted" : error.message,
        code: isAbort ? "ABORTED" : "FETCH_ERROR",
      };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.("abort", abortFromCaller);
    }
  }
}

module.exports = { MoltClient };
