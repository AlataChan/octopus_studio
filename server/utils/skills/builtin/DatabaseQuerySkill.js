/**
 * 数据库查询 Skill
 *
 * @description
 * 提供数据库查询能力，支持 SQL 查询、表结构探索等功能。
 * 这是一个示例 Skill 实现，展示如何创建自定义 Skill。
 *
 * @module server/utils/skills/builtin/DatabaseQuerySkill
 */

const { BaseSkill } = require("../BaseSkill");
const { SkillCategory, ConfigFieldType } = require("../constants");

/**
 * 数据库查询 Skill
 * @extends BaseSkill
 */
class DatabaseQuerySkill extends BaseSkill {
  constructor() {
    super({
      id: "builtin:database-query",
      name: "数据库查询",
      description:
        "提供 SQL 数据库查询能力，支持查询执行、表结构探索和数据分析",
      version: "1.0.0",
      category: SkillCategory.DATABASE,
      tags: ["sql", "database", "query", "analysis"],
      icon: "🗄️",
    });
  }

  /**
   * @override
   */
  getToolBindings() {
    return [
      {
        toolName: "sql-agent",
        riskLevel: "execute",
        autoApproved: false,
        defaultConfig: {
          maxRows: 1000,
          timeout: 30000,
        },
      },
      {
        toolName: "database-schema",
        riskLevel: "safe-read",
        autoApproved: true,
        defaultConfig: {},
      },
    ];
  }

  /**
   * @override
   */
  getFlowTemplates() {
    return [
      {
        id: "db-query-flow",
        name: "数据库查询",
        description: "执行 SQL 查询并返回结果",
        slashCommand: "/query-db",
        flowDefinition: {
          name: "数据库查询 Flow",
          description: "执行用户的数据库查询请求",
          steps: [
            {
              id: "analyze",
              type: "llm",
              roleName: "query_analyzer",
              description: "分析用户查询意图",
              config: {
                systemPrompt:
                  "你是一个 SQL 专家，分析用户的查询需求并生成安全的 SQL 语句。",
              },
            },
            {
              id: "execute",
              type: "tool",
              roleName: "query_executor",
              description: "执行 SQL 查询",
              config: {
                toolName: "sql-agent",
              },
            },
            {
              id: "format",
              type: "llm",
              roleName: "result_formatter",
              description: "格式化查询结果",
              config: {
                systemPrompt: "将查询结果格式化为用户友好的表格或摘要。",
              },
            },
          ],
        },
      },
      {
        id: "db-explore-flow",
        name: "数据库探索",
        description: "探索数据库结构和表信息",
        slashCommand: "/explore-db",
        flowDefinition: {
          name: "数据库探索 Flow",
          description: "帮助用户了解数据库结构",
          steps: [
            {
              id: "get-schema",
              type: "tool",
              roleName: "schema_reader",
              description: "获取数据库 Schema",
              config: {
                toolName: "database-schema",
              },
            },
            {
              id: "explain",
              type: "llm",
              roleName: "schema_explainer",
              description: "解释数据库结构",
              config: {
                systemPrompt: "解释数据库表结构，包括表之间的关系和字段含义。",
              },
            },
          ],
        },
      },
    ];
  }

  /**
   * @override
   */
  getConfigSchema() {
    return {
      version: "1.0",
      fields: [
        {
          key: "connectionString",
          label: "数据库连接字符串",
          type: ConfigFieldType.PASSWORD,
          description:
            "数据库连接 URL（如 postgresql://user:pass@host:5432/db）",
          required: true,
        },
        {
          key: "maxRows",
          label: "最大返回行数",
          type: ConfigFieldType.NUMBER,
          description: "单次查询返回的最大行数",
          defaultValue: 1000,
          validation: { min: 1, max: 10000 },
        },
        {
          key: "readOnly",
          label: "只读模式",
          type: ConfigFieldType.BOOLEAN,
          description: "是否只允许 SELECT 查询",
          defaultValue: true,
        },
        {
          key: "allowedTables",
          label: "允许访问的表",
          type: ConfigFieldType.MULTISELECT,
          description: "限制可查询的表（留空表示全部）",
          options: [], // 动态填充
          defaultValue: [],
        },
      ],
    };
  }
}

module.exports = { DatabaseQuerySkill };
