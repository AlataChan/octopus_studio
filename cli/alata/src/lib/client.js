class ApiError extends Error {
  constructor(message, { status = 500, payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

class AlataApiClient {
  constructor({ baseUrl, token, fetchImpl = global.fetch }) {
    if (!baseUrl) throw new Error("Missing ALATA_API_BASE");
    if (!token) throw new Error("Missing ALATA_API_TOKEN");
    if (typeof fetchImpl !== "function") {
      throw new Error("Fetch API is not available in this runtime");
    }

    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.token = token;
    this.fetch = fetchImpl;
  }

  async request(method, pathname, { body = null, query = null } = {}) {
    const url = new URL(pathname, `${this.baseUrl}/`);
    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }

    const response = await this.fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let payload = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { success: false, error: text };
      }
    }

    if (!response.ok || payload?.success === false) {
      throw new ApiError(payload?.error || `Request failed with status ${response.status}`, {
        status: response.status,
        payload,
      });
    }

    return payload || {};
  }

  listRuntimes() {
    return this.request("GET", "/im-gateway/runtimes");
  }

  listAccounts(query = null) {
    return this.request("GET", "/im-gateway/accounts", { query });
  }

  listBindings(query = null) {
    return this.request("GET", "/im-gateway/bindings", { query });
  }

  upsertAccount(body) {
    return this.request("POST", "/im-gateway/accounts/upsert", { body });
  }

  upsertBinding(body) {
    return this.request("POST", "/im-gateway/bindings/upsert", { body });
  }

  rotateRuntimeToken(runtimeId) {
    return this.request("POST", `/im-gateway/runtimes/${runtimeId}/rotate-token`);
  }

  listApprovals(workspaceSlug) {
    return this.request("GET", `/workspace/${workspaceSlug}/confirmations/pending`);
  }

  approveConfirmation(workspaceSlug, confirmationId, userResponse = null) {
    return this.request(
      "POST",
      `/workspace/${workspaceSlug}/confirmations/${confirmationId}/approve`,
      { body: { userResponse } }
    );
  }

  rejectConfirmation(workspaceSlug, confirmationId, userResponse = null) {
    return this.request(
      "POST",
      `/workspace/${workspaceSlug}/confirmations/${confirmationId}/reject`,
      { body: { userResponse } }
    );
  }
}

module.exports = {
  AlataApiClient,
  ApiError,
};
