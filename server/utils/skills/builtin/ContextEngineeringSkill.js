/**
 * Context Engineering Skill
 *
 * @description
 * 提供上下文工程能力，包括对话摘要、工作记忆管理、知识图谱查询等功能。
 * 实现渐进式披露（Progressive Disclosure）的上下文工具集成。
 *
 * 功能包括：
 * - 锚定摘要生成与管理
 * - 工作记忆（待办任务、关键决策、活跃主题）
 * - 知识图谱检索
 * - 对话历史查看
 * - 结构化输出控制
 *
 * @module server/utils/skills/builtin/ContextEngineeringSkill
 */

const { BaseSkill } = require("../BaseSkill");
const { SkillCategory, ConfigFieldType } = require("../constants");

/**
 * Context Engineering Skill
 * @extends BaseSkill
 */
class ContextEngineeringSkill extends BaseSkill {
  constructor() {
    super({
      id: "builtin:context-engineering",
      name: "上下文工程",
      description:
        "提供智能上下文管理能力，包括对话摘要、工作记忆、知识图谱等功能，帮助 AI 更好地理解和追踪对话上下文",
      version: "1.0.0",
      category: SkillCategory.UTILITY,
      tags: [
        "context",
        "memory",
        "summary",
        "knowledge-graph",
        "working-memory",
      ],
      icon: "🧠",
    });
  }

  /**
   * @override
   */
  getToolBindings() {
    return [
      // Layer 3: 上下文工具
      {
        toolName: "memory",
        riskLevel: "safe-read",
        autoApproved: true,
        description: "检索和存储长期记忆，用于回忆之前的对话内容或保存重要结论",
        defaultConfig: {
          maxResults: 10,
          similarityThreshold: 0.7,
        },
      },
      {
        toolName: "summarize-conversation",
        riskLevel: "safe-read",
        autoApproved: true,
        description:
          "生成当前对话的结构化摘要，包含会话意图、关键决策、待办任务等",
        defaultConfig: {
          maxTokens: 500,
          includeAnchored: true,
        },
      },
      {
        toolName: "chat-history",
        riskLevel: "safe-read",
        autoApproved: true,
        description: "获取指定范围的对话历史记录",
        defaultConfig: {
          maxMessages: 50,
        },
      },
      {
        toolName: "knowledge-graph",
        riskLevel: "safe-read",
        autoApproved: true,
        description: "在知识图谱中搜索相关概念和关系",
        defaultConfig: {
          maxNodes: 50,
          maxDepth: 2,
        },
      },
      // 结构化输出工具
      {
        toolName: "structured-output",
        riskLevel: "safe-read",
        autoApproved: true,
        description: "控制输出格式，生成结构化的 JSON 响应",
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
        id: "context-summary-flow",
        name: "上下文摘要",
        description: "生成当前对话的锚定摘要",
        slashCommand: "/summarize",
        flowDefinition: {
          name: "上下文摘要 Flow",
          description: "分析对话并生成结构化摘要",
          steps: [
            {
              id: "analyze",
              type: "llm",
              roleName: "context_analyzer",
              description: "分析对话上下文",
              config: {
                systemPrompt: `你是一个对话分析专家。请分析当前对话并提取以下信息：
1. 会话意图：用户的主要目标是什么？
2. 关键决策：对话中做出了哪些重要决策？
3. 待办任务：有哪些需要完成的任务？
4. 主要话题：讨论了哪些主要话题？
5. 生成产物：产生了哪些文件或结果？

请以结构化的 JSON 格式返回结果。`,
              },
            },
            {
              id: "format",
              type: "llm",
              roleName: "summary_formatter",
              description: "格式化摘要输出",
              config: {
                systemPrompt:
                  "将分析结果格式化为用户友好的摘要，突出显示关键信息。",
              },
            },
          ],
        },
      },
      {
        id: "knowledge-search-flow",
        name: "知识检索",
        description: "从知识图谱中检索相关信息",
        slashCommand: "/knowledge",
        flowDefinition: {
          name: "知识检索 Flow",
          description: "在知识图谱中搜索并返回相关概念",
          steps: [
            {
              id: "search",
              type: "tool",
              roleName: "knowledge_searcher",
              description: "搜索知识图谱",
              config: {
                toolName: "knowledge-graph",
              },
            },
            {
              id: "explain",
              type: "llm",
              roleName: "knowledge_explainer",
              description: "解释搜索结果",
              config: {
                systemPrompt:
                  "解释知识图谱中的概念和关系，帮助用户理解搜索结果。",
              },
            },
          ],
        },
      },
      {
        id: "memory-recall-flow",
        name: "记忆回顾",
        description: "回顾之前的对话记录和重要信息",
        slashCommand: "/recall",
        flowDefinition: {
          name: "记忆回顾 Flow",
          description: "从长期记忆中检索相关信息",
          steps: [
            {
              id: "search-memory",
              type: "tool",
              roleName: "memory_searcher",
              description: "搜索长期记忆",
              config: {
                toolName: "memory",
              },
            },
            {
              id: "get-history",
              type: "tool",
              roleName: "history_reader",
              description: "获取对话历史",
              config: {
                toolName: "chat-history",
              },
            },
            {
              id: "synthesize",
              type: "llm",
              roleName: "memory_synthesizer",
              description: "综合记忆信息",
              config: {
                systemPrompt:
                  "综合长期记忆和对话历史，提供与用户查询相关的完整上下文。",
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
          key: "autoSummarize",
          label: "自动摘要",
          type: ConfigFieldType.BOOLEAN,
          description: "是否在对话达到一定长度后自动生成摘要",
          defaultValue: true,
        },
        {
          key: "summaryThreshold",
          label: "摘要触发阈值",
          type: ConfigFieldType.NUMBER,
          description: "触发自动摘要的对话轮数",
          defaultValue: 10,
          validation: { min: 5, max: 50 },
        },
        {
          key: "enableKnowledgeGraph",
          label: "启用知识图谱",
          type: ConfigFieldType.BOOLEAN,
          description: "是否启用知识图谱检索功能",
          defaultValue: true,
        },
        {
          key: "memoryRetentionDays",
          label: "记忆保留天数",
          type: ConfigFieldType.NUMBER,
          description: "长期记忆的保留时间（天）",
          defaultValue: 30,
          validation: { min: 1, max: 365 },
        },
        {
          key: "progressiveDisclosure",
          label: "渐进式披露",
          type: ConfigFieldType.SELECT,
          description: "上下文工具的注入策略",
          options: [
            { value: "auto", label: "自动（根据对话长度）" },
            { value: "always", label: "始终注入" },
            { value: "manual", label: "手动触发" },
          ],
          defaultValue: "auto",
        },
        {
          key: "anchoredFields",
          label: "锚定字段",
          type: ConfigFieldType.MULTISELECT,
          description: "摘要中包含的锚定字段",
          options: [
            { value: "session_intent", label: "会话意图" },
            { value: "key_decisions", label: "关键决策" },
            { value: "pending_tasks", label: "待办任务" },
            { value: "active_topics", label: "活跃主题" },
            { value: "artifacts_generated", label: "生成产物" },
          ],
          defaultValue: [
            "session_intent",
            "key_decisions",
            "pending_tasks",
            "active_topics",
            "artifacts_generated",
          ],
        },
      ],
    };
  }

  /**
   * 获取上下文工具的注入配置
   * @param {Object} context - 当前上下文
   * @param {number} context.conversationLength - 对话长度
   * @param {string} context.disclosureMode - 披露模式
   * @returns {Object} 注入配置
   */
  getContextToolsInjection(context) {
    const { conversationLength = 0, disclosureMode = "auto" } = context;

    if (disclosureMode === "always") {
      return {
        inject: true,
        tools: this.getToolBindings().map((t) => t.toolName),
      };
    }

    if (disclosureMode === "manual") {
      return { inject: false, tools: [] };
    }

    // auto 模式：根据对话长度决定
    if (conversationLength > 5) {
      return {
        inject: true,
        tools: [
          "memory",
          "summarize-conversation",
          "chat-history",
          "knowledge-graph",
        ],
      };
    }

    return { inject: false, tools: [] };
  }
}

module.exports = { ContextEngineeringSkill };
