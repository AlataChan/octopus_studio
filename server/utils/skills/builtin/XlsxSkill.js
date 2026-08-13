const { BaseSkill } = require("../BaseSkill");
const { SkillCategory, SkillStatus, ConfigFieldType } = require("../constants");

/**
 * Excel 文档处理 Skill
 * 基于 Anthropic Skills 规范实现
 * 支持 Excel 创建、编辑、公式计算和数据分析
 */
class XlsxSkill extends BaseSkill {
  constructor() {
    super({
      id: "builtin:xlsx",
      name: "Excel 表格处理",
      description:
        "创建、编辑和分析 Excel 电子表格，支持公式、格式化和数据可视化",
      version: "1.0.0",
      category: SkillCategory.DOCUMENT,
      tags: ["xlsx", "excel", "spreadsheet", "formulas", "data-analysis"],
      icon: "📊",
      status: SkillStatus.STABLE,
    });
  }

  /**
   * 获取系统提示词
   */
  getSystemPrompt() {
    return `你是 Excel 电子表格处理专家。你可以创建、编辑和分析 Excel 文件（.xlsx）。

## 核心能力
1. **创建新表格** - 使用 openpyxl 或 pandas 创建结构化表格
2. **编辑现有表格** - 修改数据、公式和格式，保留现有样式
3. **公式计算** - 使用 Excel 公式而非硬编码值，确保表格可动态更新
4. **数据分析** - 使用 pandas 进行统计分析和数据处理
5. **格式化** - 应用专业的颜色编码、数字格式和条件格式

## 关键规则
- **零公式错误**: 交付的文件必须没有 #REF!, #DIV/0!, #VALUE!, #N/A, #NAME? 等错误
- **使用公式而非硬编码**: 始终使用 Excel 公式如 =SUM(), =AVERAGE() 而不是 Python 计算后硬编码
- **保留模板**: 编辑现有文件时，严格匹配原有格式和样式
- **公式重算**: 使用 LibreOffice recalc 脚本重新计算公式值

## 颜色编码标准（财务模型）
- 蓝色文字 (0,0,255): 硬编码输入值
- 黑色文字 (0,0,0): 所有公式和计算
- 绿色文字 (0,128,0): 工作表内部链接
- 红色文字 (255,0,0): 外部文件链接
- 黄色背景 (255,255,0): 需要关注的关键假设

## 工具库
- **openpyxl**: 复杂格式、公式和 Excel 特性
- **pandas**: 数据分析和批量操作`;
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
          supportedFormats: [".xlsx", ".xls", ".csv", ".tsv"],
        },
      },
      {
        toolName: "write-file",
        riskLevel: "execute",
        autoApproved: false,
        defaultConfig: {
          outputFormats: [".xlsx", ".csv"],
        },
      },
      {
        toolName: "shell-command",
        riskLevel: "execute",
        autoApproved: false,
        defaultConfig: {
          allowedCommands: ["python", "libreoffice"],
          description: "用于运行 pandas/openpyxl 脚本和公式重算",
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
        id: "xlsx-analyze-data",
        name: "分析表格数据",
        description: "使用 pandas 分析 Excel 数据并生成统计报告",
        slashCommand: "/analyze-xlsx",
        flowDefinition: {
          name: "数据分析 Flow",
          description: "读取 Excel 并进行数据分析",
          steps: [
            {
              id: "read",
              type: "tool",
              roleName: "reader",
              description: "读取 Excel 文件",
              config: { toolName: "read-file" },
            },
            {
              id: "analyze",
              type: "tool",
              roleName: "analyst",
              description: "使用 pandas 进行数据分析",
              config: { toolName: "shell-command" },
            },
          ],
        },
      },
      {
        id: "xlsx-create-model",
        name: "创建财务模型",
        description: "创建带公式的财务模型表格",
        slashCommand: "/create-xlsx",
        flowDefinition: {
          name: "创建表格 Flow",
          description: "使用 openpyxl 创建专业表格",
          steps: [
            {
              id: "create",
              type: "tool",
              roleName: "creator",
              description: "创建 Excel 文件",
              config: { toolName: "shell-command" },
            },
            {
              id: "recalc",
              type: "tool",
              roleName: "calculator",
              description: "重新计算公式",
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
          key: "useFormulas",
          label: "使用公式而非硬编码",
          type: ConfigFieldType.BOOLEAN,
          defaultValue: true,
          description: "始终使用 Excel 公式确保表格可动态更新",
        },
        {
          key: "applyColorCoding",
          label: "应用颜色编码标准",
          type: ConfigFieldType.BOOLEAN,
          defaultValue: true,
          description: "财务模型使用标准颜色编码",
        },
      ],
    };
  }
}

module.exports = { XlsxSkill };
