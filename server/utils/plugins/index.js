/**
 * 插件系统入口
 *
 * @description
 * 提供 Markdown 插件的解析、扫描、缓存和导入功能。
 * 支持 Agent、Command、Skill 三种插件类型。
 *
 * 使用示例：
 * ```javascript
 * const { scanAllPlugins, importFromMarkdown, pluginCache } = require('./utils/plugins');
 *
 * // 扫描所有插件
 * const { agents, commands, skills } = await scanAllPlugins();
 *
 * // 从 Markdown 导入插件
 * const result = await importFromMarkdown(content, 'path/to/agent.md', 'agent');
 *
 * // 获取缓存统计
 * const stats = pluginCache.getStats();
 * ```
 *
 * @module server/utils/plugins
 */

const {
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
} = require("./constants");

const {
  parseFrontmatter,
  generateContentHash,
  parseNameFromFilename,
  generatePluginId,
  parseMarkdownPlugin,
} = require("./MarkdownParser");

const { PluginCache, pluginCache } = require("./PluginCache");

const {
  findMarkdownFiles,
  findSkillDirectories,
  scanPlugins,
  scanAllPlugins,
} = require("./PluginScanner");

const {
  findExistingTemplate,
  importPlugin,
  importFromMarkdown,
  batchImport,
} = require("./PluginImporter");

module.exports = {
  // 常量
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

  // 解析器
  parseFrontmatter,
  generateContentHash,
  parseNameFromFilename,
  generatePluginId,
  parseMarkdownPlugin,

  // 缓存
  PluginCache,
  pluginCache,

  // 扫描器
  findMarkdownFiles,
  findSkillDirectories,
  scanPlugins,
  scanAllPlugins,

  // 导入器
  findExistingTemplate,
  importPlugin,
  importFromMarkdown,
  batchImport,
};
