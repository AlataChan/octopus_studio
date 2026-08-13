/**
 * @fileoverview 统一工具调度网关
 * 所有工具调用（普通聊天、AgentFlow 步骤）都经过此网关进行权限判定
 * @see docs/AGENT_SYSTEM_DEVELOPMENT_PLAN.md 第 3.4 节
 */

const {
  PermissionMode,
  RiskLevel,
  ToolGatewayDecision,
  RISK_LEVEL_DECISIONS,
  isValidPermissionMode,
  isValidRiskLevel,
} = require("./constants");
const { mergePermissionConfig } = require("./types");
const {
  getAbstractToolNamesForRuntime,
  getToolNameCandidates,
} = require("./toolAliases");

/**
 * 内置工具的风险级别映射
 * 可通过配置文件或数据库扩展
 * @type {Object<string, string>}
 */
const BUILTIN_TOOL_RISK_LEVELS = {
  // 安全只读工具
  "rag-search": RiskLevel.SAFE_READ,
  "document-search": RiskLevel.SAFE_READ,
  "web-search": RiskLevel.SAFE_READ,
  // MCP Hub broker tool: the tool itself is safe-read; it performs its own policy + HITL gating for risky calls.
  mcp_hub: RiskLevel.SAFE_READ,
  "list-files": RiskLevel.SAFE_READ,
  "read-file": RiskLevel.SAFE_READ,
  code_read: RiskLevel.SAFE_READ,
  code_grep: RiskLevel.SAFE_READ,
  code_patch: RiskLevel.SAFE_READ,
  "get-weather": RiskLevel.SAFE_READ,
  calculator: RiskLevel.SAFE_READ,

  // SYSTEM_TOOLS / OUTPUT_TOOLS（与 defaults.js 三层架构 Layer 1/2 对齐）
  // 这些都是 agent 与用户的通信通道（生成产物给用户、读系统时间、标记完成），
  // 没有外部副作用，也无需 HitL 审批 — 否则每次回答前都弹审批，体验崩坏。
  done: RiskLevel.SAFE_READ,
  "datetime-info": RiskLevel.SAFE_READ,
  "generate-excel-report": RiskLevel.SAFE_READ,
  "generate-presentation": RiskLevel.SAFE_READ,
  "ppt-outline-flow": RiskLevel.SAFE_READ,
  "ppt-generate-flow": RiskLevel.SAFE_READ,
  "generate-pdf-document": RiskLevel.SAFE_READ,
  "generate-official-document": RiskLevel.SAFE_READ,
  "save-file-to-browser": RiskLevel.SAFE_READ,
  "create-chart": RiskLevel.SAFE_READ,

  // 写入类工具
  "write-file": RiskLevel.WRITE,
  code_write: RiskLevel.WRITE,
  code_edit: RiskLevel.WRITE,
  "save-document": RiskLevel.WRITE,
  "update-config": RiskLevel.WRITE,

  // 执行类工具
  "execute-code": RiskLevel.EXECUTE,
  code_shell: RiskLevel.EXECUTE,
  "run-script": RiskLevel.EXECUTE,
  "shell-command": RiskLevel.EXECUTE,

  // 外部调用工具
  "http-request": RiskLevel.EXTERNAL,
  "api-call": RiskLevel.EXTERNAL,
  "send-email": RiskLevel.EXTERNAL,
  "mcp-tool": RiskLevel.EXTERNAL,
};

/**
 * 获取工具的风险级别
 * @param {string} toolName - 工具名称
 * @param {Object} [toolRegistry] - 可选的工具注册表（包含自定义风险级别）
 * @returns {string} 风险级别
 */
function getToolRiskLevel(toolName, toolRegistry = {}) {
  // 优先使用工具注册表中的自定义风险级别
  if (toolRegistry[toolName]?.riskLevel) {
    return toolRegistry[toolName].riskLevel;
  }

  // 先按运行时名称回退到内置映射
  if (BUILTIN_TOOL_RISK_LEVELS[toolName]) {
    return BUILTIN_TOOL_RISK_LEVELS[toolName];
  }

  // 再尝试抽象别名（例如 web-browsing -> http-request）
  const abstractAliases = getAbstractToolNamesForRuntime(toolName);
  for (const alias of abstractAliases) {
    if (toolRegistry[alias]?.riskLevel) return toolRegistry[alias].riskLevel;
    if (BUILTIN_TOOL_RISK_LEVELS[alias]) return BUILTIN_TOOL_RISK_LEVELS[alias];
  }

  // 最终回退：外部调用
  return RiskLevel.EXTERNAL;
}

/**
 * 检查工具是否在白名单中
 * @param {string} toolName - 工具名称
 * @param {string[]} allowedTools - 允许的工具列表
 * @returns {boolean}
 */
function isToolAllowed(toolName, allowedTools) {
  // 空白名单表示允许所有工具
  if (!allowedTools || allowedTools.length === 0) return true;

  const candidates = getToolNameCandidates(toolName);

  const matches = (pattern, candidate) => {
    if (pattern === "*") return true;
    if (pattern.endsWith("*"))
      return candidate.startsWith(pattern.slice(0, -1));
    return candidate === pattern;
  };

  // 支持通配符匹配（对 runtimeName + abstract aliases 都生效）
  return allowedTools.some((pattern) =>
    candidates.some((candidate) => matches(pattern, candidate))
  );
}

/**
 * 检查工具是否在自动批准列表中
 * @param {string} toolName - 工具名称
 * @param {string[]} autoApprovedTools - 自动批准的工具列表
 * @returns {boolean}
 */
function isToolAutoApproved(toolName, autoApprovedTools) {
  if (!autoApprovedTools || autoApprovedTools.length === 0) return false;

  const candidates = getToolNameCandidates(toolName);

  const matches = (pattern, candidate) => {
    if (pattern === "*") return true;
    if (pattern.endsWith("*"))
      return candidate.startsWith(pattern.slice(0, -1));
    return candidate === pattern;
  };

  return autoApprovedTools.some((pattern) =>
    candidates.some((candidate) => matches(pattern, candidate))
  );
}

/**
 * 统一工具调度网关 - 核心判定函数
 * @param {import('./types').ToolGatewayContext} context - 判定上下文
 * @returns {import('./types').ToolGatewayResult} 判定结果
 */
function evaluateToolCall(context) {
  const {
    toolName,
    riskLevel: providedRiskLevel,
    permissionMode = PermissionMode.DEFAULT,
    allowedTools = [],
    autoApprovedTools = [],
    toolRegistry = {},
  } = context;

  // 1. 获取工具风险级别
  const riskLevel =
    providedRiskLevel || getToolRiskLevel(toolName, toolRegistry);

  // 2. 校验权限模式和风险级别
  if (!isValidPermissionMode(permissionMode)) {
    return {
      decision: ToolGatewayDecision.DENY,
      reason: `无效的权限模式: ${permissionMode}`,
      code: "INVALID_PERMISSION_MODE",
    };
  }

  if (!isValidRiskLevel(riskLevel)) {
    return {
      decision: ToolGatewayDecision.DENY,
      reason: `无效的风险级别: ${riskLevel}`,
      code: "INVALID_RISK_LEVEL",
    };
  }

  // 3. 检查工具白名单
  if (!isToolAllowed(toolName, allowedTools)) {
    return {
      decision: ToolGatewayDecision.DENY,
      reason: `工具 "${toolName}" 不在允许列表中`,
      code: "TOOL_NOT_ALLOWED",
    };
  }

  // 4. 获取基于权限模式和风险级别的默认判定
  const baseDecision = RISK_LEVEL_DECISIONS[permissionMode]?.[riskLevel];
  if (!baseDecision) {
    return {
      decision: ToolGatewayDecision.DENY,
      reason: `无法确定权限模式 "${permissionMode}" 下风险级别 "${riskLevel}" 的判定`,
      code: "DECISION_NOT_FOUND",
    };
  }

  // 5. 如果需要确认，检查是否在自动批准列表中
  if (baseDecision === ToolGatewayDecision.REQUIRE_CONFIRMATION) {
    if (isToolAutoApproved(toolName, autoApprovedTools)) {
      return {
        decision: ToolGatewayDecision.ALLOW,
        reason: `工具 "${toolName}" 在自动批准列表中`,
      };
    }
  }

  // 6. 返回最终判定
  return {
    decision: baseDecision,
    reason: `权限模式 "${permissionMode}" 下，风险级别 "${riskLevel}" 的工具 "${toolName}"`,
  };
}

module.exports = {
  BUILTIN_TOOL_RISK_LEVELS,
  getToolRiskLevel,
  isToolAllowed,
  isToolAutoApproved,
  evaluateToolCall,
};
