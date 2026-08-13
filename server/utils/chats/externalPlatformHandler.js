/**
 * 外部平台聊天处理器
 * 用于处理 Dify、Coze 等外部智能体编排平台的聊天请求
 */

const { v4: uuidv4 } = require("uuid");
const { WorkspaceChats } = require("../../models/workspaceChats");
const { writeResponseChunk } = require("../helpers/chat/responses");
const DifyProvider = require("../AiProviders/dify");
const RagflowProvider = require("../AiProviders/ragflow");
const N8nProvider = require("../AiProviders/n8n");
const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { ExternalThreadState } = require("../../models/externalThreadState");
const { formatGraphToContext } = require("./graphContextFormatter");
const { safeJsonParse } = require("../http");

/**
 * 获取图谱上下文 (用于 platform 模式)
 * @param {Object} workspace - Workspace 对象
 * @param {string} message - 用户消息
 * @returns {Promise<string|null>} 图谱上下文文本
 */
async function getGraphContext(workspace, message) {
  try {
    // 搜索相关的图谱子图
    const subgraph = await WorkspaceGraph.searchSubgraph({
      workspaceId: workspace.id,
      keyword: message,
      limit: 30, // 限制节点数量,避免过大
    });

    if (!subgraph || subgraph.nodes.length === 0) {
      console.log("[PlatformMode] No graph context found");
      return null;
    }

    // 格式化为上下文文本
    const { summaryText, tokenCount } = formatGraphToContext(subgraph, {
      maxTokens: 3000, // 严格限制在 3000 tokens
      model: workspace.chatModel || "gpt-3.5-turbo",
    });

    console.log(
      `[PlatformMode] Graph context generated: ${subgraph.nodes.length} nodes, ${tokenCount} tokens`
    );

    return summaryText;
  } catch (error) {
    console.error("[PlatformMode] Error getting graph context:", error);
    return null;
  }
}

function normalizePlatformConfig(platformConfig) {
  return safeJsonParse(platformConfig, platformConfig) || {};
}

function firstPresent(...values) {
  const value = values.find(
    (candidate) =>
      candidate !== null &&
      candidate !== undefined &&
      String(candidate).trim() !== ""
  );
  return value === undefined ? null : String(value);
}

function resolveExternalAppId(platform, platformConfig, template = null) {
  const config = normalizePlatformConfig(platformConfig);

  if (platform === "dify") {
    return firstPresent(
      config.appId,
      config.app_id,
      config.appUUID,
      config.appUuid,
      config.applicationId,
      config.application_id,
      template?.externalAppId
    );
  }

  if (platform === "ragflow") {
    return firstPresent(
      config.assistantId,
      config.assistant_id,
      config.agentId,
      config.agent_id,
      config.chatId,
      config.chat_id,
      config.appId,
      config.app_id,
      template?.externalAppId
    );
  }

  return null;
}

function resolveExternalScopeKey({
  thread = null,
  apiKey = null,
  apiSessionId = null,
  embedId = null,
  user = null,
  workspace = null,
}) {
  if (thread?.id) return `thread:${thread.id}`;
  if (apiKey?.id) return `apikey-session:${apiKey.id}`;
  if (apiSessionId) return `apikey-session:${apiSessionId}`;
  if (embedId) return `embed-default:${embedId}`;
  if (user?.id) return `user:${user.id}`;
  return `workspace:${workspace?.id || "default"}`;
}

async function getPersistedExternalState(context) {
  if (!context?.externalAppId || !context?.scopeKey) return null;

  try {
    return await ExternalThreadState.get(context);
  } catch (error) {
    console.warn(
      `[ExternalPlatform] Failed to read ${context.platform} thread state:`,
      error.message
    );
    return null;
  }
}

async function persistExternalState(context, values = {}) {
  if (!context?.externalAppId || !context?.scopeKey) return null;

  try {
    return await ExternalThreadState.upsert({ ...context, ...values });
  } catch (error) {
    console.warn(
      `[ExternalPlatform] Failed to persist ${context.platform} thread state:`,
      error.message
    );
    return null;
  }
}

/**
 * 处理外部平台的聊天请求
 * @param {Object} params - 参数
 * @param {Object} params.response - Express response 对象
 * @param {Object} params.workspace - Workspace 对象
 * @param {string} params.message - 用户消息
 * @param {Object} params.template - 助手模板
 * @param {Object} params.assistant - 助手实例
 * @param {Object} params.user - 用户对象
 * @param {Object} params.thread - 线程对象
 * @param {Array} params.attachments - 附件列表
 * @param {string} params.chatMode - 聊天模式
 * @param {Object|null} params.apiKey - API key context for API-key sessions
 * @param {string|null} params.apiSessionId - API session id fallback
 * @param {string|null} params.embedId - Embed id fallback for embed sessions
 * @returns {Promise<boolean>} 是否成功处理
 */
async function handleExternalPlatformChat({
  response,
  workspace,
  message,
  template,
  assistant,
  user = null,
  thread = null,
  attachments = [],
  chatMode = "chat",
  apiKey = null,
  apiSessionId = null,
  embedId = null,
}) {
  const uuid = uuidv4();
  const platformType = template.platformType;
  const platformConfig = normalizePlatformConfig(template.platformConfig);

  if (!platformConfig) {
    console.error(
      `[ExternalPlatform] No platform config found for assistant ${assistant.id}`
    );
    return false;
  }

  console.log(
    `[ExternalPlatform] Using ${platformType} platform for assistant: ${assistant.instanceName || template.name}`
  );

  try {
    const externalStateContext = {
      workspaceId: workspace.id,
      platform: platformType,
      externalAppId: resolveExternalAppId(
        platformType,
        platformConfig,
        template
      ),
      scopeKey: resolveExternalScopeKey({
        thread,
        apiKey,
        apiSessionId,
        embedId,
        user,
        workspace,
      }),
    };

    if (
      ["dify", "ragflow"].includes(platformType) &&
      !externalStateContext.externalAppId
    ) {
      console.warn(
        `[ExternalPlatform] Missing external app id for ${platformType}; multi-turn state will be skipped`
      );
    }

    switch (platformType) {
      case "dify":
        await handleDifyChat({
          response,
          workspace,
          message,
          platformConfig,
          assistant,
          user,
          thread,
          attachments,
          chatMode,
          uuid,
          externalStateContext,
        });
        return true;

      case "ragflow":
        await handleRagflowChat({
          response,
          workspace,
          message,
          platformConfig,
          assistant,
          user,
          thread,
          attachments,
          chatMode,
          uuid,
          externalStateContext,
        });
        return true;

      case "n8n":
        await handleN8nChat({
          response,
          workspace,
          message,
          platformConfig,
          assistant,
          user,
          thread,
          attachments,
          chatMode,
          uuid,
        });
        return true;

      case "coze":
      case "fastgpt":
        // 预留其他平台的处理逻辑
        writeResponseChunk(response, {
          id: uuid,
          type: "textResponse",
          textResponse: `平台 ${platformType} 暂未支持，请联系管理员。`,
          sources: [],
          close: true,
          error: `Platform ${platformType} not yet supported`,
        });
        return true;

      default:
        console.error(
          `[ExternalPlatform] Unknown platform type: ${platformType}`
        );
        return false;
    }
  } catch (error) {
    console.error(
      `[ExternalPlatform] Error handling ${platformType} chat:`,
      error
    );
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse: `调用外部平台失败: ${error.message}`,
      sources: [],
      close: true,
      error: error.message,
    });
    return true; // 返回 true 表示已处理（即使失败）
  }
}

/**
 * 处理 Dify 平台的聊天
 */
async function handleDifyChat({
  response,
  workspace,
  message,
  platformConfig,
  assistant: _assistant,
  user,
  thread,
  attachments: _attachments,
  chatMode,
  uuid,
  externalStateContext = null,
}) {
  let fullContent = "";
  let conversationId = null;
  let messageId = null;

  try {
    const persistedState =
      await getPersistedExternalState(externalStateContext);
    conversationId = persistedState?.external_conversation_id || null;

    // 【新增】获取图谱上下文
    const graphContext = await getGraphContext(workspace, message);

    // 如果有图谱上下文,将其注入到消息中
    let enhancedMessage = message;
    if (graphContext) {
      enhancedMessage = `${graphContext}\n\n---\n\n用户问题: ${message}`;
      console.log(`[Dify] Injected graph context into message`);
    }

    // 用户 ID 映射：将 Alata Studio 用户 ID 映射到 Dify 用户 ID
    let difyUserId = user?.id?.toString() || "default-user";

    if (platformConfig.userIdMapping) {
      const mapping = platformConfig.userIdMapping;
      const alataUserId = user?.id?.toString();

      // 优先查找精确匹配
      if (alataUserId && mapping[alataUserId]) {
        difyUserId = mapping[alataUserId];
      }
      // 如果没有精确匹配，使用默认映射
      else if (mapping.default) {
        difyUserId = mapping.default;
      }

      console.log(
        `[Dify] User ID mapping: Alata user ${alataUserId} → Dify user ${difyUserId}`
      );
    }

    // 流式响应
    await DifyProvider.chatStream(
      platformConfig,
      enhancedMessage, // 使用增强后的消息
      (chunk) => {
        if (chunk.type === "content") {
          // 发送内容块
          writeResponseChunk(response, {
            uuid,
            type: "textResponseChunk",
            textResponse: chunk.delta,
            sources: [],
            close: false,
            error: false,
          });
        } else if (chunk.type === "done") {
          // 流结束
          fullContent = chunk.content;
          conversationId = chunk.conversationId || conversationId;
          messageId = chunk.messageId;
        } else if (chunk.type === "error") {
          // 错误
          throw new Error(chunk.error);
        }
      },
      {
        userId: difyUserId,
        conversationId,
      }
    );

    if (conversationId) {
      await persistExternalState(externalStateContext, {
        externalConversationId: conversationId,
      });
    }

    // 保存聊天记录
    const { chat } = await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: fullContent,
        sources: [],
        type: chatMode,
        attachments: _attachments,
        metadata: {
          platform: "dify",
          conversationId,
          messageId,
        },
      },
      threadId: thread?.id || null,
      user,
    });

    // 发送完成信号
    writeResponseChunk(response, {
      uuid,
      type: "finalizeResponseStream",
      close: true,
      error: false,
      chatId: chat.id,
    });
  } catch (error) {
    console.error("[Dify] Chat error:", error);
    writeResponseChunk(response, {
      uuid,
      type: "textResponse",
      textResponse: `Dify 调用失败: ${error.message}`,
      sources: [],
      close: true,
      error: error.message,
    });
  }
}

/**
 * 处理 RAGFlow 平台的聊天
 */
async function handleRagflowChat({
  response,
  workspace,
  message,
  platformConfig,
  assistant: _assistant,
  user,
  thread,
  attachments: _attachments,
  chatMode,
  uuid,
  externalStateContext = null,
}) {
  let fullContent = "";
  let sessionId = null;
  let messageId = null;
  let reference = null;

  try {
    const persistedState =
      await getPersistedExternalState(externalStateContext);
    sessionId = persistedState?.external_session_id || null;

    // 【新增】获取图谱上下文
    const graphContext = await getGraphContext(workspace, message);
    let enhancedMessage = message;
    if (graphContext) {
      enhancedMessage = `${graphContext}\n\n---\n\n用户问题: ${message}`;
      console.log(`[RAGFlow] Injected graph context into message`);
    }

    // 流式响应
    await RagflowProvider.chatStream(
      platformConfig,
      enhancedMessage,
      (chunk) => {
        if (chunk.type === "content") {
          // 发送内容块
          writeResponseChunk(response, {
            uuid,
            type: "textResponseChunk",
            textResponse: chunk.delta,
            sources: [],
            close: false,
            error: false,
          });
        } else if (chunk.type === "done") {
          // 流结束
          fullContent = chunk.content;
          sessionId = chunk.sessionId || sessionId;
          messageId = chunk.messageId;
          reference = chunk.reference;
        } else if (chunk.type === "error") {
          // 错误
          throw new Error(chunk.error);
        }
      },
      {
        userId: user?.id?.toString() || "default-user",
        sessionId,
      }
    );

    if (sessionId) {
      await persistExternalState(externalStateContext, {
        externalSessionId: sessionId,
      });
    }

    // 保存聊天记录
    const { chat } = await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: fullContent,
        sources: [],
        type: chatMode,
        attachments: _attachments,
        metadata: {
          platform: "ragflow",
          sessionId,
          messageId,
          reference, // RAGFlow 的引用信息
        },
      },
      threadId: thread?.id || null,
      user,
    });

    // 发送完成信号
    writeResponseChunk(response, {
      uuid,
      type: "finalizeResponseStream",
      close: true,
      error: false,
      chatId: chat.id,
    });
  } catch (error) {
    console.error("[RAGFlow] Chat error:", error);
    writeResponseChunk(response, {
      uuid,
      type: "textResponse",
      textResponse: `RAGFlow 调用失败: ${error.message}`,
      sources: [],
      close: true,
      error: error.message,
    });
  }
}

/**
 * 处理 n8n 平台的聊天
 */
async function handleN8nChat({
  response,
  workspace,
  message,
  platformConfig,
  assistant: _assistant,
  user,
  thread,
  attachments: _attachments,
  chatMode,
  uuid,
}) {
  let fullContent = "";

  try {
    // 【新增】获取图谱上下文
    const graphContext = await getGraphContext(workspace, message);
    let enhancedMessage = message;
    if (graphContext) {
      enhancedMessage = `${graphContext}\n\n---\n\n用户问题: ${message}`;
      console.log(`[n8n] Injected graph context into message`);
    }

    // 流式响应 (如果不支持流式，n8n Provider 会自动回退到阻塞式)
    await N8nProvider.chatStream(
      platformConfig,
      enhancedMessage,
      (chunk) => {
        if (chunk.type === "content") {
          // 发送内容块
          writeResponseChunk(response, {
            uuid,
            type: "textResponseChunk",
            textResponse: chunk.delta,
            sources: [],
            close: false,
            error: false,
          });
        } else if (chunk.type === "done") {
          // 流结束
          fullContent = chunk.content;
        } else if (chunk.type === "error") {
          // 错误
          throw new Error(chunk.error);
        }
      },
      {
        userId: user?.id?.toString() || "default-user",
        sessionId: null,
      }
    );

    // 保存聊天记录
    const { chat } = await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: fullContent,
        sources: [],
        type: chatMode,
        attachments: _attachments,
        metadata: {
          platform: "n8n",
          webhookUrl: platformConfig.webhookUrl,
        },
      },
      threadId: thread?.id || null,
      user,
    });

    // 发送完成信号
    writeResponseChunk(response, {
      uuid,
      type: "finalizeResponseStream",
      close: true,
      error: false,
      chatId: chat.id,
    });
  } catch (error) {
    console.error("[n8n] Chat error:", error);
    writeResponseChunk(response, {
      uuid,
      type: "textResponse",
      textResponse: `n8n 调用失败: ${error.message}`,
      sources: [],
      close: true,
      error: error.message,
    });
  }
}

module.exports = {
  handleExternalPlatformChat,
};
