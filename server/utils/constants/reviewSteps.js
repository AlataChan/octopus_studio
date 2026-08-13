/**
 * 审核步骤定义
 * 用于进度反馈
 */

/**
 * 审核步骤枚举
 */
const REVIEW_STEPS = {
  READING_FILE: {
    step: 1,
    total: 5,
    label: "正在读取文档...",
    description: "读取待审核文件内容",
  },
  RETRIEVING_STANDARDS: {
    step: 2,
    total: 5,
    label: "正在检索审核标准...",
    description: "从知识库检索相关审核标准",
  },
  ANALYZING_CONTENT: {
    step: 3,
    total: 5,
    label: "正在分析文档内容...",
    description: "使用 AI 分析文档并对照标准",
  },
  GENERATING_REPORT: {
    step: 4,
    total: 5,
    label: "正在生成审核报告...",
    description: "生成 Word 格式的审核报告",
  },
  FINALIZING: {
    step: 5,
    total: 5,
    label: "正在完成审核...",
    description: "保存结果并更新任务状态",
  },
};

/**
 * 任务状态枚举
 */
const TASK_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
};

/**
 * 审核类型枚举
 */
const REVIEW_TYPE = {
  STANDARD: "standard", // 标准审核
  STRICT: "strict", // 严格审核（更详细的检查）
  QUICK: "quick", // 快速审核（仅基本检查）
};

/**
 * 格式化进度消息
 * @param {object} step - REVIEW_STEPS 中的步骤对象
 * @returns {string}
 */
function formatProgressMessage(step) {
  return `[${step.step}/${step.total}] ${step.label}`;
}

/**
 * 获取进度百分比
 * @param {object} step - REVIEW_STEPS 中的步骤对象
 * @returns {number}
 */
function getProgressPercent(step) {
  return Math.round((step.step / step.total) * 100);
}

module.exports = {
  REVIEW_STEPS,
  TASK_STATUS,
  REVIEW_TYPE,
  formatProgressMessage,
  getProgressPercent,
};
