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
  FdeWorkflowDraft,
  STUDIO_REVIEW_POLICY_VERSION,
} = require("../models/fdeWorkflowDraft");
const {
  FDE_ACTIONS,
  authorizeFdeAction,
} = require("../utils/fde/fdeAuthorization");
const {
  persistStudioWorkflowSpec,
} = require("../utils/fde/studioWorkflowImporter");
const { resolveBindings } = require("../utils/fde/studioWorkflowBindings");
const {
  validateFdeBody,
  FdeRequestError,
} = require("../utils/fde/fdeRequestValidation");
const { assertPublishable } = require("../utils/fde/publishGate");

const IMPORT_LIMITS = {
  allowedKeys: ["spec", "lineageKey", "parentDraftId"],
  maxBytes: 512 * 1024,
  maxDepth: 20,
  maxNodes: 200,
  rejectSecrets: true,
};
const REVIEW_LIMITS = {
  maxBytes: 8 * 1024,
  maxDepth: 4,
};
const PUBLISH_LIMITS = {
  allowedKeys: ["expectedStateVersion"],
  maxBytes: 4 * 1024,
  maxDepth: 2,
};

function sendError(response, error) {
  const known =
    error instanceof FdeRequestError ||
    (typeof error?.code === "string" && error.code.startsWith("STUDIO_"));
  const status = known ? error.status || 400 : 500;
  return response.status(status).json({
    code: known ? error.code : "STUDIO_INTERNAL_ERROR",
    path: known ? error.path || "request" : "request",
  });
}

async function resolveWorkspaceAccess(request, response, action) {
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
  return { workspace, user, access };
}

async function resolveDraft(workspaceId, draftId, response) {
  const draft = await FdeWorkflowDraft.getInWorkspace(draftId, workspaceId);
  if (!draft) {
    response.status(404).json({
      code: "STUDIO_DRAFT_NOT_FOUND",
      path: "draft",
    });
    return null;
  }
  return draft;
}

function requiredBindings(draft) {
  try {
    const spec = JSON.parse(draft.specJson);
    const bindings = spec?.workflow?.required_bindings;
    if (!Array.isArray(bindings)) throw new Error("invalid bindings");
    return bindings;
  } catch {
    const error = new Error("invalid stored workflow spec");
    error.code = "STUDIO_DRAFT_SPEC_INVALID";
    error.path = "spec";
    error.status = 409;
    throw error;
  }
}

function bindingResolver(workspaceId) {
  return async ({ draft, tx }) =>
    resolveBindings({
      workspaceId,
      requiredBindings: requiredBindings(draft),
      prismaClient: tx,
    });
}

function assertReviewSeparation(response) {
  if (multiUserMode(response) === false) {
    throw new FdeRequestError(
      "STUDIO_REVIEW_SEPARATION_REQUIRED",
      "review",
      409,
      "approval and publication require multi-user review separation"
    );
  }
}

function fdeWorkflowEndpoints(app) {
  if (!app) return;
  const middleware = [validatedRequest, flexUserRoleValid([ROLES.all])];

  app.post(
    "/workspace/:slug/fde-workflows/import",
    middleware,
    async (request, response) => {
      try {
        const context = await resolveWorkspaceAccess(
          request,
          response,
          FDE_ACTIONS.IMPORT
        );
        if (!context) return;
        const body = validateFdeBody(request, IMPORT_LIMITS);
        const draft = await persistStudioWorkflowSpec({
          spec: body.spec,
          workspaceId: context.workspace.id,
          actorUserId: context.user?.id ?? null,
          lineageKey: body.lineageKey,
          parentDraftId: body.parentDraftId,
        });
        return response.status(201).json({ data: { draft } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.get(
    "/workspace/:slug/fde-workflows",
    middleware,
    async (request, response) => {
      try {
        const context = await resolveWorkspaceAccess(
          request,
          response,
          FDE_ACTIONS.LIST
        );
        if (!context) return;
        const drafts = await FdeWorkflowDraft.listByWorkspace(
          context.workspace.id
        );
        return response.json({ data: { drafts } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.get(
    "/workspace/:slug/fde-workflows/:draftId",
    middleware,
    async (request, response) => {
      try {
        const context = await resolveWorkspaceAccess(
          request,
          response,
          FDE_ACTIONS.DETAIL
        );
        if (!context) return;
        const draft = await resolveDraft(
          context.workspace.id,
          request.params.draftId,
          response
        );
        if (!draft) return;
        return response.json({
          data: {
            draft,
            diff: safeJsonParse(draft.diffJson, null),
          },
        });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.post(
    "/workspace/:slug/fde-workflows/:draftId/review",
    middleware,
    async (request, response) => {
      try {
        const decision = request.body?.decision;
        const action = {
          request: FDE_ACTIONS.REQUEST_REVIEW,
          approve: FDE_ACTIONS.APPROVE,
          reject: FDE_ACTIONS.REJECT,
        }[decision];
        if (!action) {
          const error = new FdeRequestError(
            "STUDIO_REVIEW_DECISION_INVALID",
            "decision",
            400,
            "review decision is invalid"
          );
          throw error;
        }
        const allowedKeys =
          decision === "request"
            ? ["decision", "expectedStateVersion"]
            : ["decision", "expectedStateVersion"];
        const body = validateFdeBody(request, {
          ...REVIEW_LIMITS,
          allowedKeys,
        });
        const context = await resolveWorkspaceAccess(request, response, action);
        if (!context) return;
        const draft = await resolveDraft(
          context.workspace.id,
          request.params.draftId,
          response
        );
        if (!draft) return;

        let updated;
        if (decision === "request") {
          updated = await FdeWorkflowDraft.requestReview({
            id: draft.id,
            assignedReviewerId: null,
            expectedStateVersion: body.expectedStateVersion,
          });
        } else if (decision === "reject") {
          updated = await FdeWorkflowDraft.reject({
            id: draft.id,
            actorUserId: context.user?.id ?? null,
            expectedStateVersion: body.expectedStateVersion,
          });
        } else {
          assertReviewSeparation(response);
          updated = await FdeWorkflowDraft.approve({
            id: draft.id,
            actorUserId: context.user?.id ?? null,
            separationOfDutySatisfied: true,
            expectedStateVersion: body.expectedStateVersion,
            resolveFreshBindings: bindingResolver(context.workspace.id),
            studioReviewPolicyVersion: STUDIO_REVIEW_POLICY_VERSION,
          });
        }
        return response.json({ data: { draft: updated } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );

  app.post(
    "/workspace/:slug/fde-workflows/:draftId/publish",
    middleware,
    async (request, response) => {
      try {
        const body = validateFdeBody(request, PUBLISH_LIMITS);
        const context = await resolveWorkspaceAccess(
          request,
          response,
          FDE_ACTIONS.PUBLISH
        );
        if (!context) return;
        const draft = await resolveDraft(
          context.workspace.id,
          request.params.draftId,
          response
        );
        if (!draft) return;
        assertReviewSeparation(response);
        assertPublishable({
          draft,
          actor: { user: context.user, access: context.access },
          workspace: context.workspace,
        });
        const updated = await FdeWorkflowDraft.publish({
          id: draft.id,
          actorUserId: context.user?.id ?? null,
          separationOfDutySatisfied: true,
          expectedStateVersion: body.expectedStateVersion,
          resolveFreshBindings: bindingResolver(context.workspace.id),
          studioReviewPolicyVersion: STUDIO_REVIEW_POLICY_VERSION,
        });
        return response.json({ data: { draft: updated } });
      } catch (error) {
        return sendError(response, error);
      }
    }
  );
}

module.exports = { fdeWorkflowEndpoints };
