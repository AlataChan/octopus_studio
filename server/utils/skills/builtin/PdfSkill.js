/**
 * PDF 文档处理 Skill
 *
 * @description
 * 提供 PDF 文档的提取、合并、拆分、表单填写等能力。
 * 基于 Anthropic Agent Skills 规范实现。
 *
 * @module server/utils/skills/builtin/PdfSkill
 */

const { BaseSkill } = require("../BaseSkill");
const { SkillCategory, ConfigFieldType } = require("../constants");

/**
 * PDF 文档处理 Skill
 * @extends BaseSkill
 */
class PdfSkill extends BaseSkill {
  constructor() {
    super({
      id: "builtin:pdf",
      name: "PDF 文档处理",
      description: "提取 PDF 文本和表格，合并/拆分文档，填写表单，支持 OCR",
      version: "1.0.0",
      category: SkillCategory.DOCUMENT,
      tags: ["pdf", "document", "extraction", "forms", "ocr"],
      icon: "📄",
    });
  }

  /**
   * 获取系统提示词（从 Anthropic SKILL.md 转换）
   * @returns {string}
   */
  getSystemPrompt() {
    return `你是一个专业的 PDF 文档处理专家。

## 核心能力

### 1. 文本提取
- pypdf: 基础文本提取
- pdfplumber: 保留布局的文本提取，表格提取
- pdftotext: 命令行工具

### 2. 表格提取
\`\`\`python
import pdfplumber
with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
\`\`\`

### 3. 合并/拆分
\`\`\`python
from pypdf import PdfReader, PdfWriter
# 合并
writer = PdfWriter()
for pdf_file in files:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)
\`\`\`

### 4. OCR 扫描件
\`\`\`python
import pytesseract
from pdf2image import convert_from_path
images = convert_from_path('scanned.pdf')
for image in images:
    text = pytesseract.image_to_string(image)
\`\`\`

### 5. 创建 PDF
- reportlab: Python PDF 创建库
- Canvas 和 Platypus 组件

### 6. 表单填写
- pypdf: 基础表单填写
- pdf-lib (JavaScript): 高级表单操作

## 常用命令
- pdftotext: \`pdftotext -layout input.pdf output.txt\`
- qpdf: 合并、拆分、加密
- pdftk: PDF 工具包`;
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
          supportedFormats: [".pdf"],
        },
      },
      {
        toolName: "write-file",
        riskLevel: "execute",
        autoApproved: false,
        defaultConfig: {
          outputFormats: [".pdf", ".txt", ".xlsx"],
        },
      },
      {
        toolName: "shell-command",
        riskLevel: "execute",
        autoApproved: false,
        defaultConfig: {
          allowedCommands: ["python", "pdftotext", "qpdf", "pdftk"],
        },
      },
      {
        toolName: "ocr-process",
        riskLevel: "safe-read",
        autoApproved: true,
        defaultConfig: {
          engine: "auto",
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
        id: "pdf-extract-text",
        name: "提取 PDF 内容",
        description: "从 PDF 中提取文本和表格",
        slashCommand: "/extract-pdf",
        flowDefinition: {
          name: "PDF 内容提取 Flow",
          description: "使用 pdfplumber 提取 PDF 内容",
          steps: [
            {
              id: "extract",
              type: "llm",
              roleName: "extractor",
              description: "生成提取脚本并执行",
              config: {
                systemPrompt: "生成 Python 脚本使用 pdfplumber 提取 PDF 内容。",
              },
            },
            {
              id: "format",
              type: "llm",
              roleName: "formatter",
              description: "格式化提取结果",
              config: {
                systemPrompt: "将提取的内容格式化为结构化输出。",
              },
            },
          ],
        },
      },
      {
        id: "pdf-merge",
        name: "合并 PDF",
        description: "将多个 PDF 文件合并为一个",
        slashCommand: "/merge-pdf",
        flowDefinition: {
          name: "PDF 合并 Flow",
          description: "使用 pypdf 合并多个 PDF",
          steps: [
            {
              id: "merge",
              type: "llm",
              roleName: "merger",
              description: "生成合并脚本并执行",
              config: {
                systemPrompt: "生成使用 pypdf 合并 PDF 的 Python 脚本。",
              },
            },
          ],
        },
      },
      {
        id: "pdf-ocr",
        name: "OCR 扫描件",
        description: "对扫描的 PDF 进行 OCR 识别",
        slashCommand: "/ocr-pdf",
        flowDefinition: {
          name: "PDF OCR Flow",
          description: "使用 OCR 识别扫描 PDF 中的文字",
          steps: [
            {
              id: "convert",
              type: "tool",
              roleName: "converter",
              description: "将 PDF 转换为图像",
              config: {
                toolName: "shell-command",
              },
            },
            {
              id: "ocr",
              type: "tool",
              roleName: "ocr_processor",
              description: "执行 OCR 识别",
              config: {
                toolName: "ocr-process",
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
          key: "ocrEngine",
          label: "OCR 引擎",
          type: ConfigFieldType.SELECT,
          description: "扫描 PDF 使用的 OCR 引擎",
          options: [
            { value: "auto", label: "自动选择" },
            { value: "tesseract", label: "Tesseract" },
            { value: "paddleocr", label: "PaddleOCR" },
          ],
          defaultValue: "auto",
        },
        {
          key: "extractTables",
          label: "提取表格",
          type: ConfigFieldType.BOOLEAN,
          description: "是否自动提取 PDF 中的表格",
          defaultValue: true,
        },
        {
          key: "preserveLayout",
          label: "保留布局",
          type: ConfigFieldType.BOOLEAN,
          description: "提取文本时是否保留原始布局",
          defaultValue: true,
        },
      ],
    };
  }
}

module.exports = { PdfSkill };
