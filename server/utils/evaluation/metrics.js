/**
 * Metrics Calculator - 评测指标计算
 *
 * 支持四类场景的指标计算：
 * - 问答类：命中率、引用准确率、拒答正确率
 * - 审核类：风险检出率、误报率、证据覆盖率
 * - 报告类：结构合规率、内容覆盖率
 * - 问述类：SQL 正确率、执行成功率
 *
 * @module evaluation/metrics
 */

const { METRIC_TYPES, SCENARIO_TYPES } = require("./index");

/**
 * 指标计算器类
 */
class MetricsCalculator {
  /**
   * @param {string} scenario - 场景类型
   */
  constructor(scenario) {
    this.scenario = scenario;
    this.results = [];
  }

  /**
   * 添加单个评测结果
   * @param {Object} result - 评测结果
   * @param {string} result.itemId - Golden Set 项目 ID
   * @param {*} result.actual - 实际输出
   * @param {*} result.expected - 期望输出
   * @param {number} result.latency - 延迟（毫秒）
   * @param {number} result.tokenUsage - Token 消耗
   * @param {Object} result.metadata - 扩展数据
   */
  addResult(result) {
    this.results.push({
      ...result,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 计算所有指标
   * @returns {Object} 指标结果
   */
  calculate() {
    const baseMetrics = this._calculateBaseMetrics();
    const scenarioMetrics = this._calculateScenarioMetrics();

    return {
      scenario: this.scenario,
      sampleCount: this.results.length,
      calculatedAt: new Date().toISOString(),
      metrics: {
        ...baseMetrics,
        ...scenarioMetrics,
      },
    };
  }

  /**
   * 计算基础指标（通用）
   * @private
   */
  _calculateBaseMetrics() {
    if (this.results.length === 0) {
      return {
        [METRIC_TYPES.ACCURACY]: 0,
        [METRIC_TYPES.LATENCY]: 0,
        [METRIC_TYPES.COST]: 0,
      };
    }

    const correctCount = this.results.filter((r) => r.isCorrect).length;
    const totalLatency = this.results.reduce(
      (sum, r) => sum + (r.latency || 0),
      0
    );
    const totalTokens = this.results.reduce(
      (sum, r) => sum + (r.tokenUsage || 0),
      0
    );

    return {
      [METRIC_TYPES.ACCURACY]: correctCount / this.results.length,
      [METRIC_TYPES.LATENCY]: totalLatency / this.results.length,
      [METRIC_TYPES.COST]: totalTokens,
    };
  }

  /**
   * 计算场景特定指标
   * @private
   */
  _calculateScenarioMetrics() {
    switch (this.scenario) {
      case SCENARIO_TYPES.QA:
        return this._calculateQAMetrics();
      case SCENARIO_TYPES.REVIEW:
        return this._calculateReviewMetrics();
      case SCENARIO_TYPES.REPORT:
        return this._calculateReportMetrics();
      case SCENARIO_TYPES.TEXT_TO_SQL:
        return this._calculateSQLMetrics();
      default:
        return {};
    }
  }

  /**
   * 问答类指标
   * @private
   */
  _calculateQAMetrics() {
    const withCitations = this.results.filter(
      (r) => r.metadata?.citations?.length > 0
    );
    const correctCitations = withCitations.filter(
      (r) => r.metadata?.citationCorrect
    );
    const rejections = this.results.filter((r) => r.metadata?.isRejection);
    const correctRejections = rejections.filter(
      (r) => r.metadata?.shouldReject
    );

    return {
      [METRIC_TYPES.HIT_RATE_TOP1]: this._calculateHitRate(1),
      [METRIC_TYPES.HIT_RATE_TOP3]: this._calculateHitRate(3),
      [METRIC_TYPES.CITATION_ACCURACY]:
        withCitations.length > 0
          ? correctCitations.length / withCitations.length
          : 0,
      [METRIC_TYPES.REJECTION_ACCURACY]:
        rejections.length > 0
          ? correctRejections.length / rejections.length
          : 0,
    };
  }

  /**
   * 计算命中率
   * @private
   */
  _calculateHitRate(topN) {
    const hits = this.results.filter((r) => {
      const rank = r.metadata?.answerRank;
      return rank !== undefined && rank <= topN;
    });
    return this.results.length > 0 ? hits.length / this.results.length : 0;
  }

  /**
   * 审核类指标
   * @private
   */
  _calculateReviewMetrics() {
    const withRisks = this.results.filter(
      (r) => r.metadata?.expectedRisks?.length > 0
    );
    const detectedRisks = withRisks.filter((r) => {
      const expected = r.metadata?.expectedRisks || [];
      const actual = r.metadata?.detectedRisks || [];
      return expected.some((e) => actual.includes(e));
    });

    const falsePositives = this.results.filter((r) => {
      const expected = r.metadata?.expectedRisks || [];
      const actual = r.metadata?.detectedRisks || [];
      return actual.some((a) => !expected.includes(a));
    });

    return {
      [METRIC_TYPES.RISK_DETECTION_RATE]:
        withRisks.length > 0 ? detectedRisks.length / withRisks.length : 0,
      [METRIC_TYPES.FALSE_POSITIVE_RATE]:
        this.results.length > 0
          ? falsePositives.length / this.results.length
          : 0,
    };
  }

  /**
   * 报告类指标
   * @private
   */
  _calculateReportMetrics() {
    const withStructure = this.results.filter(
      (r) => r.metadata?.structureValid !== undefined
    );
    const compliant = withStructure.filter((r) => r.metadata?.structureValid);

    return {
      [METRIC_TYPES.STRUCTURE_COMPLIANCE]:
        withStructure.length > 0 ? compliant.length / withStructure.length : 0,
    };
  }

  /**
   * Text-to-SQL 指标
   * @private
   */
  _calculateSQLMetrics() {
    const executed = this.results.filter((r) => r.metadata?.sqlExecuted);
    const successful = executed.filter((r) => r.metadata?.executionSuccess);
    const matched = successful.filter((r) => r.metadata?.resultMatch);

    return {
      [METRIC_TYPES.SQL_CORRECTNESS]:
        this.results.filter((r) => r.metadata?.sqlCorrect).length /
        Math.max(this.results.length, 1),
      [METRIC_TYPES.EXECUTION_SUCCESS]:
        executed.length > 0 ? successful.length / executed.length : 0,
      [METRIC_TYPES.RESULT_MATCH]:
        successful.length > 0 ? matched.length / successful.length : 0,
    };
  }

  /**
   * 重置结果
   */
  reset() {
    this.results = [];
  }
}

module.exports = MetricsCalculator;
