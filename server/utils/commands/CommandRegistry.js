/**
 * Command 注册表
 *
 * @description
 * 管理所有可用的斜杠命令，包括从 Skills 中收集的命令和自定义命令。
 * 提供命令的注册、查询和执行功能。
 *
 * @module server/utils/commands/CommandRegistry
 */

const { skillRegistry } = require("../skills");
const {
  CommandSource,
  CommandExecutionMode,
  COMMAND_PREFIX,
} = require("./constants");

/**
 * 命令定义
 * @typedef {Object} CommandDefinition
 * @property {string} command - 命令名称（如 /query-db）
 * @property {string} name - 命令显示名称
 * @property {string} description - 命令描述
 * @property {string} source - 命令来源（skill/flow/custom）
 * @property {string} [skillId] - 关联的 Skill ID
 * @property {string} [flowId] - 关联的 Flow ID
 * @property {Object} [flowDefinition] - Flow 定义
 * @property {string} executionMode - 执行模式（flow/tool/agent）
 */

/**
 * Command 注册表
 */
class CommandRegistry {
  constructor() {
    /** @type {Map<string, CommandDefinition>} */
    this.commands = new Map();
    this._initialized = false;
  }

  /**
   * 初始化注册表，从 Skills 中收集命令
   */
  initialize() {
    if (this._initialized) return;

    // 从 Skills 中收集命令
    const skills = skillRegistry.getAllSkills();
    for (const skill of skills) {
      const flowTemplates = skill.getFlowTemplates();
      for (const template of flowTemplates) {
        if (template.slashCommand) {
          this.registerCommand({
            command: template.slashCommand,
            name: template.name,
            description: template.description,
            source: CommandSource.SKILL,
            skillId: skill.id,
            flowId: template.id,
            flowDefinition: template.flowDefinition,
            executionMode: CommandExecutionMode.AGENT,
          });
        }
      }
    }

    this._initialized = true;
    console.log(
      `[CommandRegistry] Initialized with ${this.commands.size} commands`
    );
  }

  /**
   * 注册命令
   * @param {CommandDefinition} definition - 命令定义
   */
  registerCommand(definition) {
    const command = definition.command.startsWith(COMMAND_PREFIX)
      ? definition.command
      : COMMAND_PREFIX + definition.command;

    if (this.commands.has(command)) {
      console.warn(
        `[CommandRegistry] Command "${command}" already exists, overwriting`
      );
    }

    this.commands.set(command, {
      ...definition,
      command,
    });
    console.log(`[CommandRegistry] Registered command: ${command}`);
  }

  /**
   * 获取命令定义
   * @param {string} command - 命令名称
   * @param {{channel?: string}} [context] - 可选上下文（用于渠道/权限门控）
   * @returns {CommandDefinition | null}
   */
  getCommand(command, context = {}) {
    this.initialize();
    const normalizedCommand = command.startsWith(COMMAND_PREFIX)
      ? command
      : COMMAND_PREFIX + command;
    const definition = this.commands.get(normalizedCommand) || null;
    if (!definition) return null;

    // Skill-backed commands should only be available when the referenced Skill exists
    // and is allowed in the current channel context.
    if (definition.skillId) {
      const skill = skillRegistry.getSkill(definition.skillId);
      if (!skill) return null;

      const channel = context?.channel;
      if (
        channel &&
        typeof skill.isAvailableInChannel === "function" &&
        !skill.isAvailableInChannel(channel)
      ) {
        return null;
      }
    }

    return definition;
  }

  /**
   * 获取所有命令
   * @returns {CommandDefinition[]}
   */
  getAllCommands() {
    this.initialize();
    return Array.from(this.commands.values());
  }

  /**
   * 解析消息中的命令
   * @param {string} message - 用户消息
   * @param {{channel?: string}} [context] - 可选上下文（用于渠道/权限门控）
   * @returns {{ command: CommandDefinition | null, args: string }}
   */
  parseMessage(message, context = {}) {
    this.initialize();
    const trimmed = message.trim();

    if (!trimmed.startsWith(COMMAND_PREFIX)) {
      return { command: null, args: trimmed };
    }

    // 提取命令和参数
    const spaceIndex = trimmed.indexOf(" ");
    const commandStr =
      spaceIndex > 0 ? trimmed.substring(0, spaceIndex) : trimmed;
    const args = spaceIndex > 0 ? trimmed.substring(spaceIndex + 1).trim() : "";

    const command = this.getCommand(commandStr, context);
    return { command, args };
  }

  /**
   * 检查消息是否是命令
   * @param {string} message - 用户消息
   * @returns {boolean}
   */
  isCommand(message) {
    return message.trim().startsWith(COMMAND_PREFIX);
  }

  /**
   * 按来源获取命令
   * @param {string} source - 命令来源
   * @returns {CommandDefinition[]}
   */
  getCommandsBySource(source) {
    this.initialize();
    return this.getAllCommands().filter((cmd) => cmd.source === source);
  }

  /**
   * 按 Skill ID 获取命令
   * @param {string} skillId - Skill ID
   * @returns {CommandDefinition[]}
   */
  getCommandsBySkill(skillId) {
    this.initialize();
    return this.getAllCommands().filter((cmd) => cmd.skillId === skillId);
  }
}

// 单例实例
const commandRegistry = new CommandRegistry();

module.exports = { CommandRegistry, commandRegistry };
