/**
 * Skill 基类
 *
 * @description
 * 所有 Skill 实现都应继承此基类。
 * Skill 是一个"能力包"，封装了工具、MCP 服务器和 Flow 模板。
 *
 * @module server/utils/skills/BaseSkill
 */

const { SkillCategory, SkillStatus } = require("./constants");

/**
 * Skill 基类
 * @abstract
 */
class BaseSkill {
  /**
   * @param {Object} options - 初始化选项
   * @param {string} options.id - Skill 唯一标识
   * @param {string} options.name - Skill 名称
   * @param {string} options.description - Skill 描述
   * @param {string} [options.version="1.0.0"] - Skill 版本
   * @param {string} [options.category=SkillCategory.UTILITY] - 分类
   * @param {string[]} [options.tags=[]] - 标签
   * @param {string} [options.icon] - 图标
   * @param {{channels?: string[]}} [options.requires] - 可用性约束（如渠道 allowlist）
   */
  constructor(options) {
    if (new.target === BaseSkill) {
      throw new Error("BaseSkill 是抽象类，不能直接实例化");
    }

    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.version = options.version || "1.0.0";
    this.category = options.category || SkillCategory.UTILITY;
    this.tags = options.tags || [];
    this.icon = options.icon || "🔧";
    this.status = SkillStatus.AVAILABLE;
    this.requires = options.requires || {};
  }

  /**
   * 获取 Skill 元数据
   * @returns {import('./types').SkillMetadata}
   */
  getMetadata() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      category: this.category,
      tags: this.tags,
      icon: this.icon,
    };
  }

  /**
   * 判断 Skill 是否在指定渠道可用。
   * - 默认：未配置 requires.channels 时，对所有渠道可用
   * - 显式配置：仅允许在 channels 列表中的渠道使用
   * @param {string} channel
   * @returns {boolean}
   */
  isAvailableInChannel(channel = "web") {
    const channels = this.requires?.channels;
    if (!Array.isArray(channels) || channels.length === 0) return true;

    const normalized = String(channel || "")
      .trim()
      .toLowerCase();
    const normalizedChannels = channels.map((value) =>
      String(value || "")
        .trim()
        .toLowerCase()
    );

    return (
      normalizedChannels.includes("*") ||
      normalizedChannels.includes(normalized)
    );
  }

  /**
   * 获取工具绑定列表
   * @abstract
   * @returns {import('./types').ToolBinding[]}
   */
  getToolBindings() {
    throw new Error("子类必须实现 getToolBindings 方法");
  }

  /**
   * 获取 MCP 服务器绑定列表
   * @returns {import('./types').MCPBinding[]}
   */
  getMCPBindings() {
    return []; // 默认无 MCP 绑定
  }

  /**
   * 获取 Flow 模板列表
   * @returns {import('./types').FlowTemplate[]}
   */
  getFlowTemplates() {
    return []; // 默认无 Flow 模板
  }

  /**
   * 获取 Skill 的 System Prompt（专业指导）
   * 子类可覆盖此方法提供特定的提示词
   * @returns {string|null} System Prompt 或 null
   */
  getSystemPrompt() {
    return null; // 默认无 System Prompt
  }

  /**
   * 获取配置 Schema
   * @returns {import('./types').ConfigSchema}
   */
  getConfigSchema() {
    return {
      version: "1.0",
      fields: [],
    };
  }

  /**
   * 获取默认配置
   * @returns {Object}
   */
  getDefaultConfig() {
    const schema = this.getConfigSchema();
    const defaults = {};
    for (const field of schema.fields) {
      if (field.defaultValue !== undefined) {
        defaults[field.key] = field.defaultValue;
      }
    }
    return defaults;
  }

  /**
   * 验证配置
   * @param {Object} config - 用户配置
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateConfig(config) {
    const schema = this.getConfigSchema();
    const errors = [];

    for (const field of schema.fields) {
      const value = config[field.key];

      // 检查必填字段
      if (
        field.required &&
        (value === undefined || value === null || value === "")
      ) {
        errors.push(`字段 "${field.label}" 是必填的`);
        continue;
      }

      // 如果有值，进行类型和验证规则检查
      if (value !== undefined && value !== null && field.validation) {
        if (field.type === "number") {
          if (
            field.validation.min !== undefined &&
            value < field.validation.min
          ) {
            errors.push(
              `字段 "${field.label}" 不能小于 ${field.validation.min}`
            );
          }
          if (
            field.validation.max !== undefined &&
            value > field.validation.max
          ) {
            errors.push(
              `字段 "${field.label}" 不能大于 ${field.validation.max}`
            );
          }
        }
        if (field.type === "string" && field.validation.pattern) {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(value)) {
            errors.push(`字段 "${field.label}" 格式不正确`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 获取完整的 Skill 定义
   * @returns {import('./types').SkillDefinition}
   */
  getDefinition() {
    return {
      metadata: this.getMetadata(),
      tools: this.getToolBindings(),
      mcpServers: this.getMCPBindings(),
      flowTemplates: this.getFlowTemplates(),
      configSchema: this.getConfigSchema(),
      defaultConfig: this.getDefaultConfig(),
    };
  }
}

module.exports = { BaseSkill };
