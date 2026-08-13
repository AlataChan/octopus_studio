/**
 * 文档搜索 Skill
 *
 * @description
 * 提供文档搜索和知识检索能力，支持语义搜索、关键词搜索等功能。
 *
 * @module server/utils/skills/builtin/DocumentSearchSkill
 */

const { BaseSkill } = require("../BaseSkill");
const { SkillCategory, ConfigFieldType } = require("../constants");

/**
 * 文档搜索 Skill
 * @extends BaseSkill
 */
class DocumentSearchSkill extends BaseSkill {
  constructor() {
    super({
      id: "builtin:document-search",
      name: "文档搜索",
      description: "提供文档搜索和知识检索能力，支持语义搜索和关键词搜索",
      version: "1.0.0",
      category: SkillCategory.SEARCH,
      tags: ["search", "document", "rag", "knowledge"],
      icon: "🔍",
    });
  }

  /**
   * @override
   */
  getToolBindings() {
    return [
      {
        toolName: "rag-search",
        riskLevel: "safe-read",
        autoApproved: true,
        defaultConfig: {
          topK: 5,
          minScore: 0.7,
        },
      },
      {
        toolName: "document-reader",
        riskLevel: "safe-read",
        autoApproved: true,
        defaultConfig: {},
      },
      {
        toolName: "web-search",
        riskLevel: "external",
        autoApproved: false,
        defaultConfig: {
          maxResults: 10,
        },
      },
    ];
  }

  /**
   * @override
   */
  getFlowTemplates() {
    return [
      {
        id: "doc-search-flow",
        name: "文档搜索",
        description: "在知识库中搜索相关文档",
        slashCommand: "/search",
        flowDefinition: {
          name: "文档搜索 Flow",
          description: "执行语义搜索并返回相关文档",
          steps: [
            {
              id: "search",
              type: "tool",
              roleName: "searcher",
              description: "执行语义搜索",
              config: {
                toolName: "rag-search",
              },
            },
            {
              id: "summarize",
              type: "llm",
              roleName: "summarizer",
              description: "总结搜索结果",
              config: {
                systemPrompt: "根据搜索结果，提供简洁准确的答案，并引用来源。",
              },
            },
          ],
        },
      },
      {
        id: "research-flow",
        name: "深度研究",
        description: "结合内部知识库和外部搜索进行深度研究",
        slashCommand: "/research",
        flowDefinition: {
          name: "深度研究 Flow",
          description: "多源信息检索和综合分析",
          steps: [
            {
              id: "internal-search",
              type: "tool",
              roleName: "internal_researcher",
              description: "搜索内部知识库",
              config: {
                toolName: "rag-search",
              },
            },
            {
              id: "external-search",
              type: "tool",
              roleName: "external_researcher",
              description: "搜索外部资源",
              config: {
                toolName: "web-search",
              },
            },
            {
              id: "synthesize",
              type: "llm",
              roleName: "synthesizer",
              description: "综合分析所有信息",
              config: {
                systemPrompt: "综合内部和外部信息，提供全面的研究报告。",
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
          key: "topK",
          label: "返回结果数量",
          type: ConfigFieldType.NUMBER,
          description: "每次搜索返回的最大文档数",
          defaultValue: 5,
          validation: { min: 1, max: 20 },
        },
        {
          key: "minScore",
          label: "最低相关度",
          type: ConfigFieldType.NUMBER,
          description: "文档相关度阈值（0-1）",
          defaultValue: 0.7,
          validation: { min: 0, max: 1 },
        },
        {
          key: "enableWebSearch",
          label: "启用网络搜索",
          type: ConfigFieldType.BOOLEAN,
          description: "是否允许搜索外部网络资源",
          defaultValue: false,
        },
        {
          key: "searchScope",
          label: "搜索范围",
          type: ConfigFieldType.SELECT,
          description: "限制搜索的文档范围",
          options: [
            { value: "all", label: "全部文档" },
            { value: "workspace", label: "仅当前 Workspace" },
            { value: "tagged", label: "指定标签" },
          ],
          defaultValue: "workspace",
        },
      ],
    };
  }
}

module.exports = { DocumentSearchSkill };
