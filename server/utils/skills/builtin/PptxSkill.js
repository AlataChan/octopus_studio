const { BaseSkill } = require("../BaseSkill");
const { SkillCategory, SkillStatus, ConfigFieldType } = require("../constants");

/**
 * PowerPoint 文档处理 Skill
 * 基于 Anthropic Skills 规范实现
 * 支持 PPT 创建、编辑、模板替换
 */
class PptxSkill extends BaseSkill {
  constructor() {
    super({
      id: "builtin:pptx",
      name: "PPT 演示文稿处理",
      description: "创建、编辑和分析 PowerPoint 演示文稿，支持模板、布局和设计",
      version: "1.0.0",
      category: SkillCategory.DOCUMENT,
      tags: ["pptx", "powerpoint", "presentation", "slides", "design"],
      icon: "📽️",
      status: SkillStatus.STABLE,
    });
  }

  /**
   * 获取系统提示词
   */
  getSystemPrompt() {
    return `你是 PowerPoint 演示文稿处理专家。你可以创建、编辑和分析 PPT 文件（.pptx）。

## 核心能力
1. **创建演示文稿** - 使用 html2pptx 或 PptxGenJS 从零创建专业 PPT
2. **编辑现有 PPT** - 解包 OOXML，编辑 XML，重新打包
3. **使用模板** - 基于现有模板创建新演示文稿
4. **文本提取** - 使用 markitdown 提取 PPT 文本内容
5. **缩略图生成** - 创建幻灯片预览图进行视觉检查

## 设计原则
- **内容驱动设计**: 先分析内容，再选择合适的配色和布局
- **Web 安全字体**: Arial, Helvetica, Times New Roman, Georgia, Verdana
- **视觉层次**: 通过字号、字重和颜色创建清晰层次
- **一致性**: 在所有幻灯片中保持一致的视觉语言

## 工作流程
### 从零创建:
1. 阅读 html2pptx.md 规范
2. 为每张幻灯片创建 HTML 文件
3. 使用 html2pptx.js 转换为 PPTX
4. 生成缩略图验证布局

### 编辑现有文件:
1. 使用 unpack.py 解包 PPTX
2. 编辑 ppt/slides/slide{N}.xml
3. 使用 validate.py 验证
4. 使用 pack.py 重新打包

### 使用模板:
1. 提取模板文本和缩略图
2. 创建模板清单
3. 使用 rearrange.py 复制/重排幻灯片
4. 使用 replace.py 替换文本`;
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
          supportedFormats: [".pptx", ".ppt"],
        },
      },
      {
        toolName: "write-file",
        riskLevel: "execute",
        autoApproved: false,
        defaultConfig: {
          outputFormats: [".pptx", ".html"],
        },
      },
      {
        toolName: "shell-command",
        riskLevel: "execute",
        autoApproved: false,
        defaultConfig: {
          allowedCommands: ["python", "node", "soffice", "pdftoppm"],
          description: "用于运行 OOXML 脚本和转换工具",
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
        id: "pptx-create-presentation",
        name: "创建演示文稿",
        description: "从零创建专业 PPT 演示文稿",
        slashCommand: "/create-pptx",
        flowDefinition: {
          name: "创建 PPT Flow",
          description: "使用 html2pptx 创建演示文稿",
          steps: [
            {
              id: "design",
              type: "llm",
              roleName: "designer",
              description: "设计配色和布局方案",
            },
            {
              id: "create-html",
              type: "tool",
              roleName: "creator",
              description: "创建 HTML 幻灯片",
              config: { toolName: "write-file" },
            },
            {
              id: "convert",
              type: "tool",
              roleName: "converter",
              description: "转换为 PPTX",
              config: { toolName: "shell-command" },
            },
          ],
        },
      },
      {
        id: "pptx-edit-existing",
        name: "编辑现有 PPT",
        description: "编辑现有 PowerPoint 文件",
        slashCommand: "/edit-pptx",
        flowDefinition: {
          name: "编辑 PPT Flow",
          description: "解包、编辑、重新打包 PPTX",
          steps: [
            {
              id: "unpack",
              type: "tool",
              roleName: "extractor",
              description: "解包 PPTX 文件",
              config: { toolName: "shell-command" },
            },
            {
              id: "edit",
              type: "tool",
              roleName: "editor",
              description: "编辑 XML 内容",
              config: { toolName: "write-file" },
            },
            {
              id: "pack",
              type: "tool",
              roleName: "packager",
              description: "重新打包 PPTX",
              config: { toolName: "shell-command" },
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
          key: "defaultAspectRatio",
          label: "默认宽高比",
          type: ConfigFieldType.SELECT,
          defaultValue: "16:9",
          options: [
            { value: "16:9", label: "16:9 宽屏" },
            { value: "4:3", label: "4:3 标准" },
          ],
        },
        {
          key: "generateThumbnails",
          label: "生成缩略图预览",
          type: ConfigFieldType.BOOLEAN,
          defaultValue: true,
          description: "创建后自动生成幻灯片缩略图进行验证",
        },
      ],
    };
  }
}

module.exports = { PptxSkill };
