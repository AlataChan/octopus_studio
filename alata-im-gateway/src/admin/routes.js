const { Router } = require("express");
const {
  loadBindings,
  saveBinding,
  deleteBinding,
  bindingDiagnostics,
} = require("../router/bindings");
const { getGatewayConfigMode } = require("../runtime/configStore");

function createAdminRouter({ env = process.env } = {}) {
  const router = Router();

  router.use((req, res, next) => {
    const secret = env.ADMIN_SECRET;
    if (secret) {
      if (req.headers["x-admin-secret"] !== secret) {
        return res.status(403).json({ error: "Forbidden" });
      }
    } else {
      const ip = req.ip || req.connection?.remoteAddress;
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) {
        return res
          .status(403)
          .json({ error: "Admin requires ADMIN_SECRET in production" });
      }
    }
    next();
  });

  router.get("/diagnostics", (_req, res) =>
    res.json(bindingDiagnostics({ env }))
  );

  router.get("/bindings", (_req, res) => {
    if (getGatewayConfigMode(env) === "managed") {
      return res.json(bindingDiagnostics({ env }));
    }
    return res.json(loadBindings({ env }));
  });

  router.post("/bindings", (req, res) => {
    if (getGatewayConfigMode(env) === "managed") {
      return res.status(409).json({
        error: "Bindings are managed by the Alata control plane",
      });
    }
    const binding = req.body;
    if (!binding.id) return res.status(400).json({ error: "id required" });
    saveBinding(binding, { env });
    res.status(201).json({ ok: true });
  });

  router.delete("/bindings/:id", (req, res) => {
    if (getGatewayConfigMode(env) === "managed") {
      return res.status(409).json({
        error: "Bindings are managed by the Alata control plane",
      });
    }
    deleteBinding(req.params.id, { env });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminRouter };
