/**
 * 文档入库辅助模块
 * 用于将文件上传到知识库并管理审核报告
 *
 * @description
 * 核心功能：
 * 1. 文档入库：将文件添加到 Workspace 知识库
 * 2. 审核报告存储：将审核结果作为新文档存入知识库
 * 3. 文档列表：获取 Workspace 中的文档列表
 * 4. RAG 检索：使用向量检索获取相关文档片段
 */

const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");
const { Document } = require("../models/documents");
const { Workspace } = require("../models/workspace");
const { getVectorDbClass } = require("./helpers");
const { getLLMProvider } = require("./helpers");
const CollectorApi = require("./collectorApi");

/**
 * 获取 Workspace 中的文档列表
 * @param {number} workspaceId - Workspace ID
 * @param {object} options - 选项
 * @param {string} options.type - 文档类型过滤 (source_document | review_report)
 * @returns {Promise<Array>} 文档列表
 */
async function listWorkspaceDocuments(workspaceId, options = {}) {
  const documents = await Document.forWorkspace(workspaceId);

  if (options.type) {
    return documents.filter((doc) => {
      try {
        const metadata = JSON.parse(doc.metadata || "{}");
        return metadata.type === options.type;
      } catch {
        return false;
      }
    });
  }

  return documents;
}

/**
 * 获取单个文档内容
 * @param {string} docId - 文档 ID
 * @returns {Promise<{title: string, content: string}>}
 */
async function getDocumentContent(docId) {
  return await Document.content(docId);
}

/**
 * 通过 RAG 检索文档片段
 * @param {number} workspaceId - Workspace ID
 * @param {string} query - 检索查询
 * @param {object} options - 检索选项
 * @returns {Promise<{fragments: Array, sources: Array}>}
 */
async function searchDocuments(workspaceId, query, options = {}) {
  const { topN = 10, similarityThreshold = 0.25, documentId = null } = options;

  const workspace = await Workspace.get({ id: workspaceId });
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  const VectorDb = getVectorDbClass();
  const LLMConnector = getLLMProvider();

  // 执行向量搜索
  const results = await VectorDb.performSimilaritySearch({
    namespace: workspace.slug,
    input: query,
    LLMConnector,
    similarityThreshold,
    topN,
    rerank: workspace?.vectorSearchMode === "rerank",
  });

  if (results.message) {
    throw new Error(results.message);
  }

  // 如果指定了 documentId，过滤结果
  let filteredSources = results.sources || [];
  let filteredTexts = results.contextTexts || [];

  if (documentId) {
    const filtered = filteredSources.reduce(
      (acc, source, idx) => {
        if (source.docId === documentId || source.id === documentId) {
          acc.sources.push(source);
          acc.texts.push(filteredTexts[idx]);
        }
        return acc;
      },
      { sources: [], texts: [] }
    );

    filteredSources = filtered.sources;
    filteredTexts = filtered.texts;
  }

  return {
    fragments: filteredTexts.map((text, idx) => ({
      text,
      source: filteredSources[idx],
    })),
    sources: filteredSources,
  };
}

/**
 * 将审核报告存储到知识库
 * @param {number} workspaceId - Workspace ID
 * @param {object} report - 审核报告（符合 REVIEW_REPORT_SCHEMA）
 * @param {object} options - 选项
 * @returns {Promise<{documentId: string, success: boolean}>}
 */
async function saveReviewReportToKnowledgeBase(
  workspaceId,
  report,
  options = {}
) {
  const { targetDocumentId = null, taskId = null } = options;

  const workspace = await Workspace.get({ id: workspaceId });
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  // 生成报告标题
  const reportTitle = `审核报告_${report.documentInfo?.title || "未命名"}_${new Date().toISOString().split("T")[0]}`;

  // 将报告转换为文本内容
  const reportContent = formatReportAsText(report);

  // 使用 CollectorApi 处理文本
  const Collector = new CollectorApi();
  const processingOnline = await Collector.online();

  if (!processingOnline) {
    throw new Error("Document processing API is not online");
  }

  // 通过 processRawText 将报告存入
  const { success, reason, documents } = await Collector.processRawText(
    reportContent,
    {
      title: reportTitle,
      type: "review_report",
      source: "document-review-system",
      targetDocumentId,
      taskId,
      createdAt: new Date().toISOString(),
      structuredData: JSON.stringify(report),
    }
  );

  if (!success || !documents?.length) {
    throw new Error(reason || "Failed to process review report");
  }

  // 将处理后的文档添加到 Workspace
  const docLocation = documents[0].location;
  const { embedded = [], failedToEmbed = [] } = await Document.addDocuments(
    workspace,
    [docLocation],
    options.userId
  );

  if (failedToEmbed.length > 0) {
    throw new Error(
      `Failed to embed review report: ${failedToEmbed.join(", ")}`
    );
  }

  // 获取新创建的文档 ID
  const newDoc = await Document.get({
    workspaceId: workspace.id,
    docpath: embedded[0],
  });

  return {
    documentId: newDoc?.docId,
    success: true,
    docpath: embedded[0],
  };
}

/**
 * 将结构化报告格式化为文本（用于向量化）
 * @param {object} report - 审核报告
 * @returns {string}
 */
function formatReportAsText(report) {
  const lines = [];

  // 文档信息
  lines.push(`# 审核报告：${report.documentInfo?.title || "未命名文档"}`);
  lines.push("");
  lines.push(`- 文档类型：${report.documentInfo?.type || "未知"}`);
  lines.push(`- 申报单位：${report.documentInfo?.author || "未知"}`);
  lines.push(
    `- 审核时间：${report.metadata?.reviewedAt || new Date().toISOString()}`
  );
  lines.push("");

  // 审核结论
  const conclusionLabels = {
    approved: "通过",
    approved_with_conditions: "有条件通过",
    needs_revision: "需要修改",
    rejected: "不通过",
  };
  lines.push(`## 审核结论`);
  lines.push(
    `**${conclusionLabels[report.overallConclusion] || report.overallConclusion}**`
  );
  lines.push(`综合评分：${report.overallScore}/100`);
  lines.push("");

  // 摘要
  if (report.summary) {
    lines.push(`## 审核摘要`);
    lines.push(report.summary);
    lines.push("");
  }

  // 各维度评审
  if (report.dimensions?.length > 0) {
    lines.push(`## 各维度评审`);
    for (const dim of report.dimensions) {
      const status = dim.passed ? "✓" : "✗";
      lines.push(`### ${dim.dimensionLabel || dim.dimension} ${status}`);
      lines.push(`评分：${dim.score}/100`);
      if (dim.findings) {
        lines.push(`发现：${dim.findings}`);
      }
      if (dim.issues?.length > 0) {
        for (const issue of dim.issues) {
          lines.push(`- [${issue.severity}] ${issue.description}`);
        }
      }
      lines.push("");
    }
  }

  // 问题汇总
  if (report.issues?.length > 0) {
    lines.push(`## 问题汇总`);
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.description}`);
      if (issue.location) lines.push(`  位置：${issue.location}`);
      if (issue.suggestion) lines.push(`  建议：${issue.suggestion}`);
    }
    lines.push("");
  }

  // 改进建议
  if (report.suggestions?.length > 0) {
    lines.push(`## 改进建议`);
    for (const suggestion of report.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  return lines.join("\n");
}

/**
 * 计算文件哈希值（用于去重）
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>}
 */
async function calculateFileHash(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash("md5").update(content).digest("hex");
}

module.exports = {
  listWorkspaceDocuments,
  getDocumentContent,
  searchDocuments,
  saveReviewReportToKnowledgeBase,
  formatReportAsText,
  calculateFileHash,
};
