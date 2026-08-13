const axios = require("axios");

const BASE_URL =
  process.env.VISUAL_PRODUCTION_URL || "http://127.0.0.1:8868";

function buildKeyHeaders(keys = {}) {
  const headers = {};
  if (keys.arkKey) headers["X-Ark-Key"] = keys.arkKey;
  if (keys.dashscopeKey) headers["X-Dashscope-Key"] = keys.dashscopeKey;
  if (keys.agnesKey) headers["X-Agnes-Key"] = keys.agnesKey;
  return headers;
}

function encodeResultSubpath(subpath) {
  return String(subpath).split("/").map(encodeURIComponent).join("/");
}

class VisualProductionClient {
  constructor(baseURL = BASE_URL, options = {}) {
    this.baseURL = baseURL;
    this._http = axios.create({
      baseURL,
      timeout: options.timeout || 120000,
    });
  }

  async isAvailable() {
    try {
      const response = await this._http.get("/api/config", { timeout: 5000 });
      return { available: response.status === 200, message: "ok" };
    } catch (e) {
      return { available: false, message: `not reachable: ${e.message}` };
    }
  }

  async getConfig(keys) {
    const response = await this._http.get("/api/config", {
      headers: buildKeyHeaders(keys),
    });
    return response.data;
  }

  async estimate(body, keys) {
    const response = await this._http.post("/api/estimate", body, {
      headers: buildKeyHeaders(keys),
    });
    return response.data;
  }

  async submit(body, keys) {
    const response = await this._http.post("/api/jobs", body, {
      headers: buildKeyHeaders(keys),
    });
    return response.data;
  }

  async listJobs(keys) {
    const response = await this._http.get("/api/jobs", {
      headers: buildKeyHeaders(keys),
    });
    return response.data;
  }

  async getJob(id, keys) {
    const response = await this._http.get(`/api/jobs/${encodeURIComponent(id)}`, {
      headers: buildKeyHeaders(keys),
    });
    return response.data;
  }

  async stitch(body, keys) {
    const response = await this._http.post("/api/stitch", body, {
      headers: buildKeyHeaders(keys),
    });
    return response.data;
  }

  async title(body, keys) {
    const response = await this._http.post("/api/compose", body, {
      headers: buildKeyHeaders(keys),
    });
    return response.data;
  }

  async resultStream(subpath, keys) {
    const response = await this._http.get(
      `/api/results/${encodeResultSubpath(subpath)}`,
      {
        headers: buildKeyHeaders(keys),
        responseType: "stream",
      }
    );
    return { stream: response.data, headers: response.headers };
  }
}

const visualProductionClient = new VisualProductionClient();

module.exports = {
  VisualProductionClient,
  visualProductionClient,
  buildKeyHeaders,
  encodeResultSubpath,
};
