/**
 * 插件导入器
 *
 * @description
 * 将解析的插件元数据导入到数据库（assistant_templates 表）
 * 支持新建、更新、校验版本和 contentHash
 *
 * @module server/utils/plugins/PluginImporter
 */

const prisma = require("../prisma");
const { PluginEventType, SourceType } = require("./constants");
const {
  parseMarkdownPlugin,
  generateContentHash,
} = require("./MarkdownParser");
const { pluginCache } = require("./PluginCache");

/**
 * 根据 contentHash 或 originPath 查找现有模板
 * @param {string} contentHash - 内容哈希
 * @param {string} originPath - 源文件路径
 * @returns {Promise<Object|null>}
 */
async function findExistingTemplate(contentHash, originPath) {
  // 先按 contentHash 查找
  let existing = await prisma.assistant_templates.findFirst({
    where: { contentHash },
  });

  if (!existing && originPath) {
    // 再按 originPath 查找
    existing = await prisma.assistant_templates.findFirst({
      where: { originPath },
    });
  }

  return existing;
}

/**
 * 导入插件到数据库
 * @param {import('./types').ParsedPluginMetadata} metadata - 解析的元数据
 * @param {Object} [options] - 导入选项
 * @param {boolean} [options.forceUpdate=false] - 强制更新已存在的模板
 * @param {number} [options.userId] - 操作用户 ID
 * @returns {Promise<import('./types').PluginImportResult>}
 */
async function importPlugin(metadata, options = {}) {
  const { forceUpdate = false, userId } = options;

  try {
    // 检查是否已存在
    const existing = await findExistingTemplate(
      metadata.contentHash,
      metadata.originPath
    );

    if (existing) {
      // contentHash 相同，无需更新
      if (existing.contentHash === metadata.contentHash && !forceUpdate) {
        return {
          success: true,
          templateId: existing.id,
          isUpdate: false,
          metadata,
        };
      }

      // 需要更新
      const updated = await prisma.assistant_templates.update({
        where: { id: existing.id },
        data: {
          name: metadata.name,
          description: metadata.description,
          version: metadata.version,
          contentHash: metadata.contentHash,
          originPath: metadata.originPath,
          category: metadata.category,
          tags: metadata.tags,
          icon: metadata.icon,
          systemPrompt: metadata.systemPrompt,
          defaultTools: metadata.tools ? JSON.stringify(metadata.tools) : null,
          defaultPermissionMode: metadata.defaultPermissionMode,
          defaultAllowedTools: metadata.defaultAllowedTools
            ? JSON.stringify(metadata.defaultAllowedTools)
            : null,
          defaultAutoApprovedTools: metadata.defaultAutoApprovedTools
            ? JSON.stringify(metadata.defaultAutoApprovedTools)
            : null,
          resourceScopes: metadata.resourceScopes
            ? JSON.stringify(metadata.resourceScopes)
            : null,
          recommendedModel: metadata.recommendedModel,
          pluginType: metadata.pluginType,
          sourceType: metadata.sourceType,
          updatedAt: new Date(),
        },
      });

      console.log(
        `[PluginImporter] Updated template: ${updated.id} (${metadata.name})`
      );
      return {
        success: true,
        templateId: updated.id,
        isUpdate: true,
        metadata,
      };
    }

    // 创建新模板
    const created = await prisma.assistant_templates.create({
      data: {
        name: metadata.name,
        description: metadata.description,
        version: metadata.version,
        contentHash: metadata.contentHash,
        originPath: metadata.originPath,
        category: metadata.category,
        tags: metadata.tags,
        icon: metadata.icon,
        systemPrompt: metadata.systemPrompt,
        defaultTools: metadata.tools ? JSON.stringify(metadata.tools) : null,
        defaultPermissionMode: metadata.defaultPermissionMode,
        defaultAllowedTools: metadata.defaultAllowedTools
          ? JSON.stringify(metadata.defaultAllowedTools)
          : null,
        defaultAutoApprovedTools: metadata.defaultAutoApprovedTools
          ? JSON.stringify(metadata.defaultAutoApprovedTools)
          : null,
        resourceScopes: metadata.resourceScopes
          ? JSON.stringify(metadata.resourceScopes)
          : null,
        recommendedModel: metadata.recommendedModel,
        pluginType: metadata.pluginType,
        sourceType: metadata.sourceType,
        isGlobal: true,
      },
    });

    console.log(
      `[PluginImporter] Created template: ${created.id} (${metadata.name})`
    );
    return {
      success: true,
      templateId: created.id,
      isUpdate: false,
      metadata,
    };
  } catch (error) {
    console.error(
      `[PluginImporter] Import failed for ${metadata.name}:`,
      error.message
    );
    return {
      success: false,
      error: error.message,
      metadata,
    };
  }
}

/**
 * 从 Markdown 内容导入插件
 * @param {string} content - Markdown 内容
 * @param {string} filePath - 文件路径
 * @param {string} pluginType - 插件类型
 * @param {Object} [options] - 导入选项
 * @returns {Promise<import('./types').PluginImportResult>}
 */
async function importFromMarkdown(content, filePath, pluginType, options = {}) {
  const { success, error, metadata } = parseMarkdownPlugin(
    content,
    filePath,
    pluginType
  );

  if (!success || !metadata) {
    return { success: false, error: error || "解析失败" };
  }

  return importPlugin(metadata, options);
}

/**
 * 批量导入插件
 * @param {import('./types').ParsedPluginMetadata[]} metadataList - 元数据列表
 * @param {Object} [options] - 导入选项
 * @returns {Promise<{imported: number, updated: number, failed: number, results: Array}>}
 */
async function batchImport(metadataList, options = {}) {
  let imported = 0;
  let updated = 0;
  let failed = 0;
  const results = [];

  for (const metadata of metadataList) {
    const result = await importPlugin(metadata, options);
    results.push(result);

    if (result.success) {
      if (result.isUpdate) updated++;
      else imported++;
    } else {
      failed++;
    }
  }

  console.log(
    `[PluginImporter] Batch import complete: ${imported} new, ${updated} updated, ${failed} failed`
  );
  return { imported, updated, failed, results };
}

module.exports = {
  findExistingTemplate,
  importPlugin,
  importFromMarkdown,
  batchImport,
};
