/**
 * Report Evaluator - 报告生成场景评测器
 *
 * 专门用于评测报告生成场景的指标：
 * - 结构合规率 (Structure Compliance)
 * - 内容覆盖率 (Content Coverage)
 * - 引用完整性 (Citation Completeness)
 * - 格式规范性 (Format Compliance)
 *
 * @module evaluation/scenarios/reportEvaluator
 */

const MetricsCalculator = require("../metrics");
const GoldenSetManager = require("../goldenSet");
const { SCENARIO_TYPES } = require("../index");

/**
 * 报告评测器
 */
class ReportEvaluator {
  /**
   * @param {Object} options - 配置选项
   * @param {Function} options.reportGenerator - 报告生成函数
   * @param {Object} options.workspace - 工作空间配置
   */
  constructor(options = {}) {
    this.reportGenerator = options.reportGenerator;
    this.workspace = options.workspace;
    this.metrics = new MetricsCalculator(SCENARIO_TYPES.REPORT);
    this.goldenSet = new GoldenSetManager(SCENARIO_TYPES.REPORT);
  }

  /**
   * 运行单个测试用例
   * @param {Object} testCase - 测试用例
   * @returns {Object} 评测结果
   */
  async runSingleTest(testCase) {
    const startTime = Date.now();

    try {
      const response = await this.reportGenerator({
        topic: testCase.input,
        workspace: this.workspace,
      });

      const latency = Date.now() - startTime;
      const evaluation = this.evaluateReport(testCase, response);

      return {
        id: testCase.id,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: response.content,
        citations: response.citations || [],
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
   * 评估报告质量
   * @param {Object} testCase - 测试用例
   * @param {Object} response - 实际响应
   * @returns {Object} 评估结果
   */
  evaluateReport(testCase, response) {
    const result = {
      passed: false,
      structureCompliance: 0,
      contentCoverage: 0,
      citationCompleteness: 0,
      formatCompliance: 0,
    };

    const content = response.content || "";
    const expectedStructure = testCase.metadata?.expectedStructure || [];
    const expectedKeywords = testCase.metadata?.keywords || [];
    const expectedCitations = testCase.metadata?.expectedCitations || 0;

    // 结构合规率
    result.structureCompliance = this.calculateStructureCompliance(
      content,
      expectedStructure
    );

    // 内容覆盖率
    result.contentCoverage = this.calculateContentCoverage(
      content,
      expectedKeywords
    );

    // 引用完整性
    result.citationCompleteness = this.calculateCitationCompleteness(
      response.citations || [],
      expectedCitations
    );

    // 格式规范性
    result.formatCompliance = this.calculateFormatCompliance(content);

    // 综合判断
    const avgScore =
      (result.structureCompliance +
        result.contentCoverage +
        result.citationCompleteness +
        result.formatCompliance) /
      4;

    result.passed = avgScore >= 0.6;

    return result;
  }

  /**
   * 计算结构合规率
   */
  calculateStructureCompliance(content, expectedStructure) {
    if (!expectedStructure || expectedStructure.length === 0) return 1;

    const hits = expectedStructure.filter((section) =>
      content.toLowerCase().includes(section.toLowerCase())
    );

    return hits.length / expectedStructure.length;
  }

  /**
   * 计算内容覆盖率
   */
  calculateContentCoverage(content, keywords) {
    if (!keywords || keywords.length === 0) return 1;
    if (!content) return 0;

    const hits = keywords.filter((k) =>
      content.toLowerCase().includes(k.toLowerCase())
    );
    return hits.length / keywords.length;
  }

  /**
   * 计算引用完整性
   */
  calculateCitationCompleteness(citations, expectedCount) {
    if (expectedCount === 0) return 1;
    if (!citations || citations.length === 0) return 0;

    return Math.min(citations.length / expectedCount, 1);
  }

  /**
   * 计算格式规范性
   */
  calculateFormatCompliance(content) {
    if (!content) return 0;

    let score = 0;
    const checks = [
      /^#\s+.+/m, // 有标题
      /^##\s+.+/m, // 有二级标题
      /\[来源\d+\]|\[\d+\]/g, // 有引用标记
      /参考来源|参考文献|References/i, // 有参考来源章节
    ];

    checks.forEach((regex) => {
      if (regex.test(content)) score += 0.25;
    });

    return score;
  }
}

module.exports = { ReportEvaluator };
