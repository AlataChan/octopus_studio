/**
 * @fileoverview 权限系统类型定义
 * 定义 ResourceScope、WorkspaceAssistantConfig 等 JSDoc 类型
 * @see docs/AGENT_SYSTEM_DEVELOPMENT_PLAN.md 第 2.2 节和第 3.3 节
 */

/**
 * 资源访问范围定义
 * @typedef {Object} ResourceScope
 * @property {'workspace_repo'|'uploaded_files'|'datasource'|'custom'} type - 资源类型
 * @property {number} [workspaceId] - 关联的 Workspace ID
 * @property {string} [subPathPattern] - 子路径匹配模式（如 "src/**"）
 * @property {string} [datasourceId] - 数据源 ID
 * @property {Object} [customConfig] - 自定义配置（用于扩展）
 */

/**
 * Workspace 助手实例配置（存储在 workspace_assistants.customConfig 中）
 * @typedef {Object} WorkspaceAssistantConfig
 * @property {string} [overrideModel] - 覆盖模型，格式：provider:model
 * @property {'default'|'acceptEdits'|'bypass'|'plan'} [permissionMode] - 权限模式覆盖
 * @property {string[]} [allowedTools] - 允许使用的工具白名单（叠加或收紧模板默认值）
 * @property {string[]} [autoApprovedTools] - 自动批准的工具（无需二次确认）
 * @property {ResourceScope[]} [resourceScopes] - 资源访问范围覆盖
 */

/**
 * 工具调度网关判定上下文
 * @typedef {Object} ToolGatewayContext
 * @property {number} workspaceId - Workspace ID
 * @property {string} [assistantInstanceId] - 助手实例 ID（如果有）
 * @property {string} toolName - 工具名称
 * @property {string} riskLevel - 工具风险级别
 * @property {string} permissionMode - 当前权限模式
 * @property {string[]} allowedTools - 允许的工具白名单
 * @property {string[]} autoApprovedTools - 自动批准的工具列表
 * @property {ResourceScope[]} resourceScopes - 资源访问范围
 * @property {Object} [toolArgs] - 工具调用参数（用于资源范围校验）
 * @property {Object} [userContext] - 用户上下文（角色、ID 等）
 */

/**
 * 工具调度网关判定结果
 * @typedef {Object} ToolGatewayResult
 * @property {'allow'|'require_confirmation'|'deny'|'plan_only'} decision - 判定结果
 * @property {string} [reason] - 判定原因（用于日志和前端显示）
 * @property {string} [code] - 错误码（如果是拒绝）
 * @property {Object} [plannedAction] - 计划的操作（plan_only 模式下）
 */

/**
 * 计划中的工具调用（plan 模式下生成）
 * @typedef {Object} PlannedToolCall
 * @property {string} toolName - 工具名称
 * @property {string} purpose - 调用目的
 * @property {string} [estimatedImpact] - 预估影响范围
 * @property {Object} [args] - 调用参数
 * @property {string} riskLevel - 风险级别
 */

/**
 * 助手模板的权限相关字段
 * @typedef {Object} AssistantTemplatePermissions
 * @property {string} [sourceType] - 插件来源：builtin | markdown | remote
 * @property {string} [pluginType] - 插件类型：agent | command | skill
 * @property {string} [version] - 语义化版本号
 * @property {string} [contentHash] - SHA-256 哈希
 * @property {string} [originPath] - 源路径
 * @property {string} [defaultPermissionMode] - 默认权限模式
 * @property {string[]} [defaultAllowedTools] - 默认允许的工具
 * @property {string[]} [defaultAutoApprovedTools] - 默认自动批准的工具
 * @property {ResourceScope[]} [resourceScopes] - 默认资源范围
 */

/**
 * 解析 JSON 字符串为 ResourceScope 数组
 * @param {string|null} jsonStr - JSON 字符串
 * @returns {ResourceScope[]}
 */
function parseResourceScopes(jsonStr) {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 解析 JSON 字符串为字符串数组
 * @param {string|null} jsonStr - JSON 字符串
 * @returns {string[]}
 */
function parseStringArray(jsonStr) {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed)
      ? parsed.filter((s) => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * 解析 workspace_assistants.customConfig
 * @param {string|null} jsonStr - JSON 字符串
 * @returns {WorkspaceAssistantConfig}
 */
function parseAssistantConfig(jsonStr) {
  if (!jsonStr) return {};
  try {
    return JSON.parse(jsonStr) || {};
  } catch {
    return {};
  }
}

/**
 * 合并模板默认配置与实例覆盖配置
 * @param {AssistantTemplatePermissions} templateConfig - 模板配置
 * @param {WorkspaceAssistantConfig} instanceConfig - 实例覆盖配置
 * @returns {Object} 合并后的有效配置
 */
function mergePermissionConfig(templateConfig, instanceConfig) {
  return {
    permissionMode:
      instanceConfig.permissionMode ||
      templateConfig.defaultPermissionMode ||
      "default",
    allowedTools: instanceConfig.allowedTools?.length
      ? instanceConfig.allowedTools
      : parseStringArray(templateConfig.defaultAllowedTools),
    autoApprovedTools: instanceConfig.autoApprovedTools?.length
      ? instanceConfig.autoApprovedTools
      : parseStringArray(templateConfig.defaultAutoApprovedTools),
    resourceScopes: instanceConfig.resourceScopes?.length
      ? instanceConfig.resourceScopes
      : parseResourceScopes(templateConfig.resourceScopes),
    overrideModel:
      instanceConfig.overrideModel || templateConfig.recommendedModel,
  };
}

module.exports = {
  parseResourceScopes,
  parseStringArray,
  parseAssistantConfig,
  mergePermissionConfig,
};
