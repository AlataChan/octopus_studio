/**
 * @fileoverview 权限系统辅助函数
 * 提供与现有系统集成的辅助方法
 * @see docs/AGENT_SYSTEM_DEVELOPMENT_PLAN.md 第 3.5 节
 */

const {
  PermissionMode,
  RiskLevel,
  ToolGatewayDecision,
  ELEVATED_PERMISSION_MODES,
} = require("./constants");
const { parseAssistantConfig, mergePermissionConfig } = require("./types");
const { evaluateToolCall, getToolRiskLevel } = require("./toolGateway");

/**
 * 检查用户是否有权限配置指定的权限模式
 * @param {string} userRole - 用户角色 (admin | manager | default)
 * @param {string} permissionMode - 要配置的权限模式
 * @returns {boolean}
 */
function canConfigurePermissionMode(userRole, permissionMode) {
  // admin 和 manager 可以配置所有模式
  if (userRole === "admin" || userRole === "manager") {
    return true;
  }
  // 普通用户不能配置需要提升权限的模式
  return !ELEVATED_PERMISSION_MODES.includes(permissionMode);
}

/**
 * 从 Workspace 助手实例获取有效的权限配置
 * @param {Object} assistantTemplate - 助手模板记录
 * @param {Object} workspaceAssistant - Workspace 助手实例记录
 * @returns {Object} 合并后的有效配置
 */
function getEffectivePermissionConfig(assistantTemplate, workspaceAssistant) {
  const instanceConfig = parseAssistantConfig(workspaceAssistant?.customConfig);
  return mergePermissionConfig(assistantTemplate || {}, instanceConfig);
}

/**
 * 创建工具调用的审计日志条目
 * @param {Object} params
 * @param {number} params.workspaceId - Workspace ID
 * @param {number} [params.userId] - 用户 ID
 * @param {string} params.toolName - 工具名称
 * @param {string} params.decision - 判定结果
 * @param {string} [params.reason] - 判定原因
 * @param {Object} [params.context] - 额外上下文
 * @returns {Object} 审计日志条目
 */
function createToolCallAuditEntry({
  workspaceId,
  userId,
  toolName,
  decision,
  reason,
  context = {},
}) {
  return {
    event: "tool_call_evaluated",
    timestamp: new Date().toISOString(),
    workspaceId,
    userId,
    toolName,
    decision,
    reason,
    riskLevel: context.riskLevel,
    permissionMode: context.permissionMode,
    metadata: {
      assistantInstanceId: context.assistantInstanceId,
      flowId: context.flowId,
      stepIndex: context.stepIndex,
    },
  };
}

/**
 * 将工具调度网关判定结果转换为 HitL 确认记录参数
 * @param {Object} params
 * @param {number} params.workspaceId - Workspace ID
 * @param {number} [params.userId] - 用户 ID
 * @param {number} [params.threadId] - Thread ID
 * @param {number} [params.chatId] - Chat ID
 * @param {string} params.toolName - 工具名称
 * @param {Object} params.toolArgs - 工具参数
 * @param {string} params.riskLevel - 风险级别
 * @param {string} [params.reason] - 判定原因
 * @returns {Object} HitL 确认记录参数
 */
function createHitLConfirmationParams({
  workspaceId,
  userId,
  threadId,
  chatId,
  toolName,
  toolArgs,
  riskLevel,
  reason,
}) {
  // 将 RiskLevel 映射到 HitL 的 riskLevel
  const hitlRiskLevel =
    {
      [RiskLevel.SAFE_READ]: "low",
      [RiskLevel.WRITE]: "medium",
      [RiskLevel.EXECUTE]: "high",
      [RiskLevel.EXTERNAL]: "high",
    }[riskLevel] || "medium";

  return {
    workspaceId,
    userId,
    threadId,
    chatId,
    planType: "tool_call",
    planTitle: `工具调用确认: ${toolName}`,
    planDetails: {
      toolName,
      toolArgs,
      riskLevel,
      reason,
    },
    riskLevel: hitlRiskLevel,
    timeoutMinutes: 5,
  };
}

/**
 * 将工具调度网关判定结果转换为 plan 模式的计划条目
 * @param {Object} params
 * @param {string} params.toolName - 工具名称
 * @param {Object} params.toolArgs - 工具参数
 * @param {string} params.riskLevel - 风险级别
 * @param {string} [params.purpose] - 调用目的
 * @returns {import('./types').PlannedToolCall}
 */
function createPlannedToolCall({ toolName, toolArgs, riskLevel, purpose }) {
  return {
    toolName,
    purpose: purpose || `执行 ${toolName} 工具`,
    estimatedImpact: getImpactDescription(riskLevel),
    args: toolArgs,
    riskLevel,
  };
}

/**
 * 获取风险级别的影响描述
 * @param {string} riskLevel - 风险级别
 * @returns {string}
 */
function getImpactDescription(riskLevel) {
  const descriptions = {
    [RiskLevel.SAFE_READ]: "只读操作，不会修改任何数据",
    [RiskLevel.WRITE]: "可能修改文件或数据",
    [RiskLevel.EXECUTE]: "可能执行系统命令或脚本",
    [RiskLevel.EXTERNAL]: "可能调用外部服务或 API",
  };
  return descriptions[riskLevel] || "未知影响";
}

module.exports = {
  canConfigurePermissionMode,
  getEffectivePermissionConfig,
  createToolCallAuditEntry,
  createHitLConfirmationParams,
  createPlannedToolCall,
  getImpactDescription,
};
