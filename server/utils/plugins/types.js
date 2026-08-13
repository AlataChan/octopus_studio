/**
 * 插件系统类型定义
 *
 * @description
 * 定义 Agent/Command/Skill 插件的元数据结构和相关类型
 *
 * @module server/utils/plugins/types
 */

/**
 * 插件类型
 * @typedef {"agent" | "command" | "skill"} PluginType
 */

/**
 * 插件来源类型
 * @typedef {"builtin" | "markdown" | "remote"} SourceType
 */

/**
 * 插件 Frontmatter 元数据（从 Markdown 解析）
 * @typedef {Object} PluginFrontmatter
 * @property {string} [name] - 插件名称
 * @property {string} [description] - 插件描述
 * @property {string} [version] - 语义化版本
 * @property {string} [author] - 作者
 * @property {string} [category] - 分类
 * @property {string[]} [tags] - 标签数组
 * @property {string} [icon] - 图标（emoji 或 URL）
 * @property {string[]} [tools] - 使用的工具列表
 * @property {string} [permissionMode] - 默认权限模式
 * @property {string[]} [allowedTools] - 允许的工具白名单
 * @property {string[]} [autoApprovedTools] - 自动批准的工具
 * @property {Object} [resourceScopes] - 资源范围配置
 * @property {string} [recommendedModel] - 推荐模型
 * @property {Object} [flowDefinition] - Flow 定义（用于 Command 类型）
 */

/**
 * 解析后的插件元数据
 * @typedef {Object} ParsedPluginMetadata
 * @property {string} id - 生成的唯一 ID（基于路径或内容哈希）
 * @property {string} name - 插件名称
 * @property {string} description - 插件描述
 * @property {PluginType} pluginType - 插件类型
 * @property {SourceType} sourceType - 来源类型
 * @property {string} [version] - 语义化版本
 * @property {string} contentHash - 内容 SHA-256 哈希
 * @property {string} originPath - 源文件路径（相对路径）
 * @property {string} [category] - 分类
 * @property {string[]} [tags] - 标签数组
 * @property {string} [icon] - 图标
 * @property {string} [author] - 作者
 * @property {string} [systemPrompt] - 系统提示词（Markdown 正文）
 * @property {string[]} [tools] - 使用的工具列表
 * @property {string} [defaultPermissionMode] - 默认权限模式
 * @property {string[]} [defaultAllowedTools] - 允许的工具白名单
 * @property {string[]} [defaultAutoApprovedTools] - 自动批准的工具
 * @property {Object} [resourceScopes] - 资源范围配置
 * @property {string} [recommendedModel] - 推荐模型
 * @property {Object} [flowDefinition] - Flow 定义
 * @property {number} fileSize - 文件大小（字节）
 * @property {Date} parsedAt - 解析时间
 */

/**
 * 插件缓存条目
 * @typedef {Object} PluginCacheEntry
 * @property {ParsedPluginMetadata} metadata - 插件元数据
 * @property {number} cachedAt - 缓存时间戳
 * @property {number} ttl - TTL（毫秒）
 */

/**
 * 插件导入结果
 * @typedef {Object} PluginImportResult
 * @property {boolean} success - 是否成功
 * @property {string} [error] - 错误信息
 * @property {ParsedPluginMetadata} [metadata] - 解析的元数据
 * @property {string} [templateId] - 创建的模板 ID
 * @property {boolean} [isUpdate] - 是否为更新操作
 */

/**
 * Skill 目录结构
 * @typedef {Object} SkillDirectoryStructure
 * @property {string} skillMdPath - skill.md 文件路径
 * @property {string} [configPath] - config.json 文件路径（可选）
 * @property {string[]} [templatePaths] - 模板文件路径数组
 */

/**
 * 插件扫描选项
 * @typedef {Object} PluginScanOptions
 * @property {PluginType} [type] - 筛选插件类型
 * @property {boolean} [includeContent] - 是否包含完整内容
 * @property {boolean} [forceRefresh] - 是否强制刷新缓存
 */

module.exports = {
  // 类型定义仅用于 JSDoc，无需导出实际值
};
