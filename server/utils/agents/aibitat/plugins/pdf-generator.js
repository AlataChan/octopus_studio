/**
 * PDF Generator Plugin
 *
 * 用于生成 PDF 文档
 * 支持中文字体嵌入（思源字体）
 */

const { Deduplicator } = require("../utils/dedupe");
const PDFDocument = require("pdfkit");

/**
 * 字体说明
 * V1 简化版：直接使用 pdfkit 内置字体（Helvetica）
 * 内置字体不支持中文，中文字符可能显示为方块
 * 未来版本将集成 pdfmake 或中文 TTF 字体以获得更好的中文支持
 * 建议中文内容优先使用 Word 生成器（generate-official-document）
 */

/**
 * 默认样式配置
 */
const DEFAULT_STYLES = {
  title: { fontSize: 24, lineGap: 10 },
  heading: { fontSize: 16, lineGap: 8 },
  body: { fontSize: 12, lineGap: 6 },
  margins: { top: 72, bottom: 72, left: 72, right: 72 }, // 1 inch = 72 points
};

/**
 * 生成 PDF 文档
 * @param {Object} data - 文档数据
 * @returns {Promise<Buffer>} PDF 文件 Buffer
 */
async function generatePdf(data) {
  return new Promise((resolve, reject) => {
    try {
      const { title, content, footer } = data;
      const chunks = [];

      const doc = new PDFDocument({
        size: "A4",
        margins: DEFAULT_STYLES.margins,
        info: {
          Title: title || "Document",
          Author: "Alata Studio",
          Creator: "Alata Studio PDF Generator",
        },
      });

      // 收集 PDF 数据
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // V1 简化版：使用 pdfkit 内置字体（Helvetica）
      // 注意：内置字体不支持中文，中文字符可能无法正确显示
      // 建议中文内容使用 Word 生成器（generate-official-document）
      console.log("[PDF Generator] V1 使用内置字体，中文支持受限");

      // 渲染内容
      for (const item of content) {
        switch (item.type) {
          case "title":
            doc
              .fontSize(DEFAULT_STYLES.title.fontSize)
              .font("Helvetica-Bold")
              .text(item.text, {
                align: "center",
                lineGap: DEFAULT_STYLES.title.lineGap,
              });
            doc.font("Helvetica");
            doc.moveDown(1);
            break;

          case "heading":
            doc
              .fontSize(DEFAULT_STYLES.heading.fontSize)
              .font("Helvetica-Bold")
              .text(item.text, { lineGap: DEFAULT_STYLES.heading.lineGap });
            doc.font("Helvetica");
            doc.moveDown(0.5);
            break;

          case "paragraph":
            doc
              .fontSize(DEFAULT_STYLES.body.fontSize)
              .font("Helvetica")
              .text(item.text, {
                align: "justify",
                lineGap: DEFAULT_STYLES.body.lineGap,
                indent: item.indent !== false ? 24 : 0,
              });
            doc.moveDown(0.5);
            break;

          default:
            doc
              .fontSize(DEFAULT_STYLES.body.fontSize)
              .font("Helvetica")
              .text(item.text || String(item));
            doc.moveDown(0.5);
        }
      }

      // 添加页脚（如果指定）
      if (footer) {
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc
            .fontSize(10)
            .text(
              footer.replace("{page}", i + 1).replace("{pages}", pageCount),
              DEFAULT_STYLES.margins.left,
              doc.page.height - 50,
              {
                align: "center",
                width:
                  doc.page.width -
                  DEFAULT_STYLES.margins.left -
                  DEFAULT_STYLES.margins.right,
              }
            );
        }
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * PdfGenerator AgentPlugin
 */
const pdfGenerator = {
  name: "generate-pdf-document",
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
          description: `生成 PDF 文档。
适合英文文档、合同、报告等场景。
注意：当前版本中文支持受限，中文内容建议使用 Word 生成器（generate-official-document）。
当用户要求生成PDF、导出PDF文档时调用此工具。`,
          examples: [
            {
              prompt: "帮我生成一份合同PDF",
              call: JSON.stringify({
                filename: "租赁合同.pdf",
                content: [
                  { type: "title", text: "房屋租赁合同" },
                  { type: "heading", text: "第一条 租赁房屋基本情况" },
                  {
                    type: "paragraph",
                    text: "甲方将位于XX市XX区XX路XX号的房屋出租给乙方使用。",
                  },
                  { type: "heading", text: "第二条 租赁期限" },
                  {
                    type: "paragraph",
                    text: "租赁期限为一年，自2024年1月1日起至2024年12月31日止。",
                  },
                ],
                footer: "第 {page} 页，共 {pages} 页",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              filename: { type: "string", description: "文件名（含.pdf后缀）" },
              content: {
                type: "array",
                description: "内容数组",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["title", "heading", "paragraph"],
                      description: "内容类型",
                    },
                    text: { type: "string", description: "文本内容" },
                    indent: {
                      type: "boolean",
                      description: "是否首行缩进（仅paragraph类型）",
                    },
                  },
                  required: ["type", "text"],
                },
              },
              footer: {
                type: "string",
                description: "页脚文本，可用{page}和{pages}占位符",
              },
            },
            required: ["filename", "content"],
            additionalProperties: false,
          },
          handler: async function (args) {
            try {
              const { filename, content, footer } = args;

              if (this.tracker.isDuplicate(this.name, { filename })) {
                this.super.skipHandleExecution = true;
                return `✅ **PDF 已生成**\n\nPDF 文档《${filename}》已成功生成，文件已自动下载到您的浏览器。`;
              }

              this.super.introspect(`正在生成PDF：${filename}...`);

              const buffer = await generatePdf({
                title: filename,
                content,
                footer,
              });
              const base64 = buffer.toString("base64");

              this.super.socket.send("fileDownload", {
                filename,
                b64Content: `data:application/pdf;base64,${base64}`,
              });

              this.super.introspect(`PDF ${filename} 已生成，正在下载...`);
              this.tracker.trackRun(this.name, { filename });

              // 设置 directOutput，终止循环
              this.super.skipHandleExecution = true;
              return `✅ **PDF 已生成**\n\nPDF 文档《${filename}》已成功生成，文件已自动下载到您的浏览器。\n\n如需修改内容，请告诉我具体需要调整的部分。`;
            } catch (error) {
              this.super.handlerProps.log(
                `generate-pdf-document error: ${error.message}`
              );
              return `生成PDF时出错：${error.message}`;
            }
          },
        });
      },
    };
  },
};

module.exports = { pdfGenerator, generatePdf };
