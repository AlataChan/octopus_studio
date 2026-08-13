const prisma = require("../utils/prisma");
const { userFromSession, multiUserMode } = require("../utils/http");
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
const { getFdeClient } = require("../utils/fde/fdeClient");
const { FdeAuthoringSession } = require("../models/fdeAuthoringSession");
const { FdeWorkflowDraft } = require("../models/fdeWorkflowDraft");
const {
  persistStudioWorkflowSpec,
} = require("../utils/fde/studioWorkflowImporter");
const { redactFdeValue } = require("../utils/fde/redaction");

const EMPTY_BODY = { allowedKeys: [], maxBytes: 1024, maxDepth: 1 };
const TURN_BODY = {
  allowedKeys: ["user_message"],
  maxBytes: 64 * 1024,
  maxDepth: 1,
  rejectSecrets: true,
};
const COMPILE_BODY = {
  allowedKeys: ["lineageKey", "parentDraftId"],
  maxBytes: 4 * 1024,
  maxDepth: 1,
};

function sendError(response, error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const known =
    error instanceof FdeRequestError ||
    code.startsWith("STUDIO_") ||
    code.startsWith("FDE_SERVICE_");
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

async function authoringContext(request, response, action) {
  const context = await workspaceContext(request, response, action);
  if (!context) return null;
  const session = await FdeAuthoringSession.getInWorkspace(
    request.params.draftId,
    context.workspace.id
  );
  if (!session) {
    response.status(404).json({
      code: "STUDIO_AUTHORING_SESSION_NOT_FOUND",
      path: "authoringSession",
    });
    return null;
  }
  return { ...context, session };
}

function requireTurnPair(session) {
  if (!session.fdeFromTurnId || !session.fdeToTurnId) {
    throw new FdeRequestError(
      "STUDIO_DIFF_TURNS_REQUIRED",
      "authoringSession",
      409
    );
  }
}

async function semanticDiffForImport({ workspaceId, session, body, client }) {
  if (!body.lineageKey) return null;
  const previous = await FdeWorkflowDraft.getLatestInLineage(
    workspaceId,
    body.lineageKey
  );
  if (!previous) return null;
  const sameHistory =
    previous.fdeSessionId === session.fdeSessionId &&
    previous.fdeToTurnId === session.fdeFromTurnId &&
    (!body.parentDraftId || body.parentDraftId === previous.id);
  if (!sameHistory) {
    throw new FdeRequestError(
      "STUDIO_DIFF_LINEAGE_MISMATCH",
      "lineageKey",
      409
    );
  }
  requireTurnPair(session);
  const diff = await client.getDiff(
    session.fdeSessionId,
    session.fdeFromTurnId,
    session.fdeToTurnId
  );
  return JSON.stringify(redactFdeValue(diff, { maxDepth: 32 }));
}

function fdeAuthoringEndpoints(app) {
  if (!app) return;
  const middleware = [validatedRequest, flexUserRoleValid([ROLES.all])];

  app.post(
    "/workspace/:slug/fde-workflows/sessions",
    middleware,
    async (request, response) => {
      try {
        const context = await workspaceContext(
          request,
          response,
          FDE_ACTIONS.CREATE_SESSION
        );
        if (!context) return;
        validateFdeBody(request, EMPTY_BODY);
        const remote = await getFdeClient().createSession();
        if (typeof remote?.session_id !== "string") {
          throw new FdeRequestError(
            "FDE_SERVICE_RESPONSE_INVALID",
            "fdeService",
            502
          );
        }
        const session = await FdeAuthoringSession.create({
          workspaceId: context.workspace.id,
          fdeSessionId: remote.session_id,
          createdByUserId: context.user?.id ?? null,
        });
        return response.status(201).json({ data: { session, remote } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.post(
    "/workspace/:slug/fde-workflows/sessions/:draftId/turns",
    middleware,
    async (request, response) => {
      try {
        const context = await authoringContext(
          request,
          response,
          FDE_ACTIONS.CREATE_TURN
        );
        if (!context) return;
        const body = validateFdeBody(request, TURN_BODY);
        if (
          typeof body.user_message !== "string" ||
          !body.user_message.trim()
        ) {
          throw new FdeRequestError(
            "STUDIO_TURN_MESSAGE_INVALID",
            "user_message"
          );
        }
        const turn = await getFdeClient().createTurn(
          context.session.fdeSessionId,
          body.user_message
        );
        if (typeof turn?.turn_id !== "string") {
          throw new FdeRequestError(
            "FDE_SERVICE_RESPONSE_INVALID",
            "fdeService",
            502
          );
        }
        const session = await FdeAuthoringSession.recordTurn(
          context.session.id,
          turn.turn_id
        );
        return response.status(201).json({ data: { session, turn } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.get(
    "/workspace/:slug/fde-workflows/sessions/:draftId/ir",
    middleware,
    async (request, response) => {
      try {
        const context = await authoringContext(
          request,
          response,
          FDE_ACTIONS.GET_IR
        );
        if (!context) return;
        const ir = await getFdeClient().getIr(context.session.fdeSessionId);
        return response.json({ data: { ir } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.get(
    "/workspace/:slug/fde-workflows/sessions/:draftId/diff",
    middleware,
    async (request, response) => {
      try {
        const context = await authoringContext(
          request,
          response,
          FDE_ACTIONS.GET_DIFF
        );
        if (!context) return;
        requireTurnPair(context.session);
        const diff = await getFdeClient().getDiff(
          context.session.fdeSessionId,
          context.session.fdeFromTurnId,
          context.session.fdeToTurnId
        );
        return response.json({ data: { diff } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.post(
    "/workspace/:slug/fde-workflows/sessions/:draftId/compile-import",
    middleware,
    async (request, response) => {
      try {
        const context = await authoringContext(
          request,
          response,
          FDE_ACTIONS.COMPILE_IMPORT
        );
        if (!context) return;
        const body = validateFdeBody(request, COMPILE_BODY);
        const client = getFdeClient();
        const diffJson = await semanticDiffForImport({
          workspaceId: context.workspace.id,
          session: context.session,
          body,
          client,
        });
        const compiled = await client.compile(context.session.fdeSessionId);
        if (typeof compiled?.artifact_id !== "string") {
          throw new FdeRequestError(
            "FDE_SERVICE_RESPONSE_INVALID",
            "fdeService",
            502
          );
        }
        const artifact = await client.downloadArtifact(
          context.session.fdeSessionId,
          compiled.artifact_id
        );
        let spec;
        try {
          spec = JSON.parse(artifact);
        } catch {
          throw new FdeRequestError(
            "FDE_SERVICE_ARTIFACT_INVALID",
            "fdeService",
            502
          );
        }
        const draft = await persistStudioWorkflowSpec({
          spec,
          workspaceId: context.workspace.id,
          actorUserId: context.user?.id ?? null,
          lineageKey: body.lineageKey,
          parentDraftId: body.parentDraftId,
          fdeSessionId: context.session.fdeSessionId,
          fdeFromTurnId: context.session.fdeFromTurnId,
          fdeToTurnId: context.session.fdeToTurnId,
          diffJson,
        });
        return response.status(201).json({ data: { draft } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );
}

module.exports = { fdeAuthoringEndpoints };
