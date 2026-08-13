/**
 * QA Evaluator - 问答场景评测器
 *
 * 专门用于评测问答场景的指标：
 * - 引用准确率 (Citation Accuracy)
 * - 拒答正确率 (Refusal Accuracy)
 * - 命中率 (Hit Rate)
 * - 响应延迟
 *
 * @module evaluation/scenarios/qaEvaluator
 */

const MetricsCalculator = require("../metrics");
const GoldenSetManager = require("../goldenSet");
const { SCENARIO_TYPES } = require("../index");

/**
 * 问答评测器
 */
class QAEvaluator {
  /**
   * @param {Object} options - 配置选项
   * @param {Function} options.chatHandler - 聊天处理函数
   * @param {Object} options.workspace - 工作空间配置
   */
  constructor(options = {}) {
    this.chatHandler = options.chatHandler;
    this.workspace = options.workspace;
    this.metrics = new MetricsCalculator(SCENARIO_TYPES.QA);
    this.goldenSet = new GoldenSetManager(SCENARIO_TYPES.QA);
  }

  /**
   * 加载评测数据集
   * @param {string} filePath - 数据集文件路径
   */
  async loadDataset(filePath) {
    await this.goldenSet.load(filePath);
    return this.goldenSet.getStats();
  }

  /**
   * 运行单个测试用例
   * @param {Object} testCase - 测试用例
   * @returns {Object} 评测结果
   */
  async runSingleTest(testCase) {
    const startTime = Date.now();

    try {
      // 模拟聊天请求
      const response = await this.chatHandler({
        message: testCase.input,
        workspace: this.workspace,
      });

      const latency = Date.now() - startTime;

      // 评估结果
      const evaluation = this.evaluateResponse(testCase, response);

      return {
        id: testCase.id,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: response.text,
        sources: response.sources || [],
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
   * 评估响应质量
   * @param {Object} testCase - 测试用例
   * @param {Object} response - 实际响应
   * @returns {Object} 评估结果
   */
  evaluateResponse(testCase, response) {
    const result = {
      passed: false,
      citationAccuracy: 0,
      refusalCorrect: null,
      hitRate: 0,
    };

    // 检查是否应该拒答
    const shouldRefuse = testCase.metadata?.shouldRefuse === true;
    const didRefuse = this.isRefusalResponse(response);

    if (shouldRefuse) {
      result.refusalCorrect = didRefuse;
      result.passed = didRefuse;
      return result;
    }

    // 非拒答场景：评估引用准确率
    if (testCase.metadata?.expectedSources) {
      result.citationAccuracy = this.calculateCitationAccuracy(
        response.sources || [],
        testCase.metadata.expectedSources
      );
    }

    // 计算命中率（是否包含关键信息）
    if (testCase.metadata?.keywords) {
      result.hitRate = this.calculateHitRate(
        response.text,
        testCase.metadata.keywords
      );
    }

    // 综合判断是否通过
    result.passed =
      result.citationAccuracy >= 0.5 ||
      result.hitRate >= 0.7 ||
      this.textSimilarity(response.text, testCase.expectedOutput) >= 0.6;

    return result;
  }

  /**
   * 判断是否为拒答响应
   */
  isRefusalResponse(response) {
    const refusalPatterns = ["抱歉", "无法", "没有找到", "超出", "不确定"];
    return refusalPatterns.some((p) => response.text?.includes(p));
  }

  /**
   * 计算引用准确率
   */
  calculateCitationAccuracy(actualSources, expectedSources) {
    if (!expectedSources || expectedSources.length === 0) return 1;
    if (!actualSources || actualSources.length === 0) return 0;

    const actualIds = actualSources.map((s) => s.id || s.docId || s.title);
    const hits = expectedSources.filter((e) =>
      actualIds.some((a) => a?.includes(e) || e?.includes(a))
    );

    return hits.length / expectedSources.length;
  }

  /**
   * 计算命中率
   */
  calculateHitRate(text, keywords) {
    if (!keywords || keywords.length === 0) return 1;
    if (!text) return 0;

    const hits = keywords.filter((k) =>
      text.toLowerCase().includes(k.toLowerCase())
    );
    return hits.length / keywords.length;
  }

  /**
   * 简单文本相似度（Jaccard）
   */
  textSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = [...words1].filter((w) => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;

    return union > 0 ? intersection / union : 0;
  }
}

module.exports = { QAEvaluator };
