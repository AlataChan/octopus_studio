/**
 * Markdown 插件解析器
 *
 * @description
 * 解析 Markdown 文件的 frontmatter 元数据和正文内容，
 * 计算 contentHash 用于版本校验
 *
 * @module server/utils/plugins/MarkdownParser
 */

const crypto = require("crypto");
const yaml = require("js-yaml");
const {
  REQUIRED_FRONTMATTER_FIELDS,
  FRONTMATTER_DEFAULTS,
  SourceType,
} = require("./constants");

/**
 * 解析 YAML frontmatter
 * 使用 js-yaml 库支持完整的 YAML 语法（包括嵌套对象）
 * @param {string} content - Markdown 内容
 * @returns {{data: Object, content: string}}
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { data: {}, content: content.trim() };
  }

  const yamlContent = match[1];
  const bodyContent = match[2].trim();

  try {
    const data = yaml.load(yamlContent) || {};
    return { data, content: bodyContent };
  } catch (error) {
    console.warn(`[MarkdownParser] YAML 解析警告: ${error.message}`);
    return { data: {}, content: bodyContent };
  }
}

/**
 * 计算内容的 SHA-256 哈希
 * @param {string} content - 内容
 * @returns {string} 哈希值（hex）
 */
function generateContentHash(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * 从文件名推断插件名称
 * @param {string} filename - 文件名
 * @returns {string}
 */
function parseNameFromFilename(filename) {
  return filename
    .replace(/\.(md|markdown)$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * 生成插件 ID
 * @param {string} originPath - 源文件路径
 * @param {string} contentHash - 内容哈希
 * @returns {string}
 */
function generatePluginId(originPath, contentHash) {
  const pathHash = crypto
    .createHash("md5")
    .update(originPath)
    .digest("hex")
    .slice(0, 8);
  return `md-${pathHash}-${contentHash.slice(0, 8)}`;
}

/**
 * 解析 Markdown 插件文件
 * @param {string} content - 文件内容
 * @param {string} filePath - 文件路径
 * @param {import('./types').PluginType} pluginType - 插件类型
 * @returns {{success: boolean, error?: string, metadata?: import('./types').ParsedPluginMetadata}}
 */
function parseMarkdownPlugin(content, filePath, pluginType) {
  try {
    const { data: frontmatter, content: bodyContent } =
      parseFrontmatter(content);

    // 验证必填字段
    for (const field of REQUIRED_FRONTMATTER_FIELDS) {
      if (!frontmatter[field]) {
        // 如果没有 name，尝试从文件名推断
        if (field === "name") {
          const filename =
            filePath.split("/").pop() ||
            filePath.split("\\").pop() ||
            "unknown";
          frontmatter.name = parseNameFromFilename(filename);
        } else {
          return { success: false, error: `缺少必填字段: ${field}` };
        }
      }
    }

    const contentHash = generateContentHash(content);
    const pluginId = generatePluginId(filePath, contentHash);

    /** @type {import('./types').ParsedPluginMetadata} */
    const metadata = {
      id: pluginId,
      name: frontmatter.name,
      description: frontmatter.description || "",
      pluginType,
      sourceType: SourceType.MARKDOWN,
      version: frontmatter.version || FRONTMATTER_DEFAULTS.version,
      contentHash,
      originPath: filePath,
      category: frontmatter.category || FRONTMATTER_DEFAULTS.category,
      tags: frontmatter.tags || FRONTMATTER_DEFAULTS.tags,
      icon: frontmatter.icon || FRONTMATTER_DEFAULTS.icon,
      author: frontmatter.author,
      systemPrompt: bodyContent,
      tools: frontmatter.tools || [],
      defaultPermissionMode:
        frontmatter.permissionMode || FRONTMATTER_DEFAULTS.permissionMode,
      defaultAllowedTools:
        frontmatter.allowedTools || FRONTMATTER_DEFAULTS.allowedTools,
      defaultAutoApprovedTools:
        frontmatter.autoApprovedTools || FRONTMATTER_DEFAULTS.autoApprovedTools,
      resourceScopes:
        frontmatter.resourceScopes || FRONTMATTER_DEFAULTS.resourceScopes,
      recommendedModel: frontmatter.recommendedModel,
      flowDefinition: frontmatter.flowDefinition,
      fileSize: Buffer.byteLength(content, "utf8"),
      parsedAt: new Date(),
    };

    return { success: true, metadata };
  } catch (error) {
    return { success: false, error: `解析失败: ${error.message}` };
  }
}

module.exports = {
  parseFrontmatter,
  generateContentHash,
  parseNameFromFilename,
  generatePluginId,
  parseMarkdownPlugin,
};
