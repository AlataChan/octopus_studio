const {
  WorkspaceAgentInvocation,
} = require("../../models/workspaceAgentInvocation");
const { writeResponseChunk } = require("../helpers/chat/responses");
const { WorkspaceAssistant } = require("../../models/workspaceAssistant");

/**
 * 判断是否应该启用 Agent 模式
 * @param {Object} params
 * @param {string} params.message - 用户消息
 * @param {string|null} params.assistantId - AI员工模板ID
 * @returns {Promise<{shouldUseAgent: boolean, reason: string}>}
 */
async function shouldEnableAgentMode({ message, assistantId }) {
  // 1. 显式 @agent 前缀 - 始终启用（向后兼容）
  const agentHandles = WorkspaceAgentInvocation.parseAgents(message);
  if (agentHandles.length > 0) {
    return { shouldUseAgent: true, reason: "explicit_@agent" };
  }

  // 2. 如果没有选中 AI 员工，不启用 Agent
  if (!assistantId) {
    return { shouldUseAgent: false, reason: "no_assistant_selected" };
  }

  // 3. 根据 AI 员工配置判断
  // 注意：assistantId 是 workspace_assistants 表的实例 ID，不是模板 ID
  try {
    const instance = await WorkspaceAssistant.get(assistantId);
    if (!instance) {
      return { shouldUseAgent: false, reason: "instance_not_found" };
    }

    const template = instance.template;
    if (!template) {
      return { shouldUseAgent: false, reason: "template_not_found" };
    }

    // 3a. 外部平台模式 - 不走本地 Agent（由外部平台处理）
    if (template.platformType && template.platformType !== "internal") {
      return { shouldUseAgent: false, reason: "external_platform" };
    }

    // 3b. 检查是否有工具配置（支持数组或对象格式）
    let hasTools = false;
    if (template.defaultTools) {
      if (Array.isArray(template.defaultTools)) {
        hasTools = template.defaultTools.length > 0;
      } else if (typeof template.defaultTools === "object") {
        hasTools = Object.keys(template.defaultTools).length > 0;
      }
    }

    // 3c. 检查是否有 Agent Flow
    const hasFlow = !!template.agentFlowId;

    // 有工具或 Flow → 启用 Agent 模式
    if (hasTools || hasFlow) {
      return {
        shouldUseAgent: true,
        reason: hasFlow ? "has_agent_flow" : "has_tools",
        template,
      };
    }

    return { shouldUseAgent: false, reason: "no_tools_or_flow" };
  } catch (error) {
    console.error("[AgentMode] Error checking template:", error);
    return { shouldUseAgent: false, reason: "error" };
  }
}

async function grepAgents({
  uuid,
  response,
  message,
  workspace,
  user = null,
  thread = null,
  assistantId = null, // 接收选中的AI员工ID
  attachments = [], // 接收聊天附件
  authorizationMode = null, // "hitl" | "full_authorize"
}) {
  // 使用新的判断逻辑
  const { shouldUseAgent, reason } = await shouldEnableAgentMode({
    message,
    assistantId,
  });

  console.log(
    `[AgentMode] Decision: ${shouldUseAgent ? "ENABLED" : "DISABLED"}, reason: ${reason}`
  );

  if (shouldUseAgent) {
    const requestedMode = String(authorizationMode || "").toLowerCase();
    const isFullAuthorizeRequested =
      requestedMode === "full_authorize" || requestedMode === "full-authorize";
    const effectiveAuthorizationMode =
      isFullAuthorizeRequested && user?.role === "admin"
        ? "full_authorize"
        : "hitl";

    const { invocation: newInvocation } = await WorkspaceAgentInvocation.new({
      prompt: message,
      workspace: workspace,
      user: user,
      thread: thread,
      assistantId: assistantId, // 传递AI员工ID到invocation
      attachments: attachments, // 传递附件到invocation
      metadata: { authorizationMode: effectiveAuthorizationMode },
    });

    if (!newInvocation) {
      writeResponseChunk(response, {
        id: uuid,
        type: "statusResponse",
        textResponse: `Agent 无法启动，将使用默认聊天模式处理。`,
        sources: [],
        close: true,
        animate: false,
        error: null,
      });
      return;
    }

    console.log(
      `[AgentMode] Sending agentInitWebsocketConnection with UUID: ${newInvocation.uuid}`
    );
    writeResponseChunk(response, {
      id: uuid,
      type: "agentInitWebsocketConnection",
      textResponse: null,
      sources: [],
      close: false,
      error: null,
      websocketUUID: newInvocation.uuid,
    });

    // 根据触发原因显示不同的消息
    const statusMessage =
      reason === "explicit_@agent"
        ? `Agent 已调用。\n切换到 Agent 聊天模式。输入 /exit 可提前退出。`
        : `智能助手已启动。\n正在使用 AI 员工的工具和能力处理您的请求...`;

    // Close HTTP stream-able chunk response method because we will swap to agents now.
    writeResponseChunk(response, {
      id: uuid,
      type: "statusResponse",
      textResponse: statusMessage,
      sources: [],
      close: true,
      error: null,
      animate: true,
    });
    return true;
  }

  return false;
}

module.exports = { grepAgents, shouldEnableAgentMode };
