/**
 * Command 系统入口
 *
 * @description
 * Command 是一种斜杠命令机制，允许用户通过 `/command` 格式触发特定的 Flow 或工具。
 *
 * 使用示例：
 * ```javascript
 * const { commandRegistry } = require('./utils/commands');
 *
 * // 解析用户消息
 * const { command, args } = commandRegistry.parseMessage('/query-db SELECT * FROM users');
 *
 * if (command) {
 *   console.log(`执行命令: ${command.name}`);
 *   console.log(`参数: ${args}`);
 * }
 *
 * // 获取所有可用命令
 * const commands = commandRegistry.getAllCommands();
 * ```
 *
 * @module server/utils/commands
 */

const { CommandRegistry, commandRegistry } = require("./CommandRegistry");
const {
  CommandSource,
  CommandExecutionMode,
  COMMAND_PREFIX,
  BUILTIN_COMMAND_PREFIX,
} = require("./constants");

module.exports = {
  // 核心类
  CommandRegistry,
  commandRegistry,

  // 常量
  CommandSource,
  CommandExecutionMode,
  COMMAND_PREFIX,
  BUILTIN_COMMAND_PREFIX,
};
