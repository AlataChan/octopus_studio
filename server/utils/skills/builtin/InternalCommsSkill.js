const { BaseSkill } = require("../BaseSkill");
const { SkillCategory, SkillStatus, ConfigFieldType } = require("../constants");

/**
 * 企业内部沟通 Skill
 * 基于 Anthropic Skills 规范实现
 * 提供各类企业内部沟通模板和最佳实践
 */
class InternalCommsSkill extends BaseSkill {
  constructor() {
    super({
      id: "builtin:internal-comms",
      name: "企业内部沟通",
      description: "各类企业内部沟通模板：周报、3P 更新、FAQ、事件报告等",
      version: "1.0.0",
      category: SkillCategory.DOCUMENT,
      tags: [
        "communication",
        "report",
        "newsletter",
        "faq",
        "incident",
        "3p-update",
      ],
      icon: "📢",
      status: SkillStatus.STABLE,
    });
  }

  /**
   * 获取系统提示词
   */
  getSystemPrompt() {
    return `你是企业内部沟通专家，帮助撰写各类内部沟通文档。

## 支持的沟通类型

### 3P 更新 (Progress, Plans, Problems)
**用途**: 团队周报、项目进展汇报
**结构**:
- **Progress（进展）**: 本周完成的工作
- **Plans（计划）**: 下周计划
- **Problems（问题）**: 遇到的阻碍和需要帮助的地方

### 公司通讯
**用途**: 全公司范围的定期更新
**要点**: 简洁、积极、信息量大

### FAQ 回答
**用途**: 常见问题的标准回答
**原则**: 清晰、准确、易于理解

### 状态报告
**用途**: 项目或系统状态更新
**包含**: 当前状态、关键指标、风险、下一步

### 事件报告
**用途**: 故障或事件的事后分析
**结构**:
- 摘要
- 影响范围
- 时间线
- 根本原因
- 改进措施

### 领导层更新
**用途**: 向高层汇报
**特点**: 简洁、重点突出、决策导向

## 写作原则
1. **简洁明了**: 避免冗长，直击要点
2. **结构清晰**: 使用标题、列表、分段
3. **受众意识**: 根据读者调整语气和详细程度
4. **可操作性**: 包含明确的行动项和负责人`;
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
          supportedFormats: [".md", ".txt"],
        },
      },
      {
        toolName: "write-file",
        riskLevel: "execute",
        autoApproved: false,
        defaultConfig: {
          outputFormats: [".md", ".txt"],
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
        id: "comms-3p-update",
        name: "3P 周报",
        description: "生成 Progress/Plans/Problems 格式的周报",
        slashCommand: "/3p",
        flowDefinition: {
          name: "3P 更新 Flow",
          description: "生成标准 3P 格式周报",
          steps: [
            {
              id: "gather",
              type: "llm",
              roleName: "interviewer",
              description: "收集本周工作信息",
            },
            {
              id: "format",
              type: "llm",
              roleName: "writer",
              description: "格式化为 3P 结构",
            },
          ],
        },
      },
      {
        id: "comms-incident-report",
        name: "事件报告",
        description: "生成事件事后分析报告",
        slashCommand: "/incident",
        flowDefinition: {
          name: "事件报告 Flow",
          description: "生成结构化事件报告",
          steps: [
            {
              id: "timeline",
              type: "llm",
              roleName: "investigator",
              description: "收集事件时间线",
            },
            {
              id: "analysis",
              type: "llm",
              roleName: "analyst",
              description: "分析根本原因",
            },
            {
              id: "report",
              type: "llm",
              roleName: "writer",
              description: "生成完整报告",
            },
          ],
        },
      },
      {
        id: "comms-faq",
        name: "FAQ 回答",
        description: "生成常见问题的标准回答",
        slashCommand: "/faq",
        flowDefinition: {
          name: "FAQ Flow",
          description: "生成清晰的 FAQ 回答",
          steps: [
            {
              id: "clarify",
              type: "llm",
              roleName: "clarifier",
              description: "理解问题本质",
            },
            {
              id: "answer",
              type: "llm",
              roleName: "writer",
              description: "撰写清晰回答",
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
          key: "defaultFormat",
          label: "默认输出格式",
          type: ConfigFieldType.SELECT,
          defaultValue: "markdown",
          options: [
            { value: "markdown", label: "Markdown" },
            { value: "plaintext", label: "纯文本" },
          ],
        },
        {
          key: "includeDateHeader",
          label: "包含日期标题",
          type: ConfigFieldType.BOOLEAN,
          defaultValue: true,
          description: "自动在文档开头添加日期",
        },
      ],
    };
  }
}

module.exports = { InternalCommsSkill };
