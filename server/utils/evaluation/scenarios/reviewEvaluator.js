/**
 * Review Evaluator - 审核场景评测器
 *
 * 专门用于评测审核场景的指标：
 * - 风险检出率 (Risk Detection Rate)
 * - 误报率 (False Positive Rate)
 * - 证据覆盖率 (Evidence Coverage)
 * - 审核一致性 (Review Consistency)
 *
 * @module evaluation/scenarios/reviewEvaluator
 */

const MetricsCalculator = require("../metrics");
const GoldenSetManager = require("../goldenSet");
const { SCENARIO_TYPES } = require("../index");

/**
 * 审核评测器
 */
class ReviewEvaluator {
  /**
   * @param {Object} options - 配置选项
   * @param {Function} options.reviewHandler - 审核处理函数
   * @param {Object} options.workspace - 工作空间配置
   */
  constructor(options = {}) {
    this.reviewHandler = options.reviewHandler;
    this.workspace = options.workspace;
    this.metrics = new MetricsCalculator(SCENARIO_TYPES.REVIEW);
    this.goldenSet = new GoldenSetManager(SCENARIO_TYPES.REVIEW);
  }

  /**
   * 运行单个测试用例
   * @param {Object} testCase - 测试用例
   * @returns {Object} 评测结果
   */
  async runSingleTest(testCase) {
    const startTime = Date.now();

    try {
      const response = await this.reviewHandler({
        content: testCase.input,
        workspace: this.workspace,
      });

      const latency = Date.now() - startTime;
      const evaluation = this.evaluateReview(testCase, response);

      return {
        id: testCase.id,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: response,
        latency,
        ...evaluation,
      };
    } catch (error) {
      return {
        id: testCase.id,
        input: testCase.input,
        error: error.message,
        passed: false,
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * 评估审核结果
   * @param {Object} testCase - 测试用例
   * @param {Object} response - 实际响应
   * @returns {Object} 评估结果
   */
  evaluateReview(testCase, response) {
    const result = {
      passed: false,
      riskDetectionRate: 0,
      falsePositiveRate: 0,
      evidenceCoverage: 0,
    };

    const expectedRisks = testCase.metadata?.expectedRisks || [];
    const detectedRisks = response.risks || response.issues || [];
    const expectedEvidence = testCase.metadata?.expectedEvidence || [];

    // 风险检出率
    result.riskDetectionRate = this.calculateRiskDetectionRate(
      detectedRisks,
      expectedRisks
    );

    // 误报率
    result.falsePositiveRate = this.calculateFalsePositiveRate(
      detectedRisks,
      expectedRisks
    );

    // 证据覆盖率
    result.evidenceCoverage = this.calculateEvidenceCoverage(
      response.evidence || [],
      expectedEvidence
    );

    // 综合判断
    result.passed =
      result.riskDetectionRate >= 0.8 &&
      result.falsePositiveRate <= 0.2 &&
      result.evidenceCoverage >= 0.6;

    return result;
  }

  /**
   * 计算风险检出率
   */
  calculateRiskDetectionRate(detected, expected) {
    if (!expected || expected.length === 0) return 1;
    if (!detected || detected.length === 0) return 0;

    const detectedTypes = detected.map((r) => r.type || r.category || r);
    const hits = expected.filter((e) =>
      detectedTypes.some(
        (d) =>
          d.toLowerCase().includes(e.toLowerCase()) ||
          e.toLowerCase().includes(d.toLowerCase())
      )
    );

    return hits.length / expected.length;
  }

  /**
   * 计算误报率
   */
  calculateFalsePositiveRate(detected, expected) {
    if (!detected || detected.length === 0) return 0;
    if (!expected || expected.length === 0) return detected.length > 0 ? 1 : 0;

    const expectedTypes = expected.map((e) => e.toLowerCase());
    const falsePositives = detected.filter((d) => {
      const type = (d.type || d.category || d).toLowerCase();
      return !expectedTypes.some((e) => type.includes(e) || e.includes(type));
    });

    return falsePositives.length / detected.length;
  }

  /**
   * 计算证据覆盖率
   */
  calculateEvidenceCoverage(actual, expected) {
    if (!expected || expected.length === 0) return 1;
    if (!actual || actual.length === 0) return 0;

    const actualTexts = actual.map((e) =>
      (e.text || e.content || e).toLowerCase()
    );
    const hits = expected.filter((e) =>
      actualTexts.some(
        (a) => a.includes(e.toLowerCase()) || e.toLowerCase().includes(a)
      )
    );

    return hits.length / expected.length;
  }
}

module.exports = { ReviewEvaluator };
