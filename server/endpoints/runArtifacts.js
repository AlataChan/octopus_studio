const fs = require("fs");
const path = require("path");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const prisma = require("../utils/prisma");
const {
  safeJsonParse,
  userFromSession,
  multiUserMode,
} = require("../utils/http");
const {
  assertWorkspaceResourceAccess,
} = require("../utils/access/assertWorkspaceResourceAccess");

function storageRoot() {
  if (process.env.STORAGE_DIR) return path.resolve(process.env.STORAGE_DIR);
  return path.resolve(__dirname, "../storage");
}

function isPathInside(baseDir, targetPath) {
  const rel = path.relative(baseDir, targetPath);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function assertArtifactAccess({ artifactId, request, response }) {
  const artifact = await prisma.run_artifacts.findUnique({
    where: { id: String(artifactId) },
    include: { run: true },
  });
  if (!artifact) {
    response.status(404).json({ error: "Artifact not found" });
    return { ok: false };
  }

  const user = await userFromSession(request, response);
  const access = await assertWorkspaceResourceAccess({
    workspaceId: artifact.run.workspaceId,
    user,
    multiUserMode: multiUserMode(response),
  });
  if (!access.ok) {
    const unauthenticated = access.status === 401;
    response
      .status(unauthenticated ? 401 : 404)
      .json({
        error: unauthenticated ? "Unauthenticated" : "Artifact not found",
      });
    return { ok: false };
  }

  return { ok: true, artifact };
}

function runArtifactsEndpoints(app) {
  if (!app) return;

  // GET /api/run-artifacts/:id
  app.get(
    "/run-artifacts/:id",
    [validatedRequest],
    async (request, response) => {
      const { ok, artifact } = await assertArtifactAccess({
        artifactId: request.params.id,
        request,
        response,
      });
      if (!ok) return;

      return response.json({
        ...artifact,
        metadata: safeJsonParse(artifact.metadata, {}),
      });
    }
  );

  // GET /api/run-artifacts/:id/download
  app.get(
    "/run-artifacts/:id/download",
    [validatedRequest],
    async (request, response) => {
      const { ok, artifact } = await assertArtifactAccess({
        artifactId: request.params.id,
        request,
        response,
      });
      if (!ok) return;

      const ref = String(artifact.storageRef || "").trim();
      if (!ref) return response.status(404).json({ error: "No storageRef" });

      const baseDir = storageRoot();
      const absPath = path.resolve(baseDir, ref);
      if (!isPathInside(baseDir, absPath)) {
        return response.status(400).json({ error: "Invalid storageRef" });
      }

      if (!fs.existsSync(absPath)) {
        return response.status(404).json({ error: "File not found" });
      }

      if (artifact.mimeType)
        response.setHeader("Content-Type", artifact.mimeType);
      response.setHeader("Content-Disposition", "attachment");
      return response.sendFile(absPath);
    }
  );
}

module.exports = { runArtifactsEndpoints };
