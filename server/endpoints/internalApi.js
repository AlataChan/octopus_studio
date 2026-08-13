const crypto = require("crypto");
const { reqBody, safeJsonParse } = require("../utils/http");
const prisma = require("../utils/prisma");
const { Run } = require("../models/run");
const {
  WorkflowPendingConfirmation,
} = require("../models/workflowPendingConfirmation");
const { runEventEmitter } = require("../utils/liveCanvas/runEventEmitter");
const { SSE_EVENTS } = require("../utils/liveCanvas/types");

function internalAuth(request, response, next) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return response.status(403).json({ error: "Internal API not configured" });
  }
  const provided = request.headers["x-internal-secret"];
  if (!provided) {
    return response.status(403).json({ error: "Forbidden" });
  }

  const pBuf = Buffer.from(String(provided));
  const sBuf = Buffer.from(String(secret));
  if (pBuf.length !== sBuf.length || !crypto.timingSafeEqual(pBuf, sBuf)) {
    return response.status(403).json({ error: "Forbidden" });
  }
  next();
}

function internalApiEndpoints(app) {
  if (!app) return;

  // POST /api/internal/runs/create
  app.post(
    "/internal/runs/create",
    [internalAuth],
    async (request, response) => {
      const body = reqBody(request) || {};
      const {
        threadId,
        workspaceId,
        workspaceSlug,
        triggerType = Run.TRIGGER.IM,
        triggerId = null,
        initialInput = "",
      } = body;

      if (!threadId) {
        return response.status(400).json({ error: "threadId required" });
      }

      let wsId = null;
      if (
        workspaceId !== undefined &&
        workspaceId !== null &&
        workspaceId !== ""
      ) {
        const parsed = parseInt(workspaceId);
        if (isNaN(parsed)) {
          return response
            .status(400)
            .json({ error: "workspaceId must be a valid integer" });
        }
        wsId = parsed;
      } else if (workspaceSlug) {
        const ws = await prisma.workspaces.findUnique({
          where: { slug: String(workspaceSlug) },
          select: { id: true },
        });
        if (!ws) {
          return response.status(404).json({ error: "Workspace not found" });
        }
        wsId = ws.id;
      } else {
        return response
          .status(400)
          .json({ error: "workspaceId or workspaceSlug required" });
      }

      const run = await Run.create({
        threadId,
        workspaceId: wsId,
        triggerType,
        triggerId,
        engine: "mastra",
        metadata: { initialInput: initialInput || "" },
      });

      runEventEmitter.emitForSession(threadId, SSE_EVENTS.RUN_CREATED, {
        runId: run.id,
        threadId,
        workspaceId: run.workspaceId,
        triggerType,
        status: run.status,
        createdAt: run.createdAt,
      });

      // IM/webhook runs should appear as running immediately (mirrors UI agent behavior).
      const running = await Run.updateStatus(run.id, Run.STATUS.RUNNING, {});
      runEventEmitter.emitForSession(threadId, SSE_EVENTS.RUN_UPDATED, {
        runId: running.id,
        status: running.status,
        startedAt: running.startedAt,
      });

      return response
        .status(201)
        .json({ runId: run.id, status: running.status });
    }
  );

  // POST /api/internal/im/reply
  app.post("/internal/im/reply", [internalAuth], async (request, response) => {
    const body = reqBody(request) || {};
    const { runId, threadId, text = "", richContent = null } = body;

    if (!runId && !threadId) {
      return response.status(400).json({ error: "runId or threadId required" });
    }

    let targetRun = null;
    if (runId) {
      targetRun = await Run.getById(runId);
    } else {
      targetRun = await prisma.runs.findFirst({
        where: { threadId: String(threadId) },
        orderBy: { createdAt: "desc" },
      });
    }

    if (targetRun) {
      const meta = safeJsonParse(targetRun.metadata || "{}", {});
      meta.imReply = {
        text,
        richContent,
        repliedAt: new Date().toISOString(),
      };

      await prisma.runs.update({
        where: { id: targetRun.id },
        data: { metadata: JSON.stringify(meta) },
      });

      runEventEmitter.emitForSession(
        targetRun.threadId,
        SSE_EVENTS.RUN_UPDATED,
        {
          runId: targetRun.id,
          status: targetRun.status,
          imReply: { text },
        }
      );

      // Mark IM run as completed (best-effort).
      if (
        targetRun.status !== Run.STATUS.SUCCEEDED &&
        targetRun.status !== Run.STATUS.FAILED &&
        targetRun.status !== Run.STATUS.CANCELLED
      ) {
        const completed = await Run.updateStatus(
          targetRun.id,
          Run.STATUS.SUCCEEDED,
          {}
        );
        runEventEmitter.emitForSession(
          targetRun.threadId,
          SSE_EVENTS.RUN_COMPLETED,
          {
            runId: completed.id,
            status: completed.status,
            completedAt: completed.completedAt,
          }
        );
      }
    }

    const callbackUrl = process.env.GATEWAY_CALLBACK_URL;
    if (callbackUrl) {
      try {
        const url = `${callbackUrl.replace(/\/$/, "")}/internal/im-reply`;
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-alata-secret": process.env.INTERNAL_API_SECRET || "",
          },
          body: JSON.stringify({ runId, threadId, text, richContent }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (error) {
        console.warn(
          "[internalApi] IM reply callback failed:",
          error?.message || error
        );
      }
    }

    return response.json({ ok: true });
  });

  // GET /api/internal/im/reply/:runId
  app.get(
    "/internal/im/reply/:runId",
    [internalAuth],
    async (request, response) => {
      const run = await Run.getById(request.params.runId);
      if (!run) return response.status(404).json({ error: "Run not found" });

      const meta = safeJsonParse(run.metadata || "{}", {});
      return response.json({
        runId: run.id,
        status: run.status,
        imReply: meta.imReply || null,
      });
    }
  );

  // POST /api/internal/approvals/:id/resolve
  app.post(
    "/internal/approvals/:id/resolve",
    [internalAuth],
    async (request, response) => {
      const confirmationId = parseInt(request.params.id);
      if (isNaN(confirmationId)) {
        return response.status(400).json({ error: "Invalid confirmation id" });
      }

      const body = reqBody(request) || {};
      const { approved, reason = "", resolvedBy = "im-gateway" } = body;

      const ok = approved
        ? await WorkflowPendingConfirmation.approve(confirmationId, reason)
        : await WorkflowPendingConfirmation.reject(confirmationId, reason);

      if (!ok) {
        return response
          .status(400)
          .json({ error: "Unable to resolve confirmation" });
      }

      const confirmation =
        await WorkflowPendingConfirmation.get(confirmationId);
      if (confirmation?.runId) {
        const run = await Run.getById(confirmation.runId);
        if (run) {
          runEventEmitter.emitForSession(
            run.threadId,
            SSE_EVENTS.APPROVAL_RESOLVED,
            {
              approvalId: String(confirmationId),
              runId: confirmation.runId,
              approved: !!approved,
              resolvedBy,
            }
          );
        }
      }

      return response.json({ ok: true, approved: !!approved });
    }
  );
}

module.exports = { internalApiEndpoints };
