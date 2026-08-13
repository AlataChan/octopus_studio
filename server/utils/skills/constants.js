/**
 * Skill 系统常量定义
 *
 * @module server/utils/skills/constants
 */

/**
 * Skill 分类
 * @readonly
 * @enum {string}
 */
const SkillCategory = {
  /** 数据库相关 */
  DATABASE: "database",
  /** 搜索相关 */
  SEARCH: "search",
  /** API 集成 */
  API: "api",
  /** 文档处理 */
  DOCUMENT: "document",
  /** 代码相关 */
  CODE: "code",
  /** 通用工具 */
  UTILITY: "utility",
  /** 自定义 */
  CUSTOM: "custom",
};

/**
 * Skill 状态
 * @readonly
 * @enum {string}
 */
const SkillStatus = {
  /** 可用 */
  AVAILABLE: "available",
  /** 已安装 */
  INSTALLED: "installed",
  /** 已禁用 */
  DISABLED: "disabled",
  /** 需要配置 */
  NEEDS_CONFIG: "needs_config",
  /** 错误 */
  ERROR: "error",
};

/**
 * 配置字段类型
 * @readonly
 * @enum {string}
 */
const ConfigFieldType = {
  STRING: "string",
  NUMBER: "number",
  BOOLEAN: "boolean",
  SELECT: "select",
  MULTISELECT: "multiselect",
  JSON: "json",
  PASSWORD: "password",
  URL: "url",
};

/**
 * Skill 事件类型（用于审计日志）
 * @readonly
 * @enum {string}
 */
const SkillEventType = {
  INSTALLED: "skill_installed",
  UNINSTALLED: "skill_uninstalled",
  ENABLED: "skill_enabled",
  DISABLED: "skill_disabled",
  CONFIG_UPDATED: "skill_config_updated",
  FLOW_EXECUTED: "skill_flow_executed",
  ERROR: "skill_error",
};

/**
 * 内置 Skill ID 前缀
 * @constant {string}
 */
const BUILTIN_SKILL_PREFIX = "builtin:";

/**
 * 自定义 Skill ID 前缀
 * @constant {string}
 */
const CUSTOM_SKILL_PREFIX = "custom:";

/**
 * Skill 配置缓存 TTL（毫秒）
 * @constant {number}
 */
const SKILL_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

module.exports = {
  SkillCategory,
  SkillStatus,
  ConfigFieldType,
  SkillEventType,
  BUILTIN_SKILL_PREFIX,
  CUSTOM_SKILL_PREFIX,
  SKILL_CONFIG_CACHE_TTL,
};
