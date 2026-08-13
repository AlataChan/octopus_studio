import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

function overrideKeyHeaders() {
  const headers = {};
  if (typeof window === "undefined") return headers;

  const ark = window.sessionStorage.getItem("visual_ark_key");
  const dashscope = window.sessionStorage.getItem("visual_dashscope_key");
  const agnes = window.sessionStorage.getItem("visual_agnes_key");

  if (ark) headers["X-Ark-Key"] = ark;
  if (dashscope) headers["X-Dashscope-Key"] = dashscope;
  if (agnes) headers["X-Agnes-Key"] = agnes;
  return headers;
}

function cleanHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value != null && value !== "")
  );
}

async function req(path, { method = "GET", body } = {}) {
  return fetch(`${API_BASE}/visual${path}`, {
    method,
    headers: cleanHeaders({
      ...baseHeaders(),
      ...overrideKeyHeaders(),
      "Content-Type": "application/json",
    }),
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function readResponsePayload(res) {
  try {
    return await res.json();
  } catch {}

  try {
    const text = await res.text();
    return text ? { error: text } : null;
  } catch {}

  return null;
}

function responseMessage(res, payload) {
  return (
    payload?.error ||
    payload?.detail ||
    payload?.message ||
    `Visual production request failed (${res.status}${
      res.statusText ? ` ${res.statusText}` : ""
    })`
  );
}

function responseError(res, payload) {
  const error = new Error(responseMessage(res, payload));
  error.status = res.status;
  error.statusText = res.statusText;
  error.payload = payload;
  return error;
}

async function parseJsonResponse(res) {
  const payload = await readResponsePayload(res);
  if (!res.ok) throw responseError(res, payload);
  return payload;
}

function encodeResultPath(subpath) {
  return String(subpath || "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

// Result entries are stored as "<jobId>/results/<file>", but the sidecar's
// /api/results/<jobId>/<file> route re-inserts the "results" segment itself.
// Strip the marker so we send "<jobId>/<file>" and avoid a doubled
// "results/results/" path (which 404s). Mirrors the agent plugin + sidecar UI.
function stripResultsMarker(subpath) {
  const value = String(subpath || "");
  const marker = "/results/";
  const idx = value.indexOf(marker);
  if (idx < 0) return value;
  const jobId = value.slice(0, idx);
  const filename = value.slice(idx + marker.length);
  return jobId ? `${jobId}/${filename}` : filename;
}

function downloadFilename(subpath, explicitName) {
  if (explicitName) return explicitName;
  const cleanPath = stripResultsMarker(subpath).split("?")[0];
  return cleanPath.split("/").filter(Boolean).pop() || "visual-result";
}

const VisualProduction = {
  isReady: async function () {
    try {
      const res = await req("/config");
      return res.ok;
    } catch {
      return false;
    }
  },
  getConfig: async function () {
    return parseJsonResponse(await req("/config"));
  },
  estimate: async function (body) {
    return parseJsonResponse(await req("/estimate", { method: "POST", body }));
  },
  submit: async function (body) {
    return parseJsonResponse(await req("/submit", { method: "POST", body }));
  },
  getJob: async function (id) {
    return parseJsonResponse(await req(`/jobs/${encodeURIComponent(id)}`));
  },
  listJobs: async function () {
    return parseJsonResponse(await req("/jobs"));
  },
  stitch: async function (body) {
    return parseJsonResponse(await req("/stitch", { method: "POST", body }));
  },
  title: async function (body) {
    return parseJsonResponse(await req("/title", { method: "POST", body }));
  },
  resultUrl: function (subpath) {
    return `${API_BASE}/visual/results/${encodeResultPath(stripResultsMarker(subpath))}`;
  },
  downloadResult: async function (subpath, filename) {
    const res = await fetch(this.resultUrl(subpath), {
      method: "GET",
      headers: cleanHeaders({
        ...baseHeaders(),
        ...overrideKeyHeaders(),
      }),
    });

    if (!res.ok) {
      throw responseError(res, await readResponsePayload(res));
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = downloadFilename(subpath, filename);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};

export default VisualProduction;
