const { visualProductionClient } = require("../utils/visualProduction");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");

function keysFromReq(req) {
  return {
    arkKey: req.headers["x-ark-key"],
    dashscopeKey: req.headers["x-dashscope-key"],
    agnesKey: req.headers["x-agnes-key"],
  };
}

function safeSubpath(raw) {
  if (typeof raw !== "string" || !raw) return null;
  if (/%(?:2e|2f|5c)/i.test(raw)) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  if (decoded.includes("\0")) return null;
  if (decoded.startsWith("/") || /^[a-zA-Z]:/.test(decoded)) return null;
  if (decoded.includes("\\")) return null;

  const parts = decoded.split("/");
  if (parts.some((part) => !part || part === "..")) return null;

  return decoded;
}

async function ensureUp(res) {
  const health = await visualProductionClient.isAvailable();
  if (!health.available) {
    res
      .status(503)
      .json({ error: "visual service unavailable", detail: health.message });
    return false;
  }
  return true;
}

function validateInputPaths(paths) {
  if (!Array.isArray(paths)) return true;
  return paths.every((item) => safeSubpath(item) !== null);
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  const lowerName = name.toLowerCase();
  const direct = headers[name] || headers[lowerName];
  if (direct) return direct;

  const match = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === lowerName
  );
  return match?.[1];
}

function forwardResultHeaders(res, headers) {
  const contentType = headerValue(headers, "content-type");
  const contentLength = headerValue(headers, "content-length");
  const contentDisposition = headerValue(headers, "content-disposition");

  if (contentType) res.setHeader("Content-Type", contentType);
  if (contentLength) res.setHeader("Content-Length", contentLength);
  if (contentDisposition) {
    res.setHeader("Content-Disposition", contentDisposition);
  }
}

function pipeResultStream(stream, res) {
  stream.on("error", (error) => {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }

    res.status(502).json({ error: error.message });
  });
  stream.pipe(res);
}

function sendUpstreamResultError(error, res) {
  const upstreamStatus = error?.response?.status;
  if (!upstreamStatus) return false;

  forwardResultHeaders(res, error.response.headers);

  const data = error.response.data;
  res.status(upstreamStatus);

  if (data && typeof data.pipe === "function") {
    pipeResultStream(data, res);
    return true;
  }

  if (Buffer.isBuffer(data) || typeof data === "string") {
    res.send(data);
    return true;
  }

  res.json(data && typeof data === "object" ? data : { error: error.message });
  return true;
}

function visualProductionEndpoints(app) {
  if (!app) return;

  const guard = [
    validatedRequest,
    flexUserRoleValid([ROLES.admin, ROLES.manager]),
  ];

  app.get("/visual/config", guard, async (req, res) => {
    try {
      if (!(await ensureUp(res))) return;
      res
        .status(200)
        .json(await visualProductionClient.getConfig(keysFromReq(req)));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/visual/estimate", guard, async (req, res) => {
    try {
      if (!(await ensureUp(res))) return;
      res
        .status(200)
        .json(await visualProductionClient.estimate(req.body, keysFromReq(req)));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/visual/submit", guard, async (req, res) => {
    try {
      if (!(await ensureUp(res))) return;
      res
        .status(200)
        .json(await visualProductionClient.submit(req.body, keysFromReq(req)));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/visual/jobs", guard, async (req, res) => {
    try {
      if (!(await ensureUp(res))) return;
      res
        .status(200)
        .json(await visualProductionClient.listJobs(keysFromReq(req)));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/visual/jobs/:id", guard, async (req, res) => {
    try {
      if (!(await ensureUp(res))) return;
      res
        .status(200)
        .json(
          await visualProductionClient.getJob(req.params.id, keysFromReq(req))
        );
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/visual/results/*", guard, async (req, res) => {
    try {
      if (!(await ensureUp(res))) return;

      const subpath = safeSubpath(req.params[0]);
      if (!subpath) {
        return res.status(400).json({ error: "invalid result path" });
      }

      const { stream, headers } = await visualProductionClient.resultStream(
        subpath,
        keysFromReq(req)
      );
      forwardResultHeaders(res, headers);
      pipeResultStream(stream, res);
    } catch (e) {
      if (sendUpstreamResultError(e, res)) return;
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/visual/stitch", guard, async (req, res) => {
    try {
      if (!(await ensureUp(res))) return;
      if (!validateInputPaths(req.body?.inputs)) {
        return res.status(400).json({ error: "invalid stitch input path" });
      }
      res
        .status(200)
        .json(await visualProductionClient.stitch(req.body, keysFromReq(req)));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/visual/title", guard, async (req, res) => {
    try {
      if (!(await ensureUp(res))) return;
      if (req.body?.video != null && safeSubpath(req.body.video) === null) {
        return res.status(400).json({ error: "invalid video path" });
      }
      res
        .status(200)
        .json(await visualProductionClient.title(req.body, keysFromReq(req)));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { visualProductionEndpoints, safeSubpath, keysFromReq };
