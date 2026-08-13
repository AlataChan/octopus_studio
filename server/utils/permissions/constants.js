/**
 * @fileoverview 权限系统常量定义
 * 定义 PermissionMode、RiskLevel 枚举和相关常量
 * @see docs/AGENT_SYSTEM_DEVELOPMENT_PLAN.md 第 3 章
 */

/**
 * 权限模式枚举
 * @readonly
 * @enum {string}
 */
const PermissionMode = Object.freeze({
  /** 默认模式：只读安全工具自动通过，写/执行类需要确认 */
  DEFAULT: "default",
  /** 接受编辑模式：写入类工具自动通过，执行类仍需确认 */
  ACCEPT_EDITS: "acceptEdits",
  /** 绕过模式：所有工具自动通过（仅 admin/manager 可配置） */
  BYPASS: "bypass",
  /** 计划模式：仅生成计划，不真正执行高危工具 */
  PLAN: "plan",
});

/**
 * 工具风险级别枚举
 * @readonly
 * @enum {string}
 */
const RiskLevel = Object.freeze({
  /** 安全只读：Read/Glob/Grep/只读查询等 */
  SAFE_READ: "safe-read",
  /** 写入：写文件/写数据库/修改配置 */
  WRITE: "write",
  /** 执行：执行命令/脚本 */
  EXECUTE: "execute",
  /** 外部：调用第三方 HTTP / 外部系统 */
  EXTERNAL: "external",
});

/**
 * 资源范围类型枚举
 * @readonly
 * @enum {string}
 */
const ResourceScopeType = Object.freeze({
  /** Workspace 仓库/文件目录 */
  WORKSPACE_REPO: "workspace_repo",
  /** 上传的文件 */
  UPLOADED_FILES: "uploaded_files",
  /** 数据源 */
  DATASOURCE: "datasource",
  /** 自定义 */
  CUSTOM: "custom",
});

/**
 * 工具调度网关判定结果枚举
 * @readonly
 * @enum {string}
 */
const ToolGatewayDecision = Object.freeze({
  /** 自动通过 */
  ALLOW: "allow",
  /** 需要用户确认 */
  REQUIRE_CONFIRMATION: "require_confirmation",
  /** 拒绝执行 */
  DENY: "deny",
  /** 仅生成计划（plan 模式） */
  PLAN_ONLY: "plan_only",
});

/**
 * 需要 admin/manager 角色才能配置的权限模式
 * @type {string[]}
 */
const ELEVATED_PERMISSION_MODES = [PermissionMode.BYPASS];

/**
 * 各风险级别在不同权限模式下的默认行为
 * @type {Object<string, Object<string, string>>}
 */
const RISK_LEVEL_DECISIONS = Object.freeze({
  [PermissionMode.DEFAULT]: {
    [RiskLevel.SAFE_READ]: ToolGatewayDecision.ALLOW,
    [RiskLevel.WRITE]: ToolGatewayDecision.REQUIRE_CONFIRMATION,
    [RiskLevel.EXECUTE]: ToolGatewayDecision.REQUIRE_CONFIRMATION,
    [RiskLevel.EXTERNAL]: ToolGatewayDecision.REQUIRE_CONFIRMATION,
  },
  [PermissionMode.ACCEPT_EDITS]: {
    [RiskLevel.SAFE_READ]: ToolGatewayDecision.ALLOW,
    [RiskLevel.WRITE]: ToolGatewayDecision.ALLOW,
    [RiskLevel.EXECUTE]: ToolGatewayDecision.REQUIRE_CONFIRMATION,
    [RiskLevel.EXTERNAL]: ToolGatewayDecision.REQUIRE_CONFIRMATION,
  },
  [PermissionMode.BYPASS]: {
    [RiskLevel.SAFE_READ]: ToolGatewayDecision.ALLOW,
    [RiskLevel.WRITE]: ToolGatewayDecision.ALLOW,
    [RiskLevel.EXECUTE]: ToolGatewayDecision.ALLOW,
    [RiskLevel.EXTERNAL]: ToolGatewayDecision.ALLOW,
  },
  [PermissionMode.PLAN]: {
    [RiskLevel.SAFE_READ]: ToolGatewayDecision.ALLOW,
    [RiskLevel.WRITE]: ToolGatewayDecision.PLAN_ONLY,
    [RiskLevel.EXECUTE]: ToolGatewayDecision.PLAN_ONLY,
    [RiskLevel.EXTERNAL]: ToolGatewayDecision.PLAN_ONLY,
  },
});

/**
 * 校验权限模式是否有效
 * @param {string} mode - 权限模式字符串
 * @returns {boolean}
 */
function isValidPermissionMode(mode) {
  return Object.values(PermissionMode).includes(mode);
}

/**
 * 校验风险级别是否有效
 * @param {string} level - 风险级别字符串
 * @returns {boolean}
 */
function isValidRiskLevel(level) {
  return Object.values(RiskLevel).includes(level);
}

module.exports = {
  PermissionMode,
  RiskLevel,
  ResourceScopeType,
  ToolGatewayDecision,
  ELEVATED_PERMISSION_MODES,
  RISK_LEVEL_DECISIONS,
  isValidPermissionMode,
  isValidRiskLevel,
};
