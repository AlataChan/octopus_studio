/**
 * 审核报告 Schema 定义
 * 用于 LLM 结构化输出（JSON Mode）
 */

/** 审核维度枚举 */
const REVIEW_DIMENSIONS = {
  BASIC_INFO: "basic_info",
  QUALIFICATION: "qualification",
  BUDGET: "budget",
  IMPLEMENTATION: "implementation",
  RISK: "risk",
  COMPLIANCE: "compliance",
};

/** 审核结论枚举 */
const REVIEW_CONCLUSIONS = {
  APPROVED: "approved",
  APPROVED_WITH_CONDITIONS: "approved_with_conditions",
  NEEDS_REVISION: "needs_revision",
  REJECTED: "rejected",
};

/** 严重程度枚举 */
const ISSUE_SEVERITY = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

/** 维度中文标签 */
const DIMENSION_LABELS = {
  [REVIEW_DIMENSIONS.BASIC_INFO]: "基础信息完整性",
  [REVIEW_DIMENSIONS.QUALIFICATION]: "资质文件有效性",
  [REVIEW_DIMENSIONS.BUDGET]: "预算合理性",
  [REVIEW_DIMENSIONS.IMPLEMENTATION]: "实施方案可行性",
  [REVIEW_DIMENSIONS.RISK]: "风险评估",
  [REVIEW_DIMENSIONS.COMPLIANCE]: "合规性检查",
};

/** 结论中文标签 */
const CONCLUSION_LABELS = {
  [REVIEW_CONCLUSIONS.APPROVED]: "✅ 审核通过",
  [REVIEW_CONCLUSIONS.APPROVED_WITH_CONDITIONS]: "⚠️ 有条件通过",
  [REVIEW_CONCLUSIONS.NEEDS_REVISION]: "📝 需要修改",
  [REVIEW_CONCLUSIONS.REJECTED]: "❌ 审核不通过",
};

/** 严重程度中文标签 */
const SEVERITY_LABELS = {
  [ISSUE_SEVERITY.HIGH]: "🔴 严重",
  [ISSUE_SEVERITY.MEDIUM]: "🟡 中等",
  [ISSUE_SEVERITY.LOW]: "🟢 轻微",
};

/** 审核报告 JSON Schema */
const REVIEW_REPORT_SCHEMA = {
  type: "object",
  required: [
    "documentInfo",
    "overallConclusion",
    "overallScore",
    "dimensions",
    "summary",
  ],
  properties: {
    documentInfo: {
      type: "object",
      required: ["title", "type"],
      properties: {
        title: { type: "string", description: "文档标题" },
        type: { type: "string", description: "文档类型" },
        author: { type: "string", description: "作者/申报单位" },
        version: { type: "string", description: "版本号" },
        submittedAt: { type: "string", description: "提交日期" },
      },
    },
    overallConclusion: {
      type: "string",
      enum: Object.values(REVIEW_CONCLUSIONS),
      description: "审核整体结论",
    },
    overallScore: { type: "number", minimum: 0, maximum: 100 },
    dimensions: {
      type: "array",
      items: {
        type: "object",
        required: ["dimension", "score", "passed"],
        properties: {
          dimension: { type: "string", enum: Object.values(REVIEW_DIMENSIONS) },
          dimensionLabel: { type: "string" },
          score: { type: "number", minimum: 0, maximum: 100 },
          passed: { type: "boolean" },
          findings: { type: "string" },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                severity: {
                  type: "string",
                  enum: Object.values(ISSUE_SEVERITY),
                },
                suggestion: { type: "string" },
              },
            },
          },
        },
      },
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        required: ["description", "severity"],
        properties: {
          description: { type: "string" },
          severity: { type: "string", enum: Object.values(ISSUE_SEVERITY) },
          location: { type: "string" },
          suggestion: { type: "string" },
        },
      },
    },
    suggestions: { type: "array", items: { type: "string" } },
    summary: { type: "string", description: "审核结果摘要（200-500字）" },
    metadata: {
      type: "object",
      properties: {
        reviewType: { type: "string" },
        reviewedAt: { type: "string" },
        reviewer: { type: "string" },
        modelUsed: { type: "string" },
      },
    },
  },
};

/** 获取 LLM response_format 配置 */
function getResponseFormat() {
  return {
    type: "json_schema",
    json_schema: {
      name: "review_report",
      strict: true,
      schema: REVIEW_REPORT_SCHEMA,
    },
  };
}

/** 创建空白审核报告 */
function createEmptyReport(documentInfo = {}) {
  return {
    documentInfo: {
      title: documentInfo.title || "",
      type: documentInfo.type || "",
      author: documentInfo.author || "",
      version: documentInfo.version || "1.0",
      submittedAt: documentInfo.submittedAt || new Date().toISOString(),
    },
    overallConclusion: null,
    overallScore: null,
    dimensions: [],
    issues: [],
    suggestions: [],
    summary: "",
    metadata: {
      reviewType: "standard",
      reviewedAt: null,
      reviewer: "清禾 Clara",
      modelUsed: null,
    },
  };
}

/** 验证审核报告结构 */
function validateReport(report) {
  const errors = [];
  if (!report.documentInfo?.title) errors.push("缺少文档标题");
  if (!report.overallConclusion) errors.push("缺少审核结论");
  else if (
    !Object.values(REVIEW_CONCLUSIONS).includes(report.overallConclusion)
  ) {
    errors.push("无效的审核结论: " + report.overallConclusion);
  }
  if (report.overallScore === null || report.overallScore === undefined) {
    errors.push("缺少审核评分");
  } else if (report.overallScore < 0 || report.overallScore > 100) {
    errors.push("评分超出范围: " + report.overallScore);
  }
  if (!report.summary) errors.push("缺少审核摘要");
  return { valid: errors.length === 0, errors };
}

module.exports = {
  REVIEW_DIMENSIONS,
  REVIEW_CONCLUSIONS,
  ISSUE_SEVERITY,
  REVIEW_REPORT_SCHEMA,
  DIMENSION_LABELS,
  CONCLUSION_LABELS,
  SEVERITY_LABELS,
  getResponseFormat,
  createEmptyReport,
  validateReport,
};
