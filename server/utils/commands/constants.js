/**
 * Command 系统常量定义
 *
 * @module server/utils/commands/constants
 */

/**
 * 命令来源类型
 * @readonly
 * @enum {string}
 */
const CommandSource = {
  /** 来自 Skill 的 FlowTemplate */
  SKILL: "skill",
  /** 来自 Agent Flow */
  FLOW: "flow",
  /** 来自自定义定义 */
  CUSTOM: "custom",
};

/**
 * 命令执行模式
 * @readonly
 * @enum {string}
 */
const CommandExecutionMode = {
  /** 触发 Flow 执行 */
  FLOW: "flow",
  /** 直接调用工具 */
  TOOL: "tool",
  /** 传递给 Agent 处理 */
  AGENT: "agent",
};

/**
 * 命令前缀
 * @constant {string}
 */
const COMMAND_PREFIX = "/";

/**
 * 内置命令前缀
 * @constant {string}
 */
const BUILTIN_COMMAND_PREFIX = "builtin:";

module.exports = {
  CommandSource,
  CommandExecutionMode,
  COMMAND_PREFIX,
  BUILTIN_COMMAND_PREFIX,
};
