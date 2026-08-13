const axios = require("axios");
const http = require("http");
const https = require("https");

class AlataClient {
  constructor({ baseUrl, apiKey, internalSecret, timeout = 30000 }) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 64 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 64 }),
      proxy: false,
      timeout,
    });
    this.internalSecret = internalSecret;
  }

  errorMessage(error, fallback = "Request failed") {
    return (
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      fallback
    );
  }

  async healthCheck() {
    try {
      const { data } = await this.http.get("/v1/auth");
      return data.authenticated === true;
    } catch {
      return false;
    }
  }

  async createThread(workspaceSlug, { name }) {
    const { data } = await this.http.post(`/v1/workspace/${workspaceSlug}/thread/new`, { name });
    return data.thread;
  }

  async chat(workspaceSlug, threadSlug, message, { mode = "chat" } = {}) {
    const { data } = await this.http.post(
      `/v1/workspace/${workspaceSlug}/thread/${threadSlug}/chat`,
      { message, mode }
    );
    return data;
  }

  async *streamChat(workspaceSlug, threadSlug, message, { mode = "chat" } = {}) {
    const response = await this.http.post(
      `/v1/workspace/${workspaceSlug}/thread/${threadSlug}/stream-chat`,
      { message, mode },
      { responseType: "stream" }
    );

    let buffer = "";
    for await (const chunk of response.data) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        let trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("data:")) trimmed = trimmed.slice(5).trim();
        if (!trimmed || trimmed === "[DONE]") continue;
        try {
          const parsed = JSON.parse(trimmed);
          yield parsed;
          if (parsed.close) return;
        } catch {
          // skip malformed lines
        }
      }
    }
  }

  async streamChatFull(workspaceSlug, threadSlug, message, opts = {}) {
    let fullText = "";
    let lastChunk = null;
    for await (const chunk of this.streamChat(workspaceSlug, threadSlug, message, opts)) {
      if (chunk.textResponse) fullText += chunk.textResponse;
      lastChunk = chunk;
    }
    return { textResponse: fullText, sources: lastChunk?.sources || [] };
  }

  async createRun({
    threadId,
    workspaceId = null,
    workspaceSlug = null,
    triggerType = "im",
    triggerId,
    initialInput,
  }) {
    const { data } = await this.http.post(
      "/internal/runs/create",
      { threadId, workspaceId, workspaceSlug, triggerType, triggerId, initialInput },
      { headers: { "x-internal-secret": this.internalSecret } }
    );
    return data;
  }

  async reportImReply({ runId = null, threadId = null, text = "", richContent = null } = {}) {
    const { data } = await this.http.post(
      "/internal/im/reply",
      { runId, threadId, text, richContent },
      { headers: { "x-internal-secret": this.internalSecret } }
    );
    return data;
  }

  async approveConfirmation(confirmationId, feedback = "") {
    await this.http.post(
      `/internal/approvals/${confirmationId}/resolve`,
      { approved: true, reason: feedback, resolvedBy: "im-gateway" },
      { headers: { "x-internal-secret": this.internalSecret } }
    );
  }

  async rejectConfirmation(confirmationId, reason = "") {
    await this.http.post(
      `/internal/approvals/${confirmationId}/resolve`,
      { approved: false, reason, resolvedBy: "im-gateway" },
      { headers: { "x-internal-secret": this.internalSecret } }
    );
  }

  async getPendingConfirmations(workspaceSlug) {
    const { data } = await this.http.get(`/workspace/${workspaceSlug}/confirmations/pending`);
    return data.confirmations || [];
  }

  async registerRuntime({ runtimeId, bootstrapToken }) {
    try {
      const { data } = await axios({
        method: "POST",
        url: `/im-gateway/runtimes/${runtimeId}/register`,
        baseURL: this.baseUrl,
        timeout: this.timeout,
        proxy: false,
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          bootstrapToken,
        },
      });
      return {
        runtime: data.runtime,
        authToken: data.authToken,
      };
    } catch (error) {
      throw new Error(this.errorMessage(error, "Failed to register runtime"));
    }
  }

  async heartbeatRuntime({
    runtimeId,
    runtimeToken,
    status = "healthy",
    metrics = {},
  }) {
    try {
      const { data } = await axios({
        method: "POST",
        url: `/im-gateway/runtimes/${runtimeId}/heartbeat`,
        baseURL: this.baseUrl,
        timeout: this.timeout,
        proxy: false,
        headers: {
          Authorization: `Bearer ${runtimeToken}`,
          "Content-Type": "application/json",
        },
        data: { status, metrics },
      });
      return data;
    } catch (error) {
      throw new Error(this.errorMessage(error, "Failed to send heartbeat"));
    }
  }

  async fetchRuntimeConfig({ runtimeId, runtimeToken, etag = null }) {
    try {
      const response = await axios({
        method: "GET",
        url: `/im-gateway/runtimes/${runtimeId}/config`,
        baseURL: this.baseUrl,
        timeout: this.timeout,
        proxy: false,
        headers: {
          Authorization: `Bearer ${runtimeToken}`,
          ...(etag ? { "If-None-Match": etag } : {}),
        },
        validateStatus: (status) =>
          (status >= 200 && status < 300) || status === 304,
      });

      if (response.status === 304) {
        return { notModified: true, etag };
      }

      return response.data;
    } catch (error) {
      throw new Error(this.errorMessage(error, "Failed to fetch runtime config"));
    }
  }
}

module.exports = { AlataClient };
