/**
 * Skill 类型定义
 *
 * @description
 * Skill 是一个"能力包"，包含：
 * - 绑定一组 MCP servers / Tools
 * - 提供若干 Flow 模板
 * - 附带配置 Schema（用于生成前端配置表单）
 *
 * @module server/utils/skills/types
 */

/**
 * Skill 配置 Schema 字段类型
 * @typedef {"string" | "number" | "boolean" | "select" | "multiselect" | "json"} ConfigFieldType
 */

/**
 * Skill 配置 Schema 字段定义
 * @typedef {Object} ConfigField
 * @property {string} key - 字段键名
 * @property {string} label - 显示标签
 * @property {ConfigFieldType} type - 字段类型
 * @property {string} [description] - 字段描述
 * @property {*} [defaultValue] - 默认值
 * @property {boolean} [required] - 是否必填
 * @property {Array<{value: string, label: string}>} [options] - 选项列表（用于 select/multiselect）
 * @property {Object} [validation] - 验证规则
 * @property {number} [validation.min] - 最小值（number 类型）
 * @property {number} [validation.max] - 最大值（number 类型）
 * @property {string} [validation.pattern] - 正则表达式（string 类型）
 */

/**
 * Skill 配置 Schema
 * @typedef {Object} ConfigSchema
 * @property {string} version - Schema 版本
 * @property {ConfigField[]} fields - 字段定义数组
 */

/**
 * Skill 元数据
 * @typedef {Object} SkillMetadata
 * @property {string} id - Skill 唯一标识
 * @property {string} name - Skill 名称
 * @property {string} description - Skill 描述
 * @property {string} version - Skill 版本
 * @property {string} category - 分类（如 "database", "search", "api"）
 * @property {string[]} tags - 标签数组
 * @property {string} [icon] - 图标 URL 或 emoji
 * @property {string} [author] - 作者
 */

/**
 * Skill 工具绑定
 * @typedef {Object} ToolBinding
 * @property {string} toolName - 工具名称
 * @property {string} [riskLevel] - 风险级别覆盖
 * @property {boolean} [autoApproved] - 是否自动批准
 * @property {Object} [defaultConfig] - 默认配置
 */

/**
 * Skill MCP 服务器绑定
 * @typedef {Object} MCPBinding
 * @property {string} serverId - MCP 服务器 ID
 * @property {string[]} [enabledTools] - 启用的工具列表（空表示全部）
 * @property {Object} [config] - 服务器配置覆盖
 */

/**
 * Skill Flow 模板
 * @typedef {Object} FlowTemplate
 * @property {string} id - Flow 模板 ID
 * @property {string} name - Flow 名称
 * @property {string} description - Flow 描述
 * @property {string} [slashCommand] - 关联的 Slash 命令（如 "/query-db"）
 * @property {Object} flowDefinition - Flow 定义（与 AgentFlows 兼容）
 */

/**
 * Skill 完整定义
 * @typedef {Object} SkillDefinition
 * @property {SkillMetadata} metadata - 元数据
 * @property {ToolBinding[]} tools - 工具绑定
 * @property {MCPBinding[]} mcpServers - MCP 服务器绑定
 * @property {FlowTemplate[]} flowTemplates - Flow 模板
 * @property {ConfigSchema} configSchema - 配置 Schema
 * @property {Object} [defaultConfig] - 默认配置值
 */

/**
 * Skill 安装记录
 * @typedef {Object} SkillInstallation
 * @property {string} skillId - Skill ID
 * @property {number} workspaceId - Workspace ID
 * @property {string} [assistantInstanceId] - 关联的助手实例 ID
 * @property {Object} config - 用户配置
 * @property {boolean} enabled - 是否启用
 * @property {Date} installedAt - 安装时间
 * @property {Date} updatedAt - 更新时间
 */

/**
 * Skill 执行上下文
 * @typedef {Object} SkillContext
 * @property {number} workspaceId - Workspace ID
 * @property {string} [assistantInstanceId] - 助手实例 ID
 * @property {Object} config - 用户配置
 * @property {Object} [blackboard] - 共享上下文（用于多步骤执行）
 * @property {Object} [user] - 当前用户信息
 */

module.exports = {
  // 类型定义仅用于 JSDoc，无需导出实际值
};
