const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { openClawService } = require("../utils/openClaw");

function adminOnly() {
  return [validatedRequest, flexUserRoleValid([ROLES.admin])];
}

function openClawEndpoints(app) {
  app.get("/openclaw/install/check", adminOnly(), async (_req, res) => {
    const result = await openClawService.checkInstalled();
    return res.json({ success: true, ...result });
  });

  app.get("/openclaw/env/node", adminOnly(), (_req, res) => {
    return res.json({ success: true, ...openClawService.checkNodeVersion() });
  });

  app.get("/openclaw/env/git", adminOnly(), (_req, res) => {
    return res.json({ success: true, ...openClawService.checkGitAvailable() });
  });

  app.get("/openclaw/env/node/download-url", adminOnly(), (_req, res) => {
    return res.json({ url: openClawService.getNodeDownloadUrl() });
  });

  app.get("/openclaw/env/git/download-url", adminOnly(), (_req, res) => {
    return res.json({ url: openClawService.getGitDownloadUrl() });
  });

  app.get("/openclaw/status", adminOnly(), async (_req, res) => {
    const result = await openClawService.checkGatewayStatus();
    return res.json({ success: true, ...result });
  });

  app.post("/openclaw/gateway/start", adminOnly(), async (req, res) => {
    const port = Number(req.body?.port) || 18790;
    const result = await openClawService.startGateway(port);
    return res.json({ success: result.success, message: result.message });
  });

  app.post("/openclaw/gateway/stop", adminOnly(), async (_req, res) => {
    const result = await openClawService.stopGateway();
    return res.json({ success: result.success, message: result.message });
  });

  app.post("/openclaw/gateway/restart", adminOnly(), async (_req, res) => {
    const result = await openClawService.restartGateway();
    return res.json({ success: result.success, message: result.message });
  });

  app.post("/openclaw/config/sync", adminOnly(), async (req, res) => {
    const { provider, model, apiKey, apiBase } = req.body || {};
    if (!provider || !model) {
      return res
        .status(400)
        .json({ success: false, error: "provider and model are required" });
    }
    try {
      const result = openClawService.syncProviderConfig({
        provider,
        model,
        apiKey,
        apiBase,
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/openclaw/config", adminOnly(), (_req, res) => {
    return res.json({
      success: true,
      config: openClawService.getConfigSummary(),
    });
  });

  app.get("/openclaw/dashboard/url", adminOnly(), (_req, res) => {
    return res.json({ url: openClawService.getDashboardUrl() });
  });
}

module.exports = { openClawEndpoints };
