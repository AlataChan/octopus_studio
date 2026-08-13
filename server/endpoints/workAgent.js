const {
  reqBody,
  userFromSession,
  multiUserMode,
  safeJsonParse,
} = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { Workspace } = require("../models/workspace");
const { WorkspaceThread } = require("../models/workspaceThread");
const { Run } = require("../models/run");
const { RunEvent } = require("../models/runEvent");
const {
  assertWorkspaceResourceAccess,
} = require("../utils/access/assertWorkspaceResourceAccess");
const {
  ENGINES,
  UnsupportedWorkAgentEngineError,
  resolveEngineSelection,
} = require("../utils/workAgent/enginePolicy");
const { getWorkAgentEngine } = require("../utils/workAgent/engines");
const { buildProviderRoute } = require("../utils/workAgent/modelRouter");
const {
  WORK_AGENT_SETTINGS,
  getWorkAgentSettings,
  normalizeBooleanSetting,
  updateWorkAgentSettings,
} = require("../utils/workAgent/settings");
const { reseedWorkAgentAssistants } = require("../utils/workAgent/runtimeSeed");

async function resolveWorkspaceAndThread({
  request,
  response,
  workspaceSlug,
  threadSlug,
}) {
  const user = await userFromSession(request, response);
  const workspace = multiUserMode(response)
    ? await Workspace.getWithUser(user, { slug: workspaceSlug })
    : await Workspace.get({ slug: workspaceSlug });

  if (!workspace)
    return { error: { status: 404, message: "Workspace not found" } };

  const thread = await WorkspaceThread.get({
    slug: threadSlug,
    workspace_id: workspace.id,
    ...(user?.id ? { user_id: user.id } : {}),
  });
  if (!thread)
    return { error: { status: 404, message: "Workspace thread not found" } };

  return { user, workspace, thread };
}

async function resolveRunAccess(request, response) {
  const run = await Run.getById(String(request.params.runId));
  if (!run) {
    response.status(404).json({ success: false, error: "Run not found" });
    return null;
  }

  const user = await userFromSession(request, response);
  const access = await assertWorkspaceResourceAccess({
    workspaceId: run.workspaceId,
    user,
    multiUserMode: multiUserMode(response),
  });
  if (!access.ok) {
    const unauthenticated = access.status === 401;
    response.status(unauthenticated ? 401 : 404).json({
      success: false,
      error: unauthenticated ? "Unauthenticated" : "Run not found",
    });
    return null;
  }

  return { run, user };
}

function workAgentEndpoints(app) {
  if (!app) return;

  app.get(
    "/admin/work-agent/settings",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      try {
        const settings = await getWorkAgentSettings();
        return response.json({ success: true, data: { settings } });
      } catch (error) {
        console.error("[workAgent] settings read failed:", error);
        return response.status(500).json({
          success: false,
          error: error.message || "Failed to read work-agent settings",
        });
      }
    }
  );

  app.post(
    "/admin/work-agent/settings",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const body = reqBody(request) || {};
        const updates = body.settings || body;
        const result = await updateWorkAgentSettings(updates);
        if (!result.success) {
          return response.status(400).json(result);
        }
        if (
          normalizeBooleanSetting(
            updates[WORK_AGENT_SETTINGS.seedGstackAssistants]
          ) === "true"
        ) {
          try {
            await reseedWorkAgentAssistants();
          } catch (error) {
            console.warn(
              "[workAgent] gstack reseed skipped:",
              error?.message || String(error)
            );
          }
        }
        const settings = await getWorkAgentSettings();
        return response.json({ success: true, data: { settings } });
      } catch (error) {
        console.error("[workAgent] settings update failed:", error);
        return response.status(500).json({
          success: false,
          error: error.message || "Failed to update work-agent settings",
        });
      }
    }
  );

  app.post(
    "/work-agent/runs",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const body = reqBody(request) || {};
        const goal = String(body.goal || "").trim();
        const workspaceSlug = String(body.workspaceSlug || "").trim();
        const threadSlug = String(body.threadSlug || "").trim();
        if (!goal || !workspaceSlug || !threadSlug) {
          return response.status(400).json({
            success: false,
            error: "goal, workspaceSlug, and threadSlug are required",
          });
        }

        let engineSelection;
        try {
          engineSelection = resolveEngineSelection({
            requestedEngine: body.engine,
            globalDefaultEngine: process.env.ALATA_WORK_AGENT_ENGINE,
          });
        } catch (error) {
          if (error instanceof UnsupportedWorkAgentEngineError) {
            return response.status(400).json({
              success: false,
              error: "Unsupported work-agent engine",
            });
          }
          throw error;
        }

        const resolved = await resolveWorkspaceAndThread({
          request,
          response,
          workspaceSlug,
          threadSlug,
        });
        if (resolved.error) {
          return response
            .status(resolved.error.status)
            .json({ success: false, error: resolved.error.message });
        }

        const engine = getWorkAgentEngine(engineSelection.engine);
        const providerRoute = await buildProviderRoute({
          userId: resolved.user?.id || null,
          workspaceId: resolved.workspace.id,
        });

        const { runId } = await engine.submitGoal({
          goal,
          authCtx: {
            userId: resolved.user?.id || null,
            role: resolved.user?.role || null,
          },
          workspace: resolved.workspace,
          thread: resolved.thread,
          workspaceRoot: body.workspaceRoot || null,
          policy: body.policy || {},
          providerRoute,
          engine: engineSelection.engine,
        });

        return response.status(202).json({
          success: true,
          data: {
            runId,
            engine: engineSelection.engine,
            engineSelection,
            stream: {
              type: "liveCanvas",
              sessionId: resolved.thread.slug,
              eventsPath: `/api/canvas/events?sessionId=${encodeURIComponent(
                resolved.thread.slug
              )}`,
            },
          },
        });
      } catch (error) {
        console.error("[workAgent] submit failed:", error);
        return response.status(500).json({
          success: false,
          error: error.message || "Failed to submit work-agent run",
        });
      }
    }
  );

  app.get(
    "/work-agent/runs/:runId",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      const resolved = await resolveRunAccess(request, response);
      if (!resolved) return;
      return response.json({
        success: true,
        data: {
          ...resolved.run,
          metadata: safeJsonParse(resolved.run.metadata, {}),
        },
      });
    }
  );

  app.get(
    "/work-agent/runs/:runId/events",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      const resolved = await resolveRunAccess(request, response);
      if (!resolved) return;
      const events = await RunEvent.listByRun(String(request.params.runId));
      return response.json({ success: true, data: { events } });
    }
  );

  app.post(
    "/work-agent/runs/:runId/cancel",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      const resolved = await resolveRunAccess(request, response);
      if (!resolved) return;
      if (!Object.values(ENGINES).includes(resolved.run.engine)) {
        return response.status(409).json({
          success: false,
          error: "Run engine ownership is unavailable",
        });
      }
      const engine = getWorkAgentEngine(resolved.run.engine);
      const result = await engine.cancel(String(request.params.runId));
      return response.json({ success: true, data: result });
    }
  );
}

module.exports = { workAgentEndpoints };
