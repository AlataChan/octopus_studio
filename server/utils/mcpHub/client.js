class McpHubClient {
  constructor({ baseUrl, token = null, timeoutMs = 30_000 } = {}) {
    this.baseUrl = String(baseUrl || "").trim();
    this.token = token ? String(token) : null;
    this.timeoutMs = Number.isFinite(timeoutMs) ? timeoutMs : 30_000;
    this._id = 0;
  }

  #nextId() {
    this._id += 1;
    return this._id;
  }

  async #request(method, params = {}) {
    if (!this.baseUrl) {
      throw new Error("MCP Hub baseUrl is required");
    }

    const id = this.#nextId();
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params: params || {},
    };

    const headers = { "Content-Type": "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text || "null");
    } catch {
      throw new Error(
        `MCP Hub invalid JSON response (status=${res.status}): ${text?.slice?.(0, 200) || ""}`
      );
    }

    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      throw new Error(`MCP Hub request failed: ${msg}`);
    }

    if (json?.error) {
      const msg = json.error?.message || "Unknown JSON-RPC error";
      throw new Error(`MCP Hub JSON-RPC error: ${msg}`);
    }

    return json?.result;
  }

  async toolsList() {
    return await this.#request("tools/list", {});
  }

  async toolsCall({
    toolRef,
    args = {},
    idempotencyKey = null,
    dryRun = false,
  } = {}) {
    return await this.#request("tools/call", {
      toolRef,
      args: args || {},
      idempotencyKey,
      dryRun: !!dryRun,
    });
  }

  async taskStatus({ taskId } = {}) {
    return await this.#request("task.status", { taskId });
  }

  async taskResult({ taskId } = {}) {
    return await this.#request("task.result", { taskId });
  }

  async fileGet({ fileId } = {}) {
    return await this.#request("file.get", { fileId });
  }
}

module.exports = { McpHubClient };
