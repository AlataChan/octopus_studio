/**
 * Word 文档处理 Skill
 *
 * @description
 * 提供 Word 文档 (.docx) 的创建、编辑、追踪修订和内容提取能力。
 * 基于 Anthropic Agent Skills 规范实现。
 *
 * @module server/utils/skills/builtin/DocxSkill
 */

const { BaseSkill } = require("../BaseSkill");
const { SkillCategory, ConfigFieldType } = require("../constants");

/**
 * Word 文档处理 Skill
 * @extends BaseSkill
 */
class DocxSkill extends BaseSkill {
  constructor() {
    super({
      id: "builtin:docx",
      name: "Word 文档处理",
      description: "创建、编辑和分析 Word 文档，支持追踪修订、批注和格式保留",
      version: "1.0.0",
      category: SkillCategory.DOCUMENT,
      tags: ["docx", "word", "document", "editing", "tracked-changes"],
      icon: "📝",
    });
  }

  /**
   * 获取系统提示词（从 Anthropic SKILL.md 转换）
   * @returns {string}
   */
  getSystemPrompt() {
    return `你是一个专业的 Word 文档处理专家。

## 核心能力

### 1. 读取/分析文档
- 使用 pandoc 提取文本：\`pandoc --track-changes=all file.docx -o output.md\`
- 使用 unpack.py 解压获取原始 XML 结构

### 2. 创建新文档
- 使用 docx-js (JavaScript) 创建文档
- 使用 Document, Paragraph, TextRun 等组件
- 使用 Packer.toBuffer() 导出 .docx

### 3. 编辑现有文档
- 解压文档：\`python ooxml/scripts/unpack.py <file.docx> <dir>\`
- 编辑 XML 内容
- 重新打包：\`python ooxml/scripts/pack.py <dir> <file.docx>\`

### 4. 追踪修订（Redlining）
- 使用 <w:ins> 标记插入内容
- 使用 <w:del> 标记删除内容
- 保留原始 RSID 以维护文档完整性

## 工作流程

当用户要求处理 Word 文档时：
1. 首先确定任务类型（读取/创建/编辑）
2. 选择合适的工具和方法
3. 执行操作并验证结果
4. 对于编辑操作，始终使用追踪修订模式`;
  }

  /**
   * @override
   */
  getToolBindings() {
    return [
      {
        toolName: "read-file",
        riskLevel: "safe-read",
        autoApproved: true,
        defaultConfig: {
          supportedFormats: [".docx", ".doc"],
        },
      },
      {
        toolName: "write-file",
        riskLevel: "execute",
        autoApproved: false,
        defaultConfig: {
          outputFormats: [".docx"],
        },
      },
      {
        toolName: "shell-command",
        riskLevel: "execute",
        autoApproved: false,
        defaultConfig: {
          allowedCommands: ["pandoc", "python", "node"],
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
        id: "docx-extract-text",
        name: "提取文档内容",
        description: "从 Word 文档中提取文本和结构",
        slashCommand: "/extract-docx",
        flowDefinition: {
          name: "文档内容提取 Flow",
          description: "使用 pandoc 提取 Word 文档内容",
          steps: [
            {
              id: "extract",
              type: "tool",
              roleName: "extractor",
              description: "使用 pandoc 转换文档为 Markdown",
              config: {
                toolName: "shell-command",
                command:
                  "pandoc --track-changes=all {{input_file}} -o {{output_file}}",
              },
            },
            {
              id: "analyze",
              type: "llm",
              roleName: "analyzer",
              description: "分析提取的内容",
              config: {
                systemPrompt: "分析文档结构和内容，提供摘要。",
              },
            },
          ],
        },
      },
      {
        id: "docx-create",
        name: "创建文档",
        description: "根据用户需求创建新的 Word 文档",
        slashCommand: "/create-docx",
        flowDefinition: {
          name: "文档创建 Flow",
          description: "使用 docx-js 创建新文档",
          steps: [
            {
              id: "plan",
              type: "llm",
              roleName: "planner",
              description: "规划文档结构",
              config: {
                systemPrompt: "根据用户需求规划文档结构和内容大纲。",
              },
            },
            {
              id: "generate",
              type: "llm",
              roleName: "generator",
              description: "生成 docx-js 代码",
              config: {
                systemPrompt: "生成使用 docx-js 创建文档的 JavaScript 代码。",
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
          key: "trackChanges",
          label: "启用追踪修订",
          type: ConfigFieldType.BOOLEAN,
          description: "编辑文档时是否启用追踪修订模式",
          defaultValue: true,
        },
        {
          key: "preserveFormatting",
          label: "保留原格式",
          type: ConfigFieldType.BOOLEAN,
          description: "编辑时是否保留原始文档格式",
          defaultValue: true,
        },
      ],
    };
  }
}

module.exports = { DocxSkill };
