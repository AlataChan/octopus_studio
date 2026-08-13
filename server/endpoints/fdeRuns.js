const prisma = require("../utils/prisma");
const {
  userFromSession,
  multiUserMode,
  safeJsonParse,
} = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const {
  FDE_ACTIONS,
  authorizeFdeAction,
} = require("../utils/fde/fdeAuthorization");
const {
  FdeRequestError,
  validateFdeBody,
} = require("../utils/fde/fdeRequestValidation");
const { FdeWorkflowDraft } = require("../models/fdeWorkflowDraft");
const { Run } = require("../models/run");
const { RunEvent } = require("../models/runEvent");
const { RunArtifact } = require("../models/runArtifact");
const {
  createStudioRun,
  queueStudioRun,
  resumeStudioRun,
} = require("../utils/fde/studioRunService");
const { runStatusEvidence } = require("../utils/fde/runEvidence");

const CREATE_BODY = {
  allowedKeys: ["inputs"],
  maxBytes: 256 * 1024,
  maxDepth: 8,
  rejectSecrets: true,
};
const EMPTY_BODY = { allowedKeys: [], maxBytes: 1024, maxDepth: 1 };

function sendError(response, error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const known = error instanceof FdeRequestError || code.startsWith("STUDIO_");
  return response.status(known ? error.status || 400 : 500).json({
    code: known ? code : "STUDIO_INTERNAL_ERROR",
    path: known ? error.path || "request" : "request",
  });
}

async function workspaceContext(request, response, action) {
  const workspace = await prisma.workspaces.findUnique({
    where: { slug: String(request.params.slug || "") },
    select: { id: true, slug: true },
  });
  if (!workspace) {
    response.status(404).json({
      code: "STUDIO_WORKSPACE_NOT_FOUND",
      path: "workspace",
    });
    return null;
  }
  const user = await userFromSession(request, response);
  const access = await authorizeFdeAction({
    action,
    workspaceId: workspace.id,
    user,
    multiUserMode: multiUserMode(response),
  });
  if (!access.ok) {
    const unauthenticated = access.status === 401;
    response.status(unauthenticated ? 401 : 404).json({
      code: unauthenticated
        ? "STUDIO_UNAUTHENTICATED"
        : "STUDIO_WORKSPACE_NOT_FOUND",
      path: "workspace",
    });
    return null;
  }
  return { workspace, user };
}

async function runContext(request, response, action) {
  const context = await workspaceContext(request, response, action);
  if (!context) return null;
  const run = await Run.getById(String(request.params.runId));
  if (
    !run ||
    Number(run.workspaceId) !== Number(context.workspace.id) ||
    !run.fdeWorkflowDraftId
  ) {
    response.status(404).json({
      code: "STUDIO_RUN_NOT_FOUND",
      path: "run",
    });
    return null;
  }
  return { ...context, run };
}

function fdeRunEndpoints(app) {
  if (!app) return;
  const middleware = [validatedRequest, flexUserRoleValid([ROLES.all])];

  app.post(
    "/workspace/:slug/fde-workflows/:id/runs",
    middleware,
    async (request, response) => {
      try {
        const context = await workspaceContext(
          request,
          response,
          FDE_ACTIONS.CREATE_RUN
        );
        if (!context) return;
        const body = validateFdeBody(request, CREATE_BODY);
        if (
          !body.inputs ||
          Array.isArray(body.inputs) ||
          typeof body.inputs !== "object"
        ) {
          throw new FdeRequestError("STUDIO_RUN_INPUT_INVALID", "inputs");
        }
        const draft = await FdeWorkflowDraft.getInWorkspace(
          request.params.id,
          context.workspace.id
        );
        if (!draft) {
          return response.status(404).json({
            code: "STUDIO_DRAFT_NOT_FOUND",
            path: "draft",
          });
        }
        if (draft.status !== "published") {
          throw new FdeRequestError(
            "STUDIO_RUN_PUBLISHED_REQUIRED",
            "draft",
            409
          );
        }
        const run = await createStudioRun({
          draft,
          workspace: context.workspace,
          inputs: body.inputs,
          actor: context.user,
          engine: draft.engine,
        });
        queueStudioRun(run.id);
        return response.status(202).json({ data: { run } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.get(
    "/workspace/:slug/fde-runs/:runId",
    middleware,
    async (request, response) => {
      try {
        const context = await runContext(
          request,
          response,
          FDE_ACTIONS.RUN_DETAIL
        );
        if (!context) return;
        return response.json({
          data: {
            run: {
              ...context.run,
              metadata: safeJsonParse(context.run.metadata, {}),
            },
          },
        });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.get(
    "/workspace/:slug/fde-runs/:runId/events",
    middleware,
    async (request, response) => {
      try {
        const context = await runContext(
          request,
          response,
          FDE_ACTIONS.RUN_EVENTS
        );
        if (!context) return;
        const events = await RunEvent.listByRun(context.run.id);
        return response.json({ data: { events } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.get(
    "/workspace/:slug/fde-runs/:runId/artifacts",
    middleware,
    async (request, response) => {
      try {
        const context = await runContext(
          request,
          response,
          FDE_ACTIONS.RUN_ARTIFACTS
        );
        if (!context) return;
        const artifacts = await RunArtifact.listByRun(context.run.id);
        return response.json({ data: { artifacts } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.post(
    "/workspace/:slug/fde-runs/:runId/cancel",
    middleware,
    async (request, response) => {
      try {
        const context = await runContext(
          request,
          response,
          FDE_ACTIONS.CANCEL_RUN
        );
        if (!context) return;
        validateFdeBody(request, EMPTY_BODY);
        const run = await Run.updateStatus(context.run.id, "cancelled");
        await RunEvent.append({
          runId: context.run.id,
          ...runStatusEvidence("cancelled"),
        });
        return response.json({ data: { run } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.post(
    "/workspace/:slug/fde-runs/:runId/resume",
    middleware,
    async (request, response) => {
      try {
        const context = await runContext(
          request,
          response,
          FDE_ACTIONS.RESUME_RUN
        );
        if (!context) return;
        validateFdeBody(request, EMPTY_BODY);
        const run = await resumeStudioRun(context.run.id);
        return response.status(202).json({ data: { run } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );
}

module.exports = { fdeRunEndpoints };
