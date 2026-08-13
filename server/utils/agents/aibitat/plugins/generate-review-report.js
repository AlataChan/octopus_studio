/**
 * Generate Review Report Plugin
 *
 * 将结构化审核结果生成为 Word 文档
 * 专为批量审核场景设计，不会终止对话循环
 *
 * @version 1.0.0
 */

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  convertMillimetersToTwip,
} = require("docx");
const { DocumentReviewTask } = require("../../../../models/documentReviewTask");
const {
  saveReviewReportToKnowledgeBase,
} = require("../../../documentIngestion");
const {
  CONCLUSION_LABELS,
  DIMENSION_LABELS,
  SEVERITY_LABELS,
} = require("../../../constants/reviewReportSchema");
const { Deduplicator } = require("../utils/dedupe");

/**
 * 审核报告文档配置
 */
const REPORT_CONFIG = {
  margins: { top: 25, bottom: 25, left: 25, right: 25 },
  fonts: {
    title: "黑体",
    heading: "黑体",
    body: "宋体",
  },
};

/**
 * 生成审核报告 Word 文档
 * @param {object} report - 结构化审核报告
 * @param {string} filename - 文件名
 * @returns {Promise<Buffer>}
 */
async function generateReviewReportDocx(report, _filename) {
  const paragraphs = [];

  // 标题
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `审核报告：${report.documentInfo?.title || "未命名文档"}`,
          bold: true,
          size: 32,
          font: REPORT_CONFIG.fonts.title,
        }),
      ],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // 文档信息
  paragraphs.push(createHeading("一、文档信息"));
  paragraphs.push(
    createParagraph(`文档名称：${report.documentInfo?.title || "N/A"}`)
  );
  paragraphs.push(
    createParagraph(`文档类型：${report.documentInfo?.type || "N/A"}`)
  );
  paragraphs.push(
    createParagraph(`申报单位：${report.documentInfo?.author || "N/A"}`)
  );
  paragraphs.push(
    createParagraph(
      `审核时间：${report.metadata?.reviewedAt || new Date().toISOString().split("T")[0]}`
    )
  );

  // 审核结论
  paragraphs.push(createHeading("二、审核结论"));
  const conclusionText =
    CONCLUSION_LABELS[report.overallConclusion] || report.overallConclusion;
  paragraphs.push(createParagraph(`结论：${conclusionText}`, true));
  paragraphs.push(createParagraph(`综合评分：${report.overallScore}/100 分`));

  // 摘要
  if (report.summary) {
    paragraphs.push(createHeading("三、审核摘要"));
    paragraphs.push(createParagraph(report.summary));
  }

  // 各维度评审
  if (report.dimensions?.length > 0) {
    paragraphs.push(createHeading("四、各维度评审"));
    for (const dim of report.dimensions) {
      const dimLabel = DIMENSION_LABELS[dim.dimension] || dim.dimension;
      const status = dim.passed ? "✓ 通过" : "✗ 不通过";
      paragraphs.push(createSubHeading(`${dimLabel} - ${status}`));
      paragraphs.push(createParagraph(`评分：${dim.score}/100`));
      if (dim.findings) {
        paragraphs.push(createParagraph(`发现：${dim.findings}`));
      }
    }
  }

  // 问题汇总
  if (report.issues?.length > 0) {
    paragraphs.push(createHeading("五、问题汇总"));
    for (let i = 0; i < report.issues.length; i++) {
      const issue = report.issues[i];
      const severityLabel = SEVERITY_LABELS[issue.severity] || issue.severity;
      paragraphs.push(
        createParagraph(`${i + 1}. [${severityLabel}] ${issue.description}`)
      );
      if (issue.location) {
        paragraphs.push(
          createParagraph(`   位置：${issue.location}`, false, true)
        );
      }
      if (issue.suggestion) {
        paragraphs.push(
          createParagraph(`   建议：${issue.suggestion}`, false, true)
        );
      }
    }
  }

  // 改进建议
  if (report.suggestions?.length > 0) {
    paragraphs.push(createHeading("六、改进建议"));
    for (let i = 0; i < report.suggestions.length; i++) {
      paragraphs.push(createParagraph(`${i + 1}. ${report.suggestions[i]}`));
    }
  }

  // 创建文档
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(REPORT_CONFIG.margins.top),
              bottom: convertMillimetersToTwip(REPORT_CONFIG.margins.bottom),
              left: convertMillimetersToTwip(REPORT_CONFIG.margins.left),
              right: convertMillimetersToTwip(REPORT_CONFIG.margins.right),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

// 辅助函数
function createHeading(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 28,
        font: REPORT_CONFIG.fonts.heading,
      }),
    ],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 200 },
  });
}

function createSubHeading(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        font: REPORT_CONFIG.fonts.heading,
      }),
    ],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
  });
}

function createParagraph(text, bold = false, indent = false) {
  return new Paragraph({
    children: [
      new TextRun({ text, bold, size: 21, font: REPORT_CONFIG.fonts.body }),
    ],
    spacing: { after: 100 },
    indent: indent ? { left: 400 } : undefined,
  });
}

/**
 * Generate Review Report Plugin
 */
const generateReviewReport = {
  name: "generate-review-report",
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
          description: `生成审核报告 Word 文档。
将结构化审核结果转换为格式化的 Word 文档。
支持批量生成，不会终止对话循环。`,
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "审核任务 ID（可选，用于关联任务）",
              },
              report: {
                type: "object",
                description: "结构化审核报告",
                properties: {
                  documentInfo: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      type: { type: "string" },
                      author: { type: "string" },
                    },
                  },
                  overallConclusion: { type: "string" },
                  overallScore: { type: "number" },
                  summary: { type: "string" },
                  dimensions: { type: "array" },
                  issues: { type: "array" },
                  suggestions: { type: "array" },
                  metadata: { type: "object" },
                },
                required: ["overallConclusion", "overallScore"],
              },
              filename: {
                type: "string",
                description: "输出文件名（不含扩展名）",
              },
              saveToKnowledgeBase: {
                type: "boolean",
                default: true,
                description: "是否将报告存入知识库",
              },
            },
            required: ["report"],
          },
          handler: async function ({
            taskId,
            report,
            filename,
            saveToKnowledgeBase = true,
          }) {
            try {
              const { workspaceId, user } = aibitat.handlerProps;

              // 生成文件名
              const docTitle = report.documentInfo?.title || "未命名文档";
              const dateStr = new Date()
                .toISOString()
                .split("T")[0]
                .replace(/-/g, "");
              const outputFilename = filename
                ? `${filename}.docx`
                : `审核报告_${docTitle}_${dateStr}.docx`;

              // 检查重复
              if (this.tracker.isDuplicate(this.name, { outputFilename })) {
                return `ℹ️ 报告 ${outputFilename} 已生成过，跳过重复生成。`;
              }

              this.super.introspect(`正在生成审核报告：${outputFilename}...`);

              // 生成 Word 文档
              const buffer = await generateReviewReportDocx(
                report,
                outputFilename
              );
              const base64 = buffer.toString("base64");

              // 发送给前端下载
              this.super.socket.send("fileDownload", {
                filename: outputFilename,
                b64Content: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`,
              });

              this.tracker.trackRun(this.name, { outputFilename });

              // 存入知识库
              let kbResult = null;
              if (saveToKnowledgeBase && workspaceId) {
                try {
                  kbResult = await saveReviewReportToKnowledgeBase(
                    workspaceId,
                    report,
                    {
                      taskId,
                      userId: user?.id,
                    }
                  );
                } catch (kbError) {
                  console.error(
                    "[generate-review-report] KB save error:",
                    kbError
                  );
                }
              }

              // 更新任务状态（如果有 taskId）
              if (taskId) {
                try {
                  await DocumentReviewTask.updateStatus(taskId, "completed", {
                    outputPath: outputFilename,
                    result: report,
                  });
                } catch (taskError) {
                  console.error(
                    "[generate-review-report] Task update error:",
                    taskError
                  );
                }
              }

              // 注意：不设置 skipHandleExecution，允许批量处理继续
              const conclusionLabel =
                CONCLUSION_LABELS[report.overallConclusion] ||
                report.overallConclusion;
              return `✅ 审核报告已生成

📄 文件名: ${outputFilename}
📊 结论: ${conclusionLabel}
📈 评分: ${report.overallScore}/100
${kbResult ? "💾 已存入知识库" : ""}

文件已自动下载到浏览器。`;
            } catch (error) {
              console.error("[generate-review-report] Error:", error);
              return `❌ 生成报告失败: ${error.message}`;
            }
          },
        });
      },
    };
  },
};

module.exports = {
  generateReviewReport,
  generateReviewReportDocx,
  REPORT_CONFIG,
};
