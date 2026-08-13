/**
 * @fileoverview 权限系统模块入口
 * 导出所有权限相关的常量、类型、工具网关和辅助函数
 */

const {
  PermissionMode,
  RiskLevel,
  ResourceScopeType,
  ToolGatewayDecision,
  ELEVATED_PERMISSION_MODES,
  RISK_LEVEL_DECISIONS,
  isValidPermissionMode,
  isValidRiskLevel,
} = require("./constants");

const {
  parseResourceScopes,
  parseStringArray,
  parseAssistantConfig,
  mergePermissionConfig,
} = require("./types");

const {
  BUILTIN_TOOL_RISK_LEVELS,
  getToolRiskLevel,
  isToolAllowed,
  isToolAutoApproved,
  evaluateToolCall,
} = require("./toolGateway");

const {
  canConfigurePermissionMode,
  getEffectivePermissionConfig,
  createToolCallAuditEntry,
  createHitLConfirmationParams,
  createPlannedToolCall,
  getImpactDescription,
} = require("./helpers");

module.exports = {
  // 枚举常量
  PermissionMode,
  RiskLevel,
  ResourceScopeType,
  ToolGatewayDecision,

  // 配置常量
  ELEVATED_PERMISSION_MODES,
  RISK_LEVEL_DECISIONS,
  BUILTIN_TOOL_RISK_LEVELS,

  // 校验函数
  isValidPermissionMode,
  isValidRiskLevel,

  // 解析与合并函数
  parseResourceScopes,
  parseStringArray,
  parseAssistantConfig,
  mergePermissionConfig,

  // 工具网关函数
  getToolRiskLevel,
  isToolAllowed,
  isToolAutoApproved,
  evaluateToolCall,

  // 辅助函数
  canConfigurePermissionMode,
  getEffectivePermissionConfig,
  createToolCallAuditEntry,
  createHitLConfirmationParams,
  createPlannedToolCall,
  getImpactDescription,
};
