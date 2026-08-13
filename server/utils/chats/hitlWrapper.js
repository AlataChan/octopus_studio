/**
 * HitL (Human-in-the-Loop) 工具包装器
 * 用于在敏感操作前触发用户确认
 */

const {
  WorkflowPendingConfirmation,
} = require("../../models/workflowPendingConfirmation");

/**
 * 敏感工具列表 (需要 HitL 确认)
 */
const SENSITIVE_TOOLS = new Set([
  // 文件操作
  "purge-document",
  "purge-folder",
  "delete-file",
  "remove-file",

  // 数据修改
  "update-workspace",
  "delete-workspace",
  "update-user",
  "delete-user",

  // 外部调用
  "web-scraping",
  "sql-agent",

  // 自定义敏感工具 (可扩展)
]);

/**
 * 检查工具是否需要 HitL 确认
 * @param {string} toolName - 工具名称
 * @returns {boolean} 是否需要确认
 */
function requiresConfirmation(toolName) {
  return SENSITIVE_TOOLS.has(toolName);
}

/**
 * 创建 HitL 确认请求
 * @param {Object} params - 参数
 * @param {number} params.workspaceId - Workspace ID
 * @param {number} params.userId - 用户 ID
 * @param {string} params.threadId - 线程 ID
 * @param {number} params.chatId - 聊天 ID
 * @param {string} params.toolName - 工具名称
 * @param {Object} params.toolArgs - 工具参数
 * @param {string} params.riskLevel - 风险等级 (low/medium/high)
 * @returns {Promise<Object>} 确认记录
 */
async function createToolConfirmation({
  workspaceId,
  userId,
  threadId,
  chatId,
  toolName,
  toolArgs,
  riskLevel = "medium",
}) {
  const planTitle = `执行工具: ${toolName}`;
  const planDetails = {
    toolName,
    arguments: toolArgs,
    timestamp: new Date().toISOString(),
  };

  return await WorkflowPendingConfirmation.create({
    workspaceId,
    userId,
    threadId,
    chatId,
    planType: "tool_call",
    planTitle,
    planDetails,
    riskLevel,
    timeoutMinutes: 5, // 5 分钟超时
  });
}

/**
 * 等待用户确认
 * @param {number} confirmationId - 确认记录 ID
 * @param {number} maxWaitSeconds - 最大等待时间 (秒)
 * @returns {Promise<Object>} { approved: boolean, userResponse: string|null }
 */
async function waitForConfirmation(confirmationId, maxWaitSeconds = 300) {
  const startTime = Date.now();
  const pollInterval = 2000; // 每 2 秒轮询一次

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    const confirmation = await WorkflowPendingConfirmation.get(confirmationId);

    if (!confirmation) {
      throw new Error("Confirmation record not found");
    }

    if (confirmation.status === "approved") {
      return { approved: true, userResponse: confirmation.userResponse };
    }

    if (confirmation.status === "rejected") {
      return { approved: false, userResponse: confirmation.userResponse };
    }

    if (confirmation.status === "expired") {
      throw new Error("Confirmation expired");
    }

    // 等待下一次轮询
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // 超时
  await WorkflowPendingConfirmation.expire(confirmationId);
  throw new Error("Confirmation timeout");
}

/**
 * 包装敏感工具调用
 * @param {Object} params - 参数
 * @param {string} params.toolName - 工具名称
 * @param {Object} params.toolArgs - 工具参数
 * @param {Function} params.toolHandler - 工具处理函数
 * @param {Object} params.context - 上下文 (workspaceId, userId, threadId, chatId)
 * @param {string} params.riskLevel - 风险等级
 * @returns {Promise<any>} 工具执行结果
 */
async function wrapSensitiveTool({
  toolName,
  toolArgs,
  toolHandler,
  context,
  riskLevel = "medium",
}) {
  // 检查是否需要确认
  if (!requiresConfirmation(toolName)) {
    // 不需要确认,直接执行
    return await toolHandler(toolArgs);
  }

  // 创建确认请求
  const confirmation = await createToolConfirmation({
    workspaceId: context.workspaceId,
    userId: context.userId,
    threadId: context.threadId,
    chatId: context.chatId,
    toolName,
    toolArgs,
    riskLevel,
  });

  console.log(
    `[HitL] Waiting for confirmation: ${confirmation.id} (${toolName})`
  );

  // 等待用户确认
  const { approved, userResponse } = await waitForConfirmation(confirmation.id);

  if (!approved) {
    console.log(`[HitL] Tool execution rejected: ${toolName}`);
    throw new Error(
      `Tool execution rejected by user: ${userResponse || "No reason provided"}`
    );
  }

  console.log(`[HitL] Tool execution approved: ${toolName}`);

  // 执行工具
  return await toolHandler(toolArgs);
}

module.exports = {
  requiresConfirmation,
  createToolConfirmation,
  waitForConfirmation,
  wrapSensitiveTool,
  SENSITIVE_TOOLS,
};
