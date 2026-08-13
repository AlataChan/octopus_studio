/**
 * 插件扫描器
 *
 * @description
 * 扫描指定目录下的 Markdown 插件文件，解析元数据并缓存
 *
 * @module server/utils/plugins/PluginScanner
 */

const fs = require("fs");
const path = require("path");
const {
  PluginType,
  PLUGIN_DIRECTORIES,
  PLUGINS_BASE_PATH,
  BUILTIN_PLUGINS_PATH,
  SUPPORTED_EXTENSIONS,
  SKILL_MANIFEST_FILE,
} = require("./constants");
const { parseMarkdownPlugin } = require("./MarkdownParser");
const { pluginCache } = require("./PluginCache");

/**
 * 递归查找所有 Markdown 文件
 * @param {string} dir - 目录路径
 * @param {string[]} [results=[]] - 结果数组
 * @returns {string[]}
 */
function findMarkdownFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findMarkdownFiles(fullPath, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * 查找所有 Skill 目录（包含 skill.md 的目录）
 * @param {string} baseDir - 基础目录
 * @returns {string[]}
 */
function findSkillDirectories(baseDir) {
  const skillDirs = [];
  if (!fs.existsSync(baseDir)) return skillDirs;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillManifest = path.join(baseDir, entry.name, SKILL_MANIFEST_FILE);
      if (fs.existsSync(skillManifest)) {
        skillDirs.push(path.join(baseDir, entry.name));
      }
    }
  }
  return skillDirs;
}

/**
 * 扫描指定类型的插件
 * @param {string} pluginType - 插件类型
 * @param {Object} [options] - 扫描选项
 * @param {boolean} [options.forceRefresh=false] - 强制刷新缓存
 * @param {boolean} [options.includeBuiltin=true] - 包含内置插件
 * @returns {Promise<import('./types').ParsedPluginMetadata[]>}
 */
async function scanPlugins(pluginType, options = {}) {
  const { forceRefresh = false, includeBuiltin = true } = options;
  const results = [];
  const dirName = PLUGIN_DIRECTORIES[`${pluginType}s`];
  if (!dirName) {
    console.warn(`[PluginScanner] Unknown plugin type: ${pluginType}`);
    return results;
  }

  const dirsToScan = [];

  // 自定义插件目录
  const customDir = path.join(PLUGINS_BASE_PATH, dirName);
  if (fs.existsSync(customDir)) {
    dirsToScan.push(customDir);
  }

  // 内置插件目录
  if (includeBuiltin) {
    const builtinDir = path.join(BUILTIN_PLUGINS_PATH, dirName);
    if (fs.existsSync(builtinDir)) {
      dirsToScan.push(builtinDir);
    }
  }

  for (const dir of dirsToScan) {
    let files = [];

    if (pluginType === PluginType.SKILL) {
      // Skill 需要查找目录
      const skillDirs = findSkillDirectories(dir);
      files = skillDirs.map((d) => path.join(d, SKILL_MANIFEST_FILE));
    } else {
      files = findMarkdownFiles(dir);
    }

    for (const filePath of files) {
      // 检查缓存
      if (!forceRefresh && pluginCache.has(filePath)) {
        results.push(pluginCache.get(filePath));
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, "utf8");
        const relativePath = path.relative(
          filePath.startsWith(BUILTIN_PLUGINS_PATH)
            ? BUILTIN_PLUGINS_PATH
            : PLUGINS_BASE_PATH,
          filePath
        );

        const { success, error, metadata } = parseMarkdownPlugin(
          content,
          relativePath,
          pluginType
        );

        if (success && metadata) {
          // 标记是否为内置
          if (filePath.startsWith(BUILTIN_PLUGINS_PATH)) {
            metadata.sourceType = "builtin";
          }
          pluginCache.set(filePath, metadata);
          results.push(metadata);
        } else {
          console.warn(`[PluginScanner] Failed to parse ${filePath}: ${error}`);
        }
      } catch (err) {
        console.error(
          `[PluginScanner] Error reading ${filePath}:`,
          err.message
        );
      }
    }
  }

  console.log(
    `[PluginScanner] Scanned ${results.length} ${pluginType} plugins`
  );
  return results;
}

/**
 * 扫描所有类型的插件
 * @param {Object} [options] - 扫描选项
 * @returns {Promise<{agents: Array, commands: Array, skills: Array}>}
 */
async function scanAllPlugins(options = {}) {
  const [agents, commands, skills] = await Promise.all([
    scanPlugins(PluginType.AGENT, options),
    scanPlugins(PluginType.COMMAND, options),
    scanPlugins(PluginType.SKILL, options),
  ]);

  return { agents, commands, skills };
}

module.exports = {
  findMarkdownFiles,
  findSkillDirectories,
  scanPlugins,
  scanAllPlugins,
};
