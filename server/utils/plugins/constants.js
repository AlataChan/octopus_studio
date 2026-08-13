/**
 * 插件系统常量定义
 *
 * @module server/utils/plugins/constants
 */

const path = require("path");

/**
 * 插件类型
 * @readonly
 * @enum {string}
 */
const PluginType = {
  AGENT: "agent",
  COMMAND: "command",
  SKILL: "skill",
};

/**
 * 插件来源类型
 * @readonly
 * @enum {string}
 */
const SourceType = {
  BUILTIN: "builtin",
  MARKDOWN: "markdown",
  REMOTE: "remote",
};

/**
 * 插件目录结构
 * @constant {Object}
 */
const PLUGIN_DIRECTORIES = {
  /** Agent 插件目录 */
  agents: "agents",
  /** Command 插件目录 */
  commands: "commands",
  /** Skill 插件目录 */
  skills: "skills",
};

/**
 * 插件根目录（相对于 storage）
 * @constant {string}
 */
const PLUGINS_BASE_PATH =
  process.env.NODE_ENV === "development"
    ? path.resolve(__dirname, "../../storage/plugins/custom")
    : path.resolve(process.env.STORAGE_DIR || ".", "plugins", "custom");

/**
 * 内置插件目录
 * @constant {string}
 */
const BUILTIN_PLUGINS_PATH = path.resolve(__dirname, "../../resources/plugins");

/**
 * 插件缓存 TTL（毫秒）
 * @constant {number}
 */
const PLUGIN_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

/**
 * 支持的 Markdown 文件扩展名
 * @constant {string[]}
 */
const SUPPORTED_EXTENSIONS = [".md", ".markdown"];

/**
 * Skill 目录必需文件
 * @constant {string}
 */
const SKILL_MANIFEST_FILE = "skill.md";

/**
 * Frontmatter 必填字段
 * @constant {string[]}
 */
const REQUIRED_FRONTMATTER_FIELDS = ["name"];

/**
 * Frontmatter 可选字段（带默认值）
 * @constant {Object}
 */
const FRONTMATTER_DEFAULTS = {
  version: "1.0.0",
  category: "general",
  tags: [],
  icon: "🤖",
  permissionMode: "default",
  allowedTools: [],
  autoApprovedTools: [],
  resourceScopes: {},
};

/**
 * 插件事件类型（用于审计日志）
 * @readonly
 * @enum {string}
 */
const PluginEventType = {
  IMPORTED: "plugin_imported",
  UPDATED: "plugin_updated",
  DELETED: "plugin_deleted",
  SCAN_COMPLETED: "plugin_scan_completed",
  PARSE_ERROR: "plugin_parse_error",
};

module.exports = {
  PluginType,
  SourceType,
  PLUGIN_DIRECTORIES,
  PLUGINS_BASE_PATH,
  BUILTIN_PLUGINS_PATH,
  PLUGIN_CACHE_TTL,
  SUPPORTED_EXTENSIONS,
  SKILL_MANIFEST_FILE,
  REQUIRED_FRONTMATTER_FIELDS,
  FRONTMATTER_DEFAULTS,
  PluginEventType,
};
