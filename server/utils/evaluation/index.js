/**
 * Evaluation Framework - 评测框架
 *
 * 用于企业 AI 场景的自动化评测，支持四类场景：
 * 1. 问答类（Q&A）- 知识库问答、FAQ 命中率
 * 2. 审核类（Review）- 合同/流程审核准确率
 * 3. 报告类（Report）- 结构化输出合规率
 * 4. 问述类（Text-to-SQL）- SQL 正确率、执行成功率
 *
 * @module evaluation
 */

const GoldenSetManager = require("./goldenSet");
const MetricsCalculator = require("./metrics");
const EvaluationRunner = require("./runner");

/**
 * 评测场景类型枚举
 */
const SCENARIO_TYPES = {
  QA: "qa", // 问答类
  REVIEW: "review", // 审核类
  REPORT: "report", // 报告类
  TEXT_TO_SQL: "text_to_sql", // 问述类
};

/**
 * 评测指标类型枚举
 */
const METRIC_TYPES = {
  // 通用指标
  ACCURACY: "accuracy", // 准确率
  LATENCY: "latency", // 延迟
  COST: "cost", // 成本（token 消耗）

  // 问答类指标
  HIT_RATE_TOP1: "hit_rate_top1", // Top-1 命中率
  HIT_RATE_TOP3: "hit_rate_top3", // Top-3 命中率
  CITATION_ACCURACY: "citation_accuracy", // 引用准确率
  REJECTION_ACCURACY: "rejection_accuracy", // 拒答正确率

  // 审核类指标
  RISK_DETECTION_RATE: "risk_detection_rate", // 风险检出率
  FALSE_POSITIVE_RATE: "false_positive_rate", // 误报率
  EVIDENCE_COVERAGE: "evidence_coverage", // 证据覆盖率

  // 报告类指标
  STRUCTURE_COMPLIANCE: "structure_compliance", // 结构合规率
  CONTENT_COVERAGE: "content_coverage", // 内容覆盖率

  // Text-to-SQL 指标
  SQL_CORRECTNESS: "sql_correctness", // SQL 正确率
  EXECUTION_SUCCESS: "execution_success", // 执行成功率
  RESULT_MATCH: "result_match", // 结果匹配率
};

/**
 * 创建评测实例
 * @param {Object} options - 配置选项
 * @param {string} options.scenario - 场景类型
 * @param {string} options.goldenSetPath - Golden Set 文件路径
 * @returns {EvaluationRunner} 评测运行器实例
 */
function createEvaluator(options = {}) {
  const { scenario, goldenSetPath } = options;

  if (!scenario || !SCENARIO_TYPES[scenario.toUpperCase()]) {
    throw new Error(
      `Invalid scenario: ${scenario}. Valid options: ${Object.values(SCENARIO_TYPES).join(", ")}`
    );
  }

  return new EvaluationRunner({
    scenario: SCENARIO_TYPES[scenario.toUpperCase()],
    goldenSetPath,
    metricsCalculator: new MetricsCalculator(scenario),
  });
}

module.exports = {
  SCENARIO_TYPES,
  METRIC_TYPES,
  GoldenSetManager,
  MetricsCalculator,
  EvaluationRunner,
  createEvaluator,
};
