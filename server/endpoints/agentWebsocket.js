const { Telemetry } = require("../models/telemetry");
const {
  WorkspaceAgentInvocation,
} = require("../models/workspaceAgentInvocation");
const { AgentHandler } = require("../utils/agents");
const {
  WEBSOCKET_BAIL_COMMANDS,
} = require("../utils/agents/aibitat/plugins/websocket");
const { safeJsonParse } = require("../utils/http");
const { handleUserResponse } = require("../utils/agentFlows/flowCheckpoint");
const { Run } = require("../models/run");
const { runEventEmitter } = require("../utils/liveCanvas/runEventEmitter");
const { SSE_EVENTS } = require("../utils/liveCanvas/types");
const { getOfficeProjection } = require("../utils/office/singleton");
const {
  createOfficeFinish,
  getInvocationActorId,
} = require("../utils/office/runtimeBridge");

// Setup listener for incoming messages to relay to socket so it can be handled by agent plugin.
function relayToSocket(message) {
  // Phase I: 处理 Flow 失败用户响应
  const data = safeJsonParse(message);
  if (data?.type === "flowFailureResponse") {
    console.log(
      `[AgentWebsocket] Flow failure response: ${data.choice} for ${data.checkpointId}`
    );
    handleUserResponse(data.checkpointId, data.choice);
    return;
  }

  if (this.handleFeedback) return this?.handleFeedback?.(message);
  this.checkBailCommand(message);
}

function agentWebsocket(app) {
  if (!app) return;

  console.log(
    "[AgentWebsocket] Registering WebSocket endpoint: /agent-invocation/:uuid"
  );

  app.ws("/agent-invocation/:uuid", async function (socket, request) {
    console.log(
      `[AgentWebsocket] New connection request for UUID: ${request.params.uuid}`
    );
    const uuid = String(request.params.uuid);
    let executionSuccess = false; // 追踪执行状态
    let userAborted = false; // 追踪用户是否主动中止
    let officeActorId = null;
    let officeFinish = () => {};

    try {
      const agentHandler = await new AgentHandler({
        uuid,
      }).init();

      if (!agentHandler.invocation) {
        socket.close();
        return;
      }

      socket.on("message", relayToSocket);
      socket.on("close", () => {
        agentHandler.closeAlert();

        // 根据执行状态关闭 invocation
        // 如果用户主动中止，标记为失败
        void WorkspaceAgentInvocation.closeWithStatus(
          uuid,
          executionSuccess && !userAborted
        );
        officeFinish(executionSuccess && !userAborted);

        // Finalize Live Canvas Run status (if present).
        void (async () => {
          const runId = agentHandler?.runId || null;
          const threadSlug = agentHandler?.threadSlug || null;
          if (!runId || !threadSlug) return;

          const existingRun = await Run.getById(runId);
          if (!existingRun) return;
          if (
            [
              Run.STATUS.SUCCEEDED,
              Run.STATUS.FAILED,
              Run.STATUS.CANCELLED,
            ].includes(existingRun.status)
          ) {
            return;
          }

          let finalStatus = Run.STATUS.SUCCEEDED;
          let errorCode = null;
          let errorDetail = null;

          if (userAborted) {
            finalStatus = Run.STATUS.CANCELLED;
            errorCode = Run.ERROR_CODE.RUN_CANCELLED;
            errorDetail = "User aborted agent invocation";
          } else if (!executionSuccess) {
            finalStatus = Run.STATUS.FAILED;
            errorCode = existingRun.errorCode || Run.ERROR_CODE.RUN_UNKNOWN;
            errorDetail = existingRun.errorDetail || "Agent invocation failed";
          }

          const updated = await Run.updateStatus(runId, finalStatus, {
            errorCode,
            errorDetail,
          });

          runEventEmitter.emitForSession(threadSlug, SSE_EVENTS.RUN_COMPLETED, {
            runId: updated.id,
            status: updated.status,
            errorCode: updated.errorCode,
            errorDetail: updated.errorDetail,
            completedAt: updated.completedAt,
          });
        })();
      });

      socket.checkBailCommand = (data) => {
        const content = safeJsonParse(data)?.feedback;
        if (WEBSOCKET_BAIL_COMMANDS.includes(content)) {
          agentHandler.log(
            `User invoked bail command while processing. Closing session now.`
          );
          userAborted = true;
          agentHandler.aibitat.abort();
          socket.close();
          return;
        }
      };

      await Telemetry.sendTelemetry("agent_chat_started");
      await agentHandler.createAIbitat({ socket });
      officeActorId = getInvocationActorId(agentHandler.invocation);
      officeFinish = createOfficeFinish({
        actorId: officeActorId,
        sessionId: uuid,
      });
      const officeProjection = getOfficeProjection();
      if (officeProjection && officeActorId) {
        officeProjection.handleInvocationStart(officeActorId, uuid);
      }
      await agentHandler.startAgentCluster();

      // Agent 执行完成，标记为成功
      executionSuccess = true;

      // Agent 执行完成后，终止会话并关闭 socket
      agentHandler.aibitat.terminate();
    } catch (e) {
      console.error(e.message, e);
      executionSuccess = false; // 执行失败
      officeFinish(false);
      socket?.send(JSON.stringify({ type: "wssFailure", content: e.message }));
      socket?.close();
    }
  });
}

module.exports = { agentWebsocket };
