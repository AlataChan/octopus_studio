const fs = require("fs");
const path = require("path");
const { reqBody } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { CodingRunManager } = require("../utils/agents/coding/codingRunManager");

function isUnderRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function realpathIfExists(targetPath) {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return null;
  }
}

function resolveAllowedSourceRoots(env = process.env) {
  const raw = String(env.CODING_AGENT_ALLOWED_SOURCE_ROOTS || "").trim();
  if (!raw) return [];
  return raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => realpathIfExists(path.resolve(entry)))
    .filter(Boolean);
}

function authorizeSourcePath(sourceRepoPath, allowedRoots) {
  if (!sourceRepoPath || typeof sourceRepoPath !== "string") return null;
  const realSource = realpathIfExists(path.resolve(String(sourceRepoPath || "")));
  if (!realSource || !allowedRoots.length) return null;
  return allowedRoots.some((root) => isUnderRoot(realSource, root))
    ? realSource
    : null;
}

const defaultManager = new CodingRunManager({
  allowlistResolver: resolveAllowedSourceRoots,
});

function codingAgentEndpoints(app, { manager = defaultManager } = {}) {
  if (!app) return;
  const guard = [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])];

  app.post("/coding-agent/runs", guard, async (request, response) => {
    try {
      const body = reqBody(request) || {};
      const allowedSourceRoots = resolveAllowedSourceRoots();
      const sourceRepoPath = authorizeSourcePath(body.sourceRepoPath, allowedSourceRoots);
      if (!sourceRepoPath) {
        return response.status(403).json({
          success: false,
          error: "Source repo is not authorized",
        });
      }
      const result = await manager.createRun({
        sourceRepoPath,
        prompt: body.prompt || body.goal || "",
        provider: body.provider,
        model: body.model,
        maxTurns: body.maxTurns,
        dependencyMode: body.dependencyMode,
        allowedSourceRoots,
      });
      return response.status(202).json({ success: true, ...result });
    } catch (error) {
      return response.status(500).json({
        success: false,
        error: error?.message || String(error),
      });
    }
  });

  app.get("/coding-agent/runs/:id", guard, async (request, response) => {
    const run = manager.getRun(request.params.id);
    if (!run) return response.status(404).json({ success: false, error: "Run not found" });
    return response.json({ success: true, data: run });
  });

  app.get("/coding-agent/runs/:id/events", guard, async (request, response) => {
    const events = manager.listEvents(request.params.id, {
      afterSequence: Number(request.query.after || 0),
    });
    if (!events) return response.status(404).json({ success: false, error: "Run not found" });
    return response.json({ success: true, events });
  });

  app.post("/coding-agent/runs/:id/approve", guard, async (request, response) => {
    const body = reqBody(request) || {};
    const result = await manager.approve(request.params.id, {
      approvalId: body.approvalId,
      approved: body.approved === true,
    });
    if (result?.code === "run_not_found") {
      return response.status(404).json({ success: false, error: "Run not found" });
    }
    return response.json({ success: true, result });
  });

  app.post("/coding-agent/runs/:id/cancel", guard, async (request, response) => {
    const result = manager.cancel(request.params.id);
    if (result?.code === "run_not_found") {
      return response.status(404).json({ success: false, error: "Run not found" });
    }
    return response.json({ success: true, result });
  });

  app.get("/coding-agent/runs/:id/patch", guard, async (request, response) => {
    const patch = await manager.getPatch(request.params.id);
    if (!patch) return response.status(404).json({ success: false, error: "Run not found" });
    return response.json({ success: true, patch });
  });

  app.post("/coding-agent/runs/:id/apply", guard, async (request, response) => {
    const body = reqBody(request) || {};
    const result = await manager.applyBack(request.params.id, {
      approved: body.approved === true,
      conflictPolicy: body.conflictPolicy,
    });
    if (result?.status === "run_not_found") {
      return response.status(404).json({ success: false, error: "Run not found" });
    }
    return response.json({ success: true, result });
  });
}

module.exports = {
  codingAgentEndpoints,
  resolveAllowedSourceRoots,
  authorizeSourcePath,
};
