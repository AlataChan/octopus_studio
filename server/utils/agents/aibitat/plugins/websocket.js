const chalk = require("chalk");
const { v4: uuidv4 } = require("uuid");
const { Telemetry } = require("../../../../models/telemetry");
const { handleUserResponse } = require("../../../agentFlows/flowCheckpoint");
const {
  bridgeToolCall,
  bridgeSpeaking,
} = require("../../../office/runtimeBridge");
const SOCKET_TIMEOUT_MS = 300 * 1_000; // 5 mins

/**
 * 生成工具执行唯一标识符
 * @param {string} toolName - 工具名称
 * @returns {string} executionId - 格式: {toolName}-{shortUuid}
 */
function generateExecutionId(toolName) {
  return `${toolName}-${uuidv4().slice(0, 8)}`;
}

/**
 * Websocket Interface plugin. It prints the messages on the console and asks for feedback
 * while the conversation is running in the background.
 */

// export interface AIbitatWebSocket extends ServerWebSocket<unknown> {
//   askForFeedback?: any
//   awaitResponse?: any
//   handleFeedback?: (message: string) => void;
// }

const WEBSOCKET_BAIL_COMMANDS = [
  "exit",
  "/exit",
  "stop",
  "/stop",
  "halt",
  "/halt",
  "/reset", // Will not reset but will bail. Powerusers always do this and the LLM responds.
];
const websocket = {
  name: "websocket",
  startupConfig: {
    params: {
      socket: {
        required: true,
      },
      muteUserReply: {
        required: false,
        default: true,
      },
      introspection: {
        required: false,
        default: true,
      },
    },
  },
  plugin: function ({
    socket, // @type AIbitatWebSocket
    muteUserReply = true, // Do not post messages to "USER" back to frontend.
    introspection = false, // when enabled will attach socket to Aibitat object with .introspect method which reports status updates to frontend.
  }) {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.onError(async (error) => {
          let errorMessage =
            error?.message || "An error occurred while running the agent.";
          console.error(chalk.red(`   error: ${errorMessage}`), error);
          aibitat.introspect(
            `Error encountered while running: ${errorMessage}`
          );
          socket.send(
            JSON.stringify({ type: "wssFailure", content: errorMessage })
          );
          aibitat.terminate();
        });

        aibitat.introspect = (messageText) => {
          if (!introspection) return; // Dump thoughts when not wanted.
          socket.send(
            JSON.stringify({
              type: "statusResponse",
              content: messageText,
              animate: true,
            })
          );
        };

        // expose function for sockets across aibitat
        // type param must be set or else msg will not be shown or handled in UI.
        aibitat.socket = {
          send: (type = "__unhandled", content = "") => {
            // WebSocket readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
            if (socket.readyState !== 1) {
              // 静默忽略 socket 关闭后的发送请求（流式响应可能在 socket 关闭后仍有残余事件）
              return;
            }
            socket.send(JSON.stringify({ type, content }));
          },
        };

        // ========================================
        // Phase D: 工具调用实时可视化
        // Phase Task List: 增加 executionId + sessionId 支持
        // ========================================

        // 会话级别的 sessionId
        // 优先使用 invocation.uuid（用于与 planningDecision 的 sessionId 对齐）
        const sessionId = aibitat?.handlerProps?.invocation?.uuid || uuidv4();
        // 存储 executionId 映射，用于关联同一工具调用的 start/success/error
        const executionIdMap = new Map();

        /**
         * 上报工具调用状态（实时推送到前端）
         * @param {Object} params - 工具调用参数
         * @param {string} params.toolName - 工具名称
         * @param {string} params.stage - 执行阶段: "start" | "progress" | "success" | "error"
         * @param {Object} params.args - 工具参数（会脱敏）
         * @param {*} params.result - 工具结果（会截断）
         * @param {string} params.error - 错误信息
         * @param {number} params.durationMs - 执行耗时（毫秒）
         * @param {number} params.estimatedMs - 预估耗时（毫秒）
         * @param {string} params.executionId - 可选，外部传入的执行ID（用于关联）
         */
        aibitat.reportToolCall = ({
          toolName,
          stage,
          args,
          result,
          error,
          durationMs,
          estimatedMs,
          executionId: externalExecutionId,
        }) => {
          if (socket.readyState !== 1) return;

          // 生成或复用 executionId
          let executionId;
          const toolKey = `${toolName}-${JSON.stringify(args || {})}`;

          if (stage === "start") {
            // start 阶段生成新的 executionId
            executionId = externalExecutionId || generateExecutionId(toolName);
            executionIdMap.set(toolKey, executionId);
          } else {
            // success/error/progress 阶段复用之前的 executionId
            executionId =
              executionIdMap.get(toolKey) ||
              externalExecutionId ||
              generateExecutionId(toolName);
            // 完成后清理
            if (stage === "success" || stage === "error") {
              executionIdMap.delete(toolKey);
            }
          }

          const sanitizedArgs = sanitizeToolArgs(args);
          const truncatedResult = truncateResult(result, 500);

          // 调试日志：确认 toolExecution 事件发送
          console.log(
            chalk.cyan(
              `[WebSocket] Sending toolExecution event: stage=${stage}, tool=${toolName}, executionId=${executionId}`
            )
          );

          // 统一使用 { type, content } Envelope 格式
          socket.send(
            JSON.stringify({
              type: "toolExecution",
              content: {
                executionId,
                sessionId,
                toolName,
                stage,
                timestamp: Date.now(),
                args: sanitizedArgs,
                result: truncatedResult,
                error,
                durationMs:
                  stage === "success" || stage === "error" ? durationMs : null,
                estimatedMs: stage === "start" ? estimatedMs : null,
              },
            })
          );

          bridgeToolCall({
            invocation: aibitat?.handlerProps?.invocation,
            sessionId,
            toolName,
            stage,
          });
        };

        /**
         * 脱敏工具参数（移除敏感信息）
         */
        function sanitizeToolArgs(args) {
          if (!args) return null;
          const sensitiveKeys = [
            "password",
            "token",
            "secret",
            "key",
            "apiKey",
            "api_key",
            "authorization",
          ];
          const sanitized = { ...args };

          for (const key of Object.keys(sanitized)) {
            if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
              sanitized[key] = "***REDACTED***";
            }
          }

          // 限制参数长度
          for (const [key, value] of Object.entries(sanitized)) {
            if (typeof value === "string" && value.length > 200) {
              sanitized[key] = value.substring(0, 200) + "...";
            }
          }

          return sanitized;
        }

        /**
         * 截断结果（避免过大的数据传输）
         */
        function truncateResult(result, maxLength = 500) {
          if (!result) return null;

          if (typeof result === "string") {
            return result.length > maxLength
              ? result.substring(0, maxLength) + "..."
              : result;
          }

          try {
            const str = JSON.stringify(result);
            if (str.length > maxLength) {
              return str.substring(0, maxLength) + "...";
            }
            return result;
          } catch {
            return "[Non-serializable result]";
          }
        }

        // aibitat.onStart(() => {
        //   console.log("🚀 starting chat ...");
        // });

        aibitat.onMessage((message) => {
          if (message.from !== "USER")
            Telemetry.sendTelemetry("agent_chat_sent");
          if (message.from === "USER" && muteUserReply) return;

          // 【修复】从多个来源收集知识引用
          const sources = [];

          // 来源1: 从 orchestrator blackboard 提取（KnowledgeSensing 预填充的）
          const orchestrator = aibitat._orchestrator;
          console.log(
            "[AgentWebSocket] DEBUG - orchestrator exists:",
            !!orchestrator
          );
          console.log(
            "[AgentWebSocket] DEBUG - blackboard exists:",
            !!orchestrator?.blackboard
          );

          if (orchestrator?.blackboard) {
            const knowledgeContext =
              orchestrator.blackboard.get("knowledge_context");
            console.log(
              "[AgentWebSocket] DEBUG - knowledgeContext exists:",
              !!knowledgeContext
            );

            if (knowledgeContext) {
              // 打印 knowledgeContext 的结构
              console.log(
                "[AgentWebSocket] DEBUG - knowledgeContext keys:",
                Object.keys(knowledgeContext)
              );
              console.log(
                "[AgentWebSocket] DEBUG - vectorContext exists:",
                !!knowledgeContext.vectorContext
              );
              console.log(
                "[AgentWebSocket] DEBUG - graphContext exists:",
                !!knowledgeContext.graphContext
              );

              // 提取向量数据库的详细来源
              const vectorContext = knowledgeContext.vectorContext;
              if (vectorContext) {
                console.log(
                  "[AgentWebSocket] DEBUG - vectorContext keys:",
                  Object.keys(vectorContext)
                );
                console.log(
                  "[AgentWebSocket] DEBUG - vectorContext.sources:",
                  vectorContext.sources?.length || 0
                );
              }

              if (
                vectorContext?.sources &&
                Array.isArray(vectorContext.sources)
              ) {
                const vectorSources = vectorContext.sources.map(
                  (source, idx) => ({
                    id: source.id || source.vectorId || `vector-${idx}`,
                    title:
                      source.title || source.metadata?.title || "知识库文档",
                    text: source.text || source.pageContent || "",
                    chunkSource:
                      source.chunkSource || source.metadata?.chunkSource || "",
                    score: source.score || source._distance || null,
                    type: "vector",
                  })
                );
                sources.push(...vectorSources);
                console.log(
                  "[AgentWebSocket] DEBUG - Added",
                  vectorSources.length,
                  "vector sources"
                );
              }

              // 提取知识图谱的详细来源
              const graphContext = knowledgeContext.graphContext;
              if (graphContext) {
                console.log(
                  "[AgentWebSocket] DEBUG - graphContext keys:",
                  Object.keys(graphContext)
                );
                console.log(
                  "[AgentWebSocket] DEBUG - rawSubgraph exists:",
                  !!graphContext.rawSubgraph
                );
                console.log(
                  "[AgentWebSocket] DEBUG - rawSubgraph.nodes:",
                  graphContext.rawSubgraph?.nodes?.length || 0
                );
              }

              if (
                graphContext?.rawSubgraph?.nodes &&
                Array.isArray(graphContext.rawSubgraph.nodes)
              ) {
                const graphSources = graphContext.rawSubgraph.nodes
                  .slice(0, 5)
                  .map((node) => ({
                    id: node.nodeId || node.id,
                    title: node.label || node.type || "知识图谱节点",
                    text: node.metadata?.description || node.label || "",
                    chunkSource: `graph://${node.nodeId || node.id}`,
                    score: node.rank || 1,
                    type: "graph",
                  }));
                sources.push(...graphSources);
                console.log(
                  "[AgentWebSocket] DEBUG - Added",
                  graphSources.length,
                  "graph sources"
                );
              }
            }
          }

          // 来源2: 从 aibitat._knowledgeSources 提取（工具调用时填充的）
          console.log(
            "[AgentWebSocket] DEBUG - _knowledgeSources:",
            aibitat._knowledgeSources?.length || 0
          );
          if (
            aibitat._knowledgeSources &&
            Array.isArray(aibitat._knowledgeSources)
          ) {
            for (const source of aibitat._knowledgeSources) {
              // 简单去重：检查是否已存在相同 id 的来源
              const exists = sources.some((s) => s.id === source.id);
              if (!exists) {
                sources.push(source);
              }
            }
          }

          console.log(
            "[AgentWebSocket] DEBUG - Total sources collected:",
            sources.length
          );

          const messageWithSources = {
            ...message,
            sources: sources.length > 0 ? sources : [],
          };

          // 调试：打印即将发送到前端的消息结构
          try {
            console.log(
              "[AgentWebSocket] Sending message to client:",
              JSON.stringify(messageWithSources).substring(0, 500)
            );
            if (sources.length > 0) {
              console.log(
                `[AgentWebSocket] Attached ${sources.length} knowledge sources`
              );
            }
          } catch {
            console.log(
              "[AgentWebSocket] Sending message to client (non-serializable)"
            );
          }

          socket.send(JSON.stringify(messageWithSources));
          bridgeSpeaking({
            invocation: aibitat?.handlerProps?.invocation,
            sessionId,
            message,
          });
        });

        aibitat.onTerminate(() => {
          socket.close();
        });

        aibitat.onInterrupt(async (node) => {
          const feedback = await socket.askForFeedback(socket, node);
          if (WEBSOCKET_BAIL_COMMANDS.includes(feedback)) {
            socket.close();
            return;
          }

          await aibitat.continue(feedback);
        });

        // Phase I: Flow 失败响应处理
        // 处理前端发送的 Flow 失败用户选择
        socket.handleFlowFailureResponse = (checkpointId, choice) => {
          console.log(
            `[AgentWebSocket] Flow failure response: ${choice} for checkpoint ${checkpointId}`
          );
          handleUserResponse(checkpointId, choice);
        };

        /**
         * Socket wait for feedback on socket
         *
         * @param socket The content to summarize. // AIbitatWebSocket & { receive: any, echo: any }
         * @param node The chat node // { from: string; to: string }
         * @returns The summarized content.
         */
        socket.askForFeedback = (socket, node) => {
          socket.awaitResponse = (question = "waiting...") => {
            socket.send(JSON.stringify({ type: "WAITING_ON_INPUT", question }));

            return new Promise(function (resolve) {
              let socketTimeout = null;
              socket.handleFeedback = (message) => {
                const data = JSON.parse(message);
                if (data.type !== "awaitingFeedback") return;
                delete socket.handleFeedback;
                clearTimeout(socketTimeout);
                resolve(data.feedback);
                return;
              };

              socketTimeout = setTimeout(() => {
                console.log(
                  chalk.red(
                    `Client took too long to respond, chat thread is dead after ${SOCKET_TIMEOUT_MS}ms`
                  )
                );
                resolve("exit");
                return;
              }, SOCKET_TIMEOUT_MS);
            });
          };

          return socket.awaitResponse(`Provide feedback to ${chalk.yellow(
            node.to
          )} as ${chalk.yellow(node.from)}.
           Press enter to skip and use auto-reply, or type 'exit' to end the conversation: \n`);
        };
        // console.log("🚀 WS plugin is complete.");
      },
    };
  },
};

module.exports = {
  websocket,
  WEBSOCKET_BAIL_COMMANDS,
};
