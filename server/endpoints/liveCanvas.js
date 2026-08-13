const { reqBody, safeJsonParse } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const prisma = require("../utils/prisma");
const { Run } = require("../models/run");
const {
  WorkflowPendingConfirmation,
} = require("../models/workflowPendingConfirmation");
const { runEventEmitter } = require("../utils/liveCanvas/runEventEmitter");
const { SSE_EVENTS } = require("../utils/liveCanvas/types");
const { getWorkAgentEngine } = require("../utils/workAgent/engines");

function liveCanvasEndpoints(app) {
  if (!app) return;

  // GET /api/canvas/events?sessionId=<threadId>
  app.get("/canvas/events", [validatedRequest], async (request, response) => {
    const sessionId = String(request.query?.sessionId || "");
    if (!sessionId) {
      return response.status(400).json({ error: "sessionId required" });
    }

    const user = request.user || response.locals.user || null;
    const thread = await prisma.workspace_threads.findUnique({
      where: { slug: sessionId },
      select: { workspace_id: true },
    });
    if (!thread)
      return response.status(404).json({ error: "Session not found" });

    if (user?.id && user?.role !== "admin") {
      const membership = await prisma.workspace_users.findFirst({
        where: { workspace_id: thread.workspace_id, user_id: user.id },
        select: { id: true },
      });
      if (!membership) return response.status(403).json({ error: "Forbidden" });
    }

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    let eventCounter = 0;
    function sendEvent(eventName, data) {
      eventCounter++;
      response.write(`event: ${eventName}\n`);
      response.write(`id: evt-${eventCounter}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    const handler = (eventName, data) => sendEvent(eventName, data);
    runEventEmitter.subscribe(sessionId, handler);

    // Initial snapshot (runs + pending approvals)
    try {
      const runs = await prisma.runs.findMany({
        where: { threadId: sessionId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          artifacts: true,
          events: {
            orderBy: { seq: "asc" },
            take: 200,
          },
        },
      });

      const pendingApprovals = runs.length
        ? await prisma.workflow_pending_confirmations.findMany({
            where: { status: "pending", runId: { in: runs.map((r) => r.id) } },
            orderBy: { createdAt: "desc" },
            take: 20,
          })
        : [];

      sendEvent(SSE_EVENTS.SESSION_SUBSCRIBE, {
        sessionId,
        t: Date.now(),
        runs: runs.map((r) => ({
          ...r,
          metadata: safeJsonParse(r.metadata, {}),
          artifacts: (r.artifacts || []).map((a) => ({
            ...a,
            metadata: safeJsonParse(a.metadata, {}),
          })),
          events: (r.events || []).map((event) => ({
            ...event,
            payload: safeJsonParse(event.payload, {}),
          })),
        })),
        pendingApprovals: pendingApprovals.map((a) => ({
          ...a,
          planDetails: safeJsonParse(a.planDetails, {}),
        })),
      });
    } catch (error) {
      console.warn(
        "[liveCanvas] failed to build initial snapshot:",
        error?.message || error
      );
    }

    sendEvent(SSE_EVENTS.PING, { t: Date.now() });
    const heartbeat = setInterval(() => {
      sendEvent(SSE_EVENTS.PING, { t: Date.now() });
    }, 30_000);

    request.on("close", () => {
      clearInterval(heartbeat);
      runEventEmitter.unsubscribe(sessionId, handler);
    });
  });

  // POST /api/canvas/action
  app.post("/canvas/action", [validatedRequest], async (request, response) => {
    const body = reqBody(request) || {};
    const { surfaceId, runId, componentId, actionType, payload, timestamp } =
      body;

    if (!runId || !actionType) {
      return response
        .status(400)
        .json({ error: "runId and actionType required" });
    }

    const user = request.user || response.locals.user || null;
    const run = await Run.getById(runId);
    if (!run) return response.status(404).json({ error: "Run not found" });

    if (user?.id && user?.role !== "admin") {
      const membership = await prisma.workspace_users.findFirst({
        where: { workspace_id: run.workspaceId, user_id: user.id },
        select: { id: true },
      });
      if (!membership) return response.status(403).json({ error: "Forbidden" });
    }

    if (actionType === "approval.resolve") {
      let approval = null;
      const maybeApprovalId =
        payload?.approvalId != null ? payload.approvalId : body?.approvalId;
      if (maybeApprovalId != null && maybeApprovalId !== "") {
        const parsed = parseInt(maybeApprovalId);
        if (isNaN(parsed)) {
          return response.status(400).json({ error: "Invalid approvalId" });
        }
        approval = await prisma.workflow_pending_confirmations.findUnique({
          where: { id: parsed },
        });
        if (
          !approval ||
          approval.status !== "pending" ||
          approval.runId !== runId
        ) {
          return response
            .status(404)
            .json({ error: "Approval not found for this run" });
        }
      } else {
        approval = await prisma.workflow_pending_confirmations.findFirst({
          where: { runId, status: "pending" },
          orderBy: { createdAt: "desc" },
        });
      }
      if (!approval) {
        return response
          .status(404)
          .json({ error: "No pending approval for this run" });
      }

      const approved =
        payload?.value === "approved" || payload?.approved === true;
      const reason = payload?.reason || payload?.feedback || "";
      const ok = approved
        ? await WorkflowPendingConfirmation.approve(approval.id, reason)
        : await WorkflowPendingConfirmation.reject(approval.id, reason);

      if (!ok) {
        return response
          .status(400)
          .json({ error: "Unable to resolve approval" });
      }

      runEventEmitter.emitForSession(
        run.threadId,
        SSE_EVENTS.APPROVAL_RESOLVED,
        {
          approvalId: String(approval.id),
          runId,
          approved,
          resolvedBy: user?.id || null,
        }
      );

      const runMetadata = safeJsonParse(run.metadata, {});
      if (runMetadata.kind === "work-agent") {
        try {
          await getWorkAgentEngine(runMetadata.engine || "mastra").approve(runId, {
            approvalId: String(approval.id),
            decision: approved ? "allow" : "deny",
            approved,
          });
        } catch (error) {
          console.warn(
            "[liveCanvas] failed to resume work-agent approval:",
            error?.message || error
          );
        }
      }

      return response.json({ ok: true });
    }

    runEventEmitter.emitForSession(
      run.threadId,
      SSE_EVENTS.CANVAS_USER_ACTION,
      {
        surfaceId,
        runId,
        componentId,
        actionType,
        payload,
        timestamp,
        userId: user?.id || null,
      }
    );

    return response.json({ ok: true });
  });

  // GET /api/canvas/health
  app.get("/canvas/health", async (_request, response) => {
    const activeRuns = await Run.countActive();
    const pendingApprovals = await prisma.workflow_pending_confirmations.count({
      where: { status: "pending", runId: { not: null } },
    });
    response.json({
      status: "ok",
      activeRuns,
      pendingApprovals,
      sseConnections: runEventEmitter.connectionCount,
    });
  });
}

module.exports = { liveCanvasEndpoints };
