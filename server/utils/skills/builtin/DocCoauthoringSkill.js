const { BaseSkill } = require("../BaseSkill");
const { SkillCategory, SkillStatus, ConfigFieldType } = require("../constants");

/**
 * 文档协作撰写 Skill
 * 基于 Anthropic Skills 规范实现
 * 提供结构化的文档协作创建工作流
 */
class DocCoauthoringSkill extends BaseSkill {
  constructor() {
    super({
      id: "builtin:doc-coauthoring",
      name: "文档协作撰写",
      description:
        "结构化的文档协作工作流，适用于 PRD、技术规格、提案等文档的高效创建",
      version: "1.0.0",
      category: SkillCategory.DOCUMENT,
      tags: ["document", "writing", "collaboration", "prd", "spec", "proposal"],
      icon: "✍️",
      status: SkillStatus.STABLE,
    });
  }

  /**
   * 获取系统提示词
   */
  getSystemPrompt() {
    return `你是专业的文档协作助手，引导用户通过结构化工作流高效创建高质量文档。

## 三阶段工作流

### 第一阶段：上下文收集
**目标**: 缩小用户知识与 AI 理解之间的差距

1. 询问元信息：文档类型、目标受众、期望影响、模板要求
2. 鼓励用户进行信息倾倒（info dump）
3. 根据差距提出 5-10 个澄清问题
4. 支持从 Slack、共享文档等来源获取上下文

**退出条件**: 能够讨论边缘案例和权衡，而不需要解释基础知识

### 第二阶段：细化与结构
**目标**: 逐节构建文档，通过头脑风暴、筛选和迭代细化

对每个章节：
1. 提出该章节应包含什么的澄清问题
2. 头脑风暴 5-20 个可能的要点
3. 用户指示保留/删除/合并哪些
4. 起草该章节
5. 通过精确编辑进行细化

**章节顺序**: 从未知最多的章节开始，摘要章节最后写

### 第三阶段：读者测试
**目标**: 用无上下文的新对话测试文档是否对读者有效

1. 预测读者可能的问题（5-10 个）
2. 用子代理或新对话测试这些问题
3. 检查歧义、假设和矛盾
4. 修复发现的问题

**退出条件**: 读者测试 Claude 能正确回答问题，无新的差距

## 适用场景
- PRD（产品需求文档）
- 技术规格文档
- 设计文档
- 决策文档（RFC）
- 提案和报告`;
  }

  /**
   * 获取工具绑定
   */
  getToolBindings() {
    return [
      {
        toolName: "read-file",
        riskLevel: "safe-read",
        autoApproved: true,
        defaultConfig: {
          supportedFormats: [".md", ".txt", ".docx"],
        },
      },
      {
        toolName: "write-file",
        riskLevel: "execute",
        autoApproved: false,
        defaultConfig: {
          outputFormats: [".md", ".docx"],
        },
      },
    ];
  }

  /**
   * 获取 Flow 模板
   */
  getFlowTemplates() {
    return [
      {
        id: "doc-coauthor-full",
        name: "完整文档协作",
        description: "三阶段完整文档协作流程",
        slashCommand: "/coauthor",
        flowDefinition: {
          name: "文档协作 Flow",
          description: "结构化文档协作工作流",
          steps: [
            {
              id: "context",
              type: "llm",
              roleName: "interviewer",
              description: "第一阶段：上下文收集",
            },
            {
              id: "structure",
              type: "llm",
              roleName: "architect",
              description: "第二阶段：结构设计",
            },
            {
              id: "draft",
              type: "llm",
              roleName: "writer",
              description: "第二阶段：章节起草",
            },
            {
              id: "test",
              type: "llm",
              roleName: "tester",
              description: "第三阶段：读者测试",
            },
          ],
        },
      },
      {
        id: "doc-quick-draft",
        name: "快速起草",
        description: "跳过完整流程，快速起草文档",
        slashCommand: "/quick-draft",
        flowDefinition: {
          name: "快速起草 Flow",
          description: "简化的文档起草流程",
          steps: [
            {
              id: "outline",
              type: "llm",
              roleName: "outliner",
              description: "创建文档大纲",
            },
            {
              id: "draft",
              type: "llm",
              roleName: "writer",
              description: "起草完整文档",
            },
          ],
        },
      },
    ];
  }

  /**
   * 获取配置 Schema
   */
  getConfigSchema() {
    return {
      fields: [
        {
          key: "enableReaderTesting",
          label: "启用读者测试",
          type: ConfigFieldType.BOOLEAN,
          defaultValue: true,
          description: "完成后使用子代理测试文档可读性",
        },
        {
          key: "brainstormCount",
          label: "头脑风暴数量",
          type: ConfigFieldType.NUMBER,
          defaultValue: 10,
          min: 5,
          max: 20,
          description: "每个章节的头脑风暴选项数量",
        },
      ],
    };
  }
}

module.exports = { DocCoauthoringSkill };
