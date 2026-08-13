const {
  WorkflowPendingConfirmation,
} = require("../models/workflowPendingConfirmation");
const { Workspace } = require("../models/workspace");
const { multiUserMode, reqBody } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { Run } = require("../models/run");
const { runEventEmitter } = require("../utils/liveCanvas/runEventEmitter");
const { SSE_EVENTS } = require("../utils/liveCanvas/types");
const { shouldResumeTeam } = require("../utils/agents/orchestration/orchestrationResumeService");

/**
 * Thin default dependency assembly for OrchestrationResumeService.
 * Real SSE/persist wiring is best-effort; core logic tested via DI.
 */
function buildDefaultResumeService() {
  const {
    createOrchestrationResumeService,
  } = require("../utils/agents/orchestration/orchestrationResumeService");
  const { TeamOrchestrationService, defaultRunStore } = require("../utils/agents/orchestration/teamOrchestrationService");
  const { WorkflowPendingConfirmation } = require("../models/workflowPendingConfirmation");
  const { WorkspaceAssistant } = require("../models/workspaceAssistant");
  const { WorkspaceChats } = require("../models/workspaceChats");
  const { buildPlannerGenerate } = require("../utils/agents/orchestration/planner");

  const runStore = defaultRunStore(); // same DB backend as first run
  const orchestrationService = new TeamOrchestrationService({ runStore });

  return createOrchestrationResumeService({
    orchestrationService,
    runStore,
    getConfirmation: (id) => WorkflowPendingConfirmation.get(id),
    loadWorkspace: (workspaceId) => {
      const { Workspace } = require("../models/workspace");
      return Workspace.get({ id: workspaceId });
    },
    loadUser: async (userId) => {
      if (!userId) return null;
      try {
        const { User } = require("../models/user");
        return User.get({ id: userId });
      } catch (_) { return null; }
    },
    loadThread: async (threadId) => {
      if (!threadId) return null;
      try {
        const { Thread } = require("../models/thread");
        return Thread.get({ id: threadId });
      } catch (_) { return null; }
    },
    listEmployees: async (workspaceId) => {
      const assistants = await WorkspaceAssistant.forWorkspace(workspaceId);
      return (assistants || []).map((a) => ({
        assistantId: String(a.id),
        name: a.name || "",
        title: a.title || "",
        capabilities: a.capabilities || [],
      }));
    },
    buildGenerateText: ({ workspace }) => buildPlannerGenerate({ workspace }),
    buildOnEvent: ({ thread }) => {
      // Best-effort SSE forwarding via runEventEmitter
      return (e) => {
        try {
          if (thread?.slug) {
            runEventEmitter.emitForSession(thread.slug, e?.type || "event", e);
          }
        } catch (_) {}
      };
    },
    persistResult: async ({ workspace, thread, result }) => {
      try {
        await WorkspaceChats.new({
          workspaceId: workspace.id,
          prompt: null,
          response: {
            text: result?.text ?? "",
            sources: result?.sources || [],
            type: "chat",
            metadata: {
              team: true,
              runId: result?.runId,
              steps: result?.steps?.length || 0,
              resumed: true,
            },
          },
          threadId: thread?.id || null,
          user: null,
          include: true,
        });
      } catch (e) {
        console.error("[Team resume] persistResult error:", e?.message || e);
      }
    },
  });
}

/**
 * HitL (Human-in-the-Loop) 确认机制 API 端点
 */
function workflowConfirmationEndpoints(app) {
  if (!app) return;

  /**
   * 获取 Workspace 的待确认列表
   * GET /api/workspace/:slug/confirmations/pending
   */
  app.get(
    "/workspace/:slug/confirmations/pending",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug } = request.params;
        const workspace = await Workspace.get({ slug });

        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        // 在多用户模式下,只返回当前用户的待确认
        const userId = multiUserMode(response)
          ? response.locals.user?.id
          : null;

        const confirmations = await WorkflowPendingConfirmation.listPending({
          workspaceId: workspace.id,
          userId,
        });

        response.status(200).json({
          success: true,
          confirmations,
        });
      } catch (error) {
        console.error("[HitL API] Error listing pending confirmations:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * 批准执行计划
   * POST /api/workspace/:slug/confirmations/:confirmationId/approve
   */
  app.post(
    "/workspace/:slug/confirmations/:confirmationId/approve",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug, confirmationId } = request.params;
        const { userResponse, editedSteps } = reqBody(request);

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        // 验证确认记录是否属于该 workspace
        const confirmation = await WorkflowPendingConfirmation.get(
          parseInt(confirmationId)
        );

        if (!confirmation || confirmation.workspaceId !== workspace.id) {
          return response.status(404).json({
            success: false,
            error: "Confirmation not found",
          });
        }

        const success = await WorkflowPendingConfirmation.approve(
          parseInt(confirmationId),
          userResponse
        );

        if (!success) {
          return response.status(400).json({
            success: false,
            error:
              "Failed to approve confirmation (may be expired or already processed)",
          });
        }

        try {
          if (confirmation?.runId) {
            const run = await Run.getById(confirmation.runId);
            if (run) {
              runEventEmitter.emitForSession(
                run.threadId,
                SSE_EVENTS.APPROVAL_RESOLVED,
                {
                  approvalId: String(confirmation.id),
                  runId: confirmation.runId,
                  approved: true,
                  resolvedBy: response.locals?.user?.id || null,
                }
              );
            }
          }
        } catch (emitError) {
          console.warn(
            "[HitL API] failed to emit approval.resolved:",
            emitError?.message || emitError
          );
        }

        // Team orchestration resume (fire-and-forget) — only for team_step confirmations
        if (shouldResumeTeam(confirmation)) {
          const resumeOpts = {};
          if (editedSteps !== undefined) resumeOpts.editedSteps = editedSteps;
          buildDefaultResumeService()
            .resume(parseInt(confirmationId, 10), resumeOpts)
            .catch((e) => console.error("[Team resume] error:", e));
        }

        response.status(200).json({
          success: true,
          message: "Confirmation approved",
        });
      } catch (error) {
        console.error("[HitL API] Error approving confirmation:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * 拒绝执行计划
   * POST /api/workspace/:slug/confirmations/:confirmationId/reject
   */
  app.post(
    "/workspace/:slug/confirmations/:confirmationId/reject",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug, confirmationId } = request.params;
        const { userResponse } = reqBody(request);

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const confirmation = await WorkflowPendingConfirmation.get(
          parseInt(confirmationId)
        );

        if (!confirmation || confirmation.workspaceId !== workspace.id) {
          return response.status(404).json({
            success: false,
            error: "Confirmation not found",
          });
        }

        const success = await WorkflowPendingConfirmation.reject(
          parseInt(confirmationId),
          userResponse
        );

        if (!success) {
          return response.status(400).json({
            success: false,
            error: "Failed to reject confirmation",
          });
        }

        try {
          if (confirmation?.runId) {
            const run = await Run.getById(confirmation.runId);
            if (run) {
              runEventEmitter.emitForSession(
                run.threadId,
                SSE_EVENTS.APPROVAL_RESOLVED,
                {
                  approvalId: String(confirmation.id),
                  runId: confirmation.runId,
                  approved: false,
                  resolvedBy: response.locals?.user?.id || null,
                }
              );
            }
          }
        } catch (emitError) {
          console.warn(
            "[HitL API] failed to emit approval.resolved:",
            emitError?.message || emitError
          );
        }

        // Team orchestration resume (fire-and-forget) — only for team_step confirmations
        if (shouldResumeTeam(confirmation)) {
          buildDefaultResumeService()
            .resume(parseInt(confirmationId, 10))
            .catch((e) => console.error("[Team resume] error:", e));
        }

        response.status(200).json({
          success: true,
          message: "Confirmation rejected",
        });
      } catch (error) {
        console.error("[HitL API] Error rejecting confirmation:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { workflowConfirmationEndpoints };
