const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_GET_ATTEMPTS = 2;

class FdeServiceError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = "FdeServiceError";
    this.code = code;
    this.status = status;
    this.path = "fdeService";
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serviceUrl(value) {
  if (!value) throw new FdeServiceError("FDE_SERVICE_NOT_CONFIGURED", 503);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new FdeServiceError("FDE_SERVICE_URL_INVALID", 503);
  }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new FdeServiceError("FDE_SERVICE_TLS_REQUIRED", 503);
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
}

function sessionCookie(headers) {
  const raw = headers.get("set-cookie") || "";
  const match = raw.match(/(?:^|[,;]\s*)fde_session=([^;,\s]+)/);
  return match ? `fde_session=${match[1]}` : null;
}

function createFdeClient({
  baseUrl = process.env.FDE_SERVICE_URL,
  username = process.env.FDE_SERVICE_USERNAME,
  password = process.env.FDE_SERVICE_PASSWORD,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = global.fetch,
  sleep = sleepMs,
} = {}) {
  const url = serviceUrl(baseUrl);
  const basePath = url.pathname === "/" ? "" : url.pathname;
  if (!username || !password) {
    throw new FdeServiceError("FDE_SERVICE_CREDENTIALS_MISSING", 503);
  }
  if (typeof fetchImpl !== "function") {
    throw new FdeServiceError("FDE_SERVICE_FETCH_UNAVAILABLE", 503);
  }
  let cookie = null;
  let loginPromise = null;

  async function fetchWithTimeout(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(`${url.origin}${basePath}${path}`, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new FdeServiceError("FDE_SERVICE_TIMEOUT", 504);
      }
      throw new FdeServiceError("FDE_SERVICE_UNAVAILABLE", 502);
    } finally {
      clearTimeout(timer);
    }
  }

  async function login() {
    if (loginPromise) return loginPromise;
    loginPromise = (async () => {
      const response = await fetchWithTimeout("/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: url.origin,
        },
        body: JSON.stringify({ username, password }),
      });
      const nextCookie = sessionCookie(response.headers);
      if (!response.ok || !nextCookie) {
        throw new FdeServiceError("FDE_SERVICE_AUTH_FAILED", 502);
      }
      cookie = nextCookie;
    })();
    try {
      await loginPromise;
    } finally {
      loginPromise = null;
    }
  }

  async function request(path, { method = "GET", body, raw = false } = {}) {
    if (!cookie) await login();
    const isGet = method === "GET";
    const attempts = isGet ? MAX_GET_ATTEMPTS : 1;
    let reauthenticated = false;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response;
      try {
        response = await fetchWithTimeout(path, {
          method,
          headers: {
            Accept: raw ? "application/octet-stream" : "application/json",
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            Cookie: cookie,
            ...(isGet ? {} : { Origin: url.origin }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch (error) {
        if (isGet && attempt < attempts) {
          await sleep(25 * 2 ** (attempt - 1));
          continue;
        }
        throw error;
      }

      if (response.status === 401 && !reauthenticated) {
        cookie = null;
        await login();
        reauthenticated = true;
        attempt -= 1;
        continue;
      }
      if (!response.ok) {
        if (isGet && response.status >= 500 && attempt < attempts) {
          await sleep(25 * 2 ** (attempt - 1));
          continue;
        }
        throw new FdeServiceError("FDE_SERVICE_UPSTREAM_ERROR", 502);
      }
      if (raw) return response.text();
      try {
        return await response.json();
      } catch {
        throw new FdeServiceError("FDE_SERVICE_RESPONSE_INVALID", 502);
      }
    }
    throw new FdeServiceError("FDE_SERVICE_UNAVAILABLE", 502);
  }

  return Object.freeze({
    createSession: () => request("/v1/sessions", { method: "POST", body: {} }),
    createTurn: (sessionId, userMessage) =>
      request(`/v1/sessions/${encodeURIComponent(sessionId)}/turns`, {
        method: "POST",
        body: { user_message: userMessage },
      }),
    getIr: (sessionId) =>
      request(`/v1/sessions/${encodeURIComponent(sessionId)}/ir`),
    getDiff: (sessionId, fromTurn, toTurn) => {
      const query = new URLSearchParams({
        from_turn: fromTurn,
        to_turn: toTurn,
      });
      return request(
        `/v1/sessions/${encodeURIComponent(sessionId)}/ir/diff?${query}`
      );
    },
    compile: (sessionId) =>
      request(`/v1/sessions/${encodeURIComponent(sessionId)}/compile`, {
        method: "POST",
        body: { target: "studio" },
      }),
    listArtifacts: (sessionId) =>
      request(`/v1/sessions/${encodeURIComponent(sessionId)}/artifacts`),
    downloadArtifact: (sessionId, artifactId) =>
      request(
        `/v1/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(
          artifactId
        )}`,
        { raw: true }
      ),
  });
}

let sharedClient = null;

function fdeConfigured() {
  return Boolean(process.env.FDE_SERVICE_URL);
}

function getFdeClient() {
  if (!sharedClient) sharedClient = createFdeClient();
  return sharedClient;
}

function resetFdeClientForTests() {
  sharedClient = null;
}

module.exports = {
  FdeServiceError,
  createFdeClient,
  fdeConfigured,
  getFdeClient,
  resetFdeClientForTests,
};
