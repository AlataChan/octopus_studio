const EventEmitter = require("events");
const { reloadMoltToken } = require("./tokenSource");

const STATES = {
  UNKNOWN: "UNKNOWN",
  CONNECTED: "CONNECTED",
  OFFLINE: "OFFLINE",
  DEGRADED: "DEGRADED",
};

function isUnauthorized(result) {
  return (
    result?.statusCode === 401 ||
    result?.status === 401 ||
    result?.code === "UNAUTHORIZED" ||
    result?.code === "MOLT_UNAUTHORIZED"
  );
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function deriveAgentCount(snapshot = {}) {
  const matrix = snapshot?.matrix || snapshot?.state?.matrix || {};
  const direct =
    numberOrNull(snapshot?.agentCount) ??
    numberOrNull(snapshot?.agentsCount) ??
    numberOrNull(matrix?.agentCount) ??
    numberOrNull(matrix?.agentsCount) ??
    numberOrNull(matrix?.counts?.agents);
  if (direct !== null) return direct;

  if (Array.isArray(snapshot?.agents)) return snapshot.agents.length;
  if (Array.isArray(matrix?.agents)) return matrix.agents.length;
  if (Array.isArray(snapshot?.state?.agents))
    return snapshot.state.agents.length;
  return null;
}

function deriveMatrixState(snapshot = {}, agentCount = null) {
  const matrix = snapshot?.matrix || snapshot?.state?.matrix || {};
  const state =
    snapshot?.matrixState ||
    snapshot?.state?.matrixState ||
    matrix?.state ||
    matrix?.status ||
    snapshot?.missionControl?.matrixState;
  if (state) return String(state);
  if (agentCount !== null && agentCount > 0) return "initialized";
  return "unknown";
}

class MoltHealthMonitor extends EventEmitter {
  constructor({
    client = null,
    reloadToken = reloadMoltToken,
    tokenReloadOptions = {},
  } = {}) {
    super();
    this.client = client;
    this.reloadToken =
      typeof reloadToken === "function" ? reloadToken : reloadMoltToken;
    this.tokenReloadOptions = tokenReloadOptions || {};
    this._state = STATES.UNKNOWN;
    this._lastCheckedAt = null;
    this._version = null;
    this._capabilities = [];
    this._matrixState = "unknown";
    this._agentCount = null;
    this._error = null;
    this._failureCount = 0;
    this._debounceCount = 3;
    this._timer = null;
    this._checking = false;
  }

  static getInstance() {
    if (!MoltHealthMonitor._instance) {
      MoltHealthMonitor._instance = new MoltHealthMonitor();
    }
    return MoltHealthMonitor._instance;
  }

  async start({
    client,
    pollIntervalMs = 60_000,
    debounceCount = 3,
    reloadToken = null,
    tokenReloadOptions = null,
  } = {}) {
    if (client) this.client = client;
    if (reloadToken) this.reloadToken = reloadToken;
    if (tokenReloadOptions) this.tokenReloadOptions = tokenReloadOptions;
    this._debounceCount = Math.max(1, Number(debounceCount) || 3);
    this.stop();
    await this.checkOnce();
    this._timer = setInterval(() => {
      this.checkOnce().catch((error) => {
        console.warn("[MoltHealthMonitor] check failed:", error.message);
      });
    }, pollIntervalMs);
    this._timer.unref?.();
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  isAvailable() {
    return this._state === STATES.CONNECTED;
  }

  status() {
    return {
      state: this._state,
      lastCheckedAt: this._lastCheckedAt,
      version: this._version,
      capabilities: this._capabilities,
      matrixState: this._matrixState,
      agentCount: this._agentCount,
      error: this._error,
    };
  }

  async checkOnce() {
    if (this._checking) return this.status();
    this._checking = true;
    try {
      this._lastCheckedAt = new Date().toISOString();

      if (!this.client) {
        this.#transitionOffline("Molt client is not configured", true);
        return this.status();
      }

      const health = await this.client.health();
      if (isUnauthorized(health)) {
        await this.#handleUnauthorized(health?.error || "Unauthorized");
        return this.status();
      }

      if (!health?.ok) {
        this.#handleFailure(health?.error || "Molt health check failed");
        return this.status();
      }

      this._failureCount = 0;
      await this.#handshake();
      return this.status();
    } finally {
      this._checking = false;
    }
  }

  async manualReconnect() {
    return this.checkOnce();
  }

  async #handshake() {
    const snapshot = await this.client.capabilitySnapshot();
    if (snapshot?.ok === false) {
      this._state = STATES.DEGRADED;
      this._error = snapshot.error || "Molt capability handshake failed";
      this.emit("degraded", this.status());
      return;
    }

    const wasConnected = this._state === STATES.CONNECTED;
    const agentCount = deriveAgentCount(snapshot);
    this._state = STATES.CONNECTED;
    this._version = snapshot?.version || null;
    this._capabilities = Array.isArray(snapshot?.capabilities)
      ? snapshot.capabilities
      : [];
    this._agentCount = agentCount;
    this._matrixState = deriveMatrixState(snapshot, agentCount);
    this._error = null;

    if (!wasConnected) {
      this.emit("connected", {
        version: this._version,
        capabilities: this._capabilities,
      });
    }
  }

  async #reloadTokenWithTimeout() {
    const timeout = new Promise((resolve) => {
      setTimeout(() => resolve(null), 5_000).unref?.();
    });

    try {
      return await Promise.race([
        this.reloadToken(this.tokenReloadOptions),
        timeout,
      ]);
    } catch (error) {
      console.warn("[MoltHealthMonitor] token reload failed:", error.message);
      return null;
    }
  }

  async #handleUnauthorized(error) {
    const token = await this.#reloadTokenWithTimeout();
    if (!token) {
      this.#handleFailure(`${error}: token reload failed`);
      return;
    }

    const retry = await this.client.health();
    if (isUnauthorized(retry)) {
      this.#handleFailure(retry?.error || error || "Unauthorized");
      return;
    }
    if (!retry?.ok) {
      this.#handleFailure(retry?.error || "Molt health check failed");
      return;
    }

    this._failureCount = 0;
    await this.#handshake();
  }

  #handleFailure(error) {
    this._failureCount += 1;
    if (
      this._state === STATES.CONNECTED &&
      this._failureCount < this._debounceCount
    ) {
      this._error = error;
      return;
    }

    this.#transitionOffline(error);
  }

  #transitionOffline(error, forceEmit = false) {
    const wasOffline = this._state === STATES.OFFLINE;
    this._state = STATES.OFFLINE;
    this._error = error;
    if (!wasOffline || forceEmit) this.emit("offline", this.status());
  }
}

MoltHealthMonitor.STATES = STATES;

module.exports = { MoltHealthMonitor, STATES };
