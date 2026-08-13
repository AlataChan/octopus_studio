const chalk = require("chalk");
const { v4: uuidv4 } = require("uuid");
const { Telemetry } = require("../../../../models/telemetry");

/**
 * HTTP Interface plugin for Aibitat to emulate a websocket interface in the agent
 * framework so we dont have to modify the interface for passing messages and responses
 * in REST or WSS.
 */
const httpSocket = {
  name: "httpSocket",
  startupConfig: {
    params: {
      handler: {
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
    handler,
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
          handler.send(
            JSON.stringify({ type: "wssFailure", content: errorMessage })
          );
          aibitat.terminate();
        });

        aibitat.introspect = (messageText) => {
          if (!introspection) return; // Dump thoughts when not wanted.
          handler.send(
            JSON.stringify({ type: "statusResponse", content: messageText })
          );
        };

        // expose function for sockets across aibitat
        // type param must be set or else msg will not be shown or handled in UI.
        aibitat.socket = {
          send: (type = "__unhandled", content = "") => {
            handler.send(JSON.stringify({ type, content }));
          },
        };

        // ========================================
        // Phase Task List: 增加 executionId + sessionId 支持（与 websocket.js 保持一致）
        // ========================================

        // 会话级别的 sessionId
        // 优先使用 invocation.uuid（用于与 planningDecision 的 sessionId 对齐）
        const sessionId = aibitat?.handlerProps?.invocation?.uuid || uuidv4();
        // 存储 executionId 映射，用于关联同一工具调用的 start/success/error
        const executionIdMap = new Map();

        /**
         * 生成工具执行ID
         * @param {string} toolName - 工具名称
         * @returns {string} 唯一的执行ID
         */
        function generateExecutionId(toolName) {
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 8);
          return `${toolName}-${timestamp}-${random}`;
        }

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
              `[HTTP-Socket] Sending toolExecution event: stage=${stage}, tool=${toolName}, executionId=${executionId}`
            )
          );

          // 统一使用 { type, content } Envelope 格式
          handler.send(
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
         * 截断结果输出（避免过长）
         */
        function truncateResult(result, maxLength = 500) {
          if (result === null || result === undefined) return null;
          const str =
            typeof result === "string" ? result : JSON.stringify(result);
          if (str.length <= maxLength) return str;
          return str.substring(0, maxLength) + "...";
        }

        // We can only receive one message response with HTTP
        // so we end on first response.
        aibitat.onMessage((message) => {
          if (message.from !== "USER")
            Telemetry.sendTelemetry("agent_chat_sent");
          if (message.from === "USER" && muteUserReply) return;

          // 【修复】从多个来源收集知识引用
          const sources = [];

          // 来源1: 从 orchestrator blackboard 提取（KnowledgeSensing 预填充的）
          const orchestrator = aibitat._orchestrator;
          if (orchestrator?.blackboard) {
            const knowledgeContext =
              orchestrator.blackboard.get("knowledge_context");
            if (knowledgeContext) {
              // 提取向量数据库的详细来源
              const vectorContext = knowledgeContext.vectorContext;
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
              }

              // 提取知识图谱的详细来源
              const graphContext = knowledgeContext.graphContext;
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
              }
            }
          }

          // 来源2: 从 aibitat._knowledgeSources 提取（工具调用时填充的）
          if (
            aibitat._knowledgeSources &&
            Array.isArray(aibitat._knowledgeSources)
          ) {
            for (const source of aibitat._knowledgeSources) {
              const exists = sources.some((s) => s.id === source.id);
              if (!exists) {
                sources.push(source);
              }
            }
          }

          const messageWithSources = {
            ...message,
            sources: sources.length > 0 ? sources : [],
          };

          handler.send(JSON.stringify(messageWithSources));
          handler.close();
        });

        aibitat.onTerminate(() => {
          handler.close();
        });
      },
    };
  },
};

module.exports = {
  httpSocket,
};
