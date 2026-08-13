/**
 * DOCX Generator Plugin
 *
 * 用于生成符合中国公文格式规范的 Word 文档
 * 支持标准公文格式：页边距、字体、行距等
 */

const { Deduplicator } = require("../utils/dedupe");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  convertInchesToTwip,
  convertMillimetersToTwip,
} = require("docx");

/**
 * 公文格式配置
 * 根据《党政机关公文格式》(GB/T 9704-2012) 标准
 */
const OFFICIAL_DOC_CONFIG = {
  // 页边距 (单位: 毫米)
  margins: {
    top: 37, // 上边距 3.7cm
    bottom: 35, // 下边距 3.5cm
    left: 28, // 左边距 2.8cm
    right: 26, // 右边距 2.6cm
  },
  // 行距 (固定值 28 磅)
  lineSpacing: {
    line: 28 * 20, // 28磅，转换为 twips (1磅 = 20 twips)
    lineRule: "exact",
  },
  // 字体配置
  fonts: {
    title: "方正小标宋简体", // 标题: 2号小标宋
    heading1: "黑体", // 一级标题: 3号黑体
    heading2: "楷体_GB2312", // 二级标题: 3号楷体加粗
    heading3: "仿宋_GB2312", // 三级标题: 3号仿宋加粗
    body: "仿宋_GB2312", // 正文: 3号仿宋
  },
  // 字号配置 (单位: 半磅)
  fontSizes: {
    title: 22 * 2, // 2号字 = 22磅
    heading1: 16 * 2, // 3号字 = 16磅
    heading2: 16 * 2,
    heading3: 16 * 2,
    body: 16 * 2,
  },
};

/**
 * 创建标题段落
 */
function createTitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200, line: OFFICIAL_DOC_CONFIG.lineSpacing.line },
    children: [
      new TextRun({
        text,
        font: OFFICIAL_DOC_CONFIG.fonts.title,
        size: OFFICIAL_DOC_CONFIG.fontSizes.title,
        bold: true,
      }),
    ],
  });
}

/**
 * 创建一级标题
 */
function createHeading1(text) {
  return new Paragraph({
    spacing: {
      before: 200,
      after: 100,
      line: OFFICIAL_DOC_CONFIG.lineSpacing.line,
    },
    children: [
      new TextRun({
        text,
        font: OFFICIAL_DOC_CONFIG.fonts.heading1,
        size: OFFICIAL_DOC_CONFIG.fontSizes.heading1,
        bold: true,
      }),
    ],
  });
}

/**
 * 创建二级标题
 */
function createHeading2(text) {
  return new Paragraph({
    spacing: {
      before: 100,
      after: 100,
      line: OFFICIAL_DOC_CONFIG.lineSpacing.line,
    },
    children: [
      new TextRun({
        text,
        font: OFFICIAL_DOC_CONFIG.fonts.heading2,
        size: OFFICIAL_DOC_CONFIG.fontSizes.heading2,
        bold: true,
      }),
    ],
  });
}

/**
 * 创建正文段落
 */
function createBodyParagraph(text, indent = true) {
  return new Paragraph({
    spacing: { line: OFFICIAL_DOC_CONFIG.lineSpacing.line },
    indent: indent ? { firstLine: 640 } : undefined, // 首行缩进2字符 (约640 twips)
    children: [
      new TextRun({
        text,
        font: OFFICIAL_DOC_CONFIG.fonts.body,
        size: OFFICIAL_DOC_CONFIG.fontSizes.body,
      }),
    ],
  });
}

/**
 * 创建落款（右对齐）
 */
function createSignature(text) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 400, line: OFFICIAL_DOC_CONFIG.lineSpacing.line },
    children: [
      new TextRun({
        text,
        font: OFFICIAL_DOC_CONFIG.fonts.body,
        size: OFFICIAL_DOC_CONFIG.fontSizes.body,
      }),
    ],
  });
}

/**
 * 解析结构化内容并生成段落
 */
function parseContent(content) {
  const paragraphs = [];

  for (const item of content) {
    switch (item.type) {
      case "title":
        paragraphs.push(createTitle(item.text));
        break;
      case "heading1":
        paragraphs.push(createHeading1(item.text));
        break;
      case "heading2":
        paragraphs.push(createHeading2(item.text));
        break;
      case "paragraph":
        paragraphs.push(createBodyParagraph(item.text, item.indent !== false));
        break;
      case "signature":
        paragraphs.push(createSignature(item.text));
        break;
      default:
        paragraphs.push(createBodyParagraph(item.text || String(item)));
    }
  }

  return paragraphs;
}

/**
 * 生成 Word 文档
 * @param {Object} docData - 文档数据
 * @returns {Promise<Buffer>} Word 文档 Buffer
 */
async function generateDocx(docData) {
  const { title, content, issuer, date } = docData;

  const paragraphs = [];

  // 添加标题
  if (title) {
    paragraphs.push(createTitle(title));
  }

  // 解析并添加内容
  if (content && Array.isArray(content)) {
    paragraphs.push(...parseContent(content));
  }

  // 添加落款
  if (issuer) {
    paragraphs.push(createSignature(issuer));
  }
  if (date) {
    paragraphs.push(createSignature(date));
  }

  // 创建文档
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(OFFICIAL_DOC_CONFIG.margins.top),
              bottom: convertMillimetersToTwip(
                OFFICIAL_DOC_CONFIG.margins.bottom
              ),
              left: convertMillimetersToTwip(OFFICIAL_DOC_CONFIG.margins.left),
              right: convertMillimetersToTwip(
                OFFICIAL_DOC_CONFIG.margins.right
              ),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

/**
 * DocxGenerator AgentPlugin
 * 为 AI 助手提供生成 Word 公文的能力
 */
const docxGenerator = {
  name: "generate-official-document",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          tracker: new Deduplicator(),
          name: this.name,
          description: `生成符合中国公文格式规范的 Word 文档（.docx）。

⚠️ **重要区分**：
- 本工具仅用于生成 Word 文档（.docx）、公文、报告、通知等
- ❌ **禁止**用于 PPT/演示文稿/幻灯片 → 请使用 ppt-outline-flow 工具

适用场景：
- "生成通知/报告/分析文档"
- "导出为 Word 文件"
- "下载公文"

不适用场景（请使用 ppt-outline-flow）：
- "帮我做 PPT"、"生成演示文稿"、"做幻灯片"

公文格式规范：
- 页边距：上3.7cm，下3.5cm，左2.8cm，右2.6cm
- 行距：固定值28磅
- 字体：标题用小标宋，正文用仿宋`,
          examples: [
            {
              prompt: "请帮我生成元旦放假通知的Word文档",
              call: JSON.stringify({
                title: "关于2025年元旦放假的通知",
                content: [
                  { type: "paragraph", text: "各部门：" },
                  {
                    type: "paragraph",
                    text: "根据国务院办公厅通知精神，现将2025年元旦放假安排通知如下：",
                  },
                  { type: "heading1", text: "一、放假时间" },
                  {
                    type: "paragraph",
                    text: "2025年1月1日（星期三）放假，共1天。",
                  },
                  { type: "heading1", text: "二、工作要求" },
                  {
                    type: "paragraph",
                    text: "请各部门提前做好工作安排，确保节日期间安全稳定。",
                  },
                ],
                issuer: "XX公司办公室",
                date: "2024年12月20日",
                filename: "元旦放假通知.docx",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "公文标题",
              },
              content: {
                type: "array",
                description: "公文内容数组",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: [
                        "title",
                        "heading1",
                        "heading2",
                        "paragraph",
                        "signature",
                      ],
                      description:
                        "段落类型：title-标题，heading1-一级标题，heading2-二级标题，paragraph-正文，signature-落款",
                    },
                    text: {
                      type: "string",
                      description: "段落文本内容",
                    },
                    indent: {
                      type: "boolean",
                      description:
                        "是否首行缩进（仅对paragraph有效），默认true",
                    },
                  },
                  required: ["type", "text"],
                },
              },
              issuer: {
                type: "string",
                description: "发文单位/落款",
              },
              date: {
                type: "string",
                description: "发文日期",
              },
              filename: {
                type: "string",
                description: "文件名（含.docx后缀）",
              },
            },
            required: ["title", "content", "filename"],
            additionalProperties: false,
          },
          handler: async function (args) {
            try {
              const { title, content, issuer, date, filename } = args;
              const outputFilename = filename || `${title}.docx`;

              // 检查重复调用（仅用文件名判断，避免内容变体导致重复生成）
              if (this.tracker.isDuplicate(this.name, { outputFilename })) {
                this.super.handlerProps.log(
                  `${this.name} was called for ${outputFilename}, but file already generated.`
                );
                // 设置 directOutput，终止循环
                this.super.skipHandleExecution = true;
                return `✅ **文档已生成**\n\n文档 **${outputFilename}** 已成功生成并下载到您的浏览器。\n\n如需重新生成或修改内容，请明确告诉我。`;
              }

              this.super.introspect(`正在生成公文：${title}...`);

              // 生成 Word 文档
              const buffer = await generateDocx({
                title,
                content,
                issuer,
                date,
              });
              const base64 = buffer.toString("base64");

              // 通过 socket 发送给前端下载
              this.super.socket.send("fileDownload", {
                filename: outputFilename,
                b64Content: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`,
              });

              this.super.introspect(
                `公文 ${outputFilename} 已生成，正在下载...`
              );
              this.tracker.trackRun(this.name, { outputFilename });

              // 设置 directOutput，终止循环，直接返回给用户
              this.super.skipHandleExecution = true;
              return `✅ **文档已生成**\n\n公文《${title}》已成功生成为 **${outputFilename}**，文件已自动下载到您的浏览器。\n\n如需修改内容，请告诉我具体需要调整的部分。`;
            } catch (error) {
              this.super.handlerProps.log(
                `generate-official-document raised an error. ${error.message}`
              );
              return `生成公文时出错：${error.message}。请检查输入格式是否正确。`;
            }
          },
        });
      },
    };
  },
};

module.exports = {
  docxGenerator,
  generateDocx,
  OFFICIAL_DOC_CONFIG,
};
