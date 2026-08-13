/**
 * Metrics Calculator 单元测试
 */

const MetricsCalculator = require("../../utils/evaluation/metrics");
const { METRIC_TYPES, SCENARIO_TYPES } = require("../../utils/evaluation");

describe("MetricsCalculator", () => {
  describe("基础指标计算", () => {
    let calculator;

    beforeEach(() => {
      calculator = new MetricsCalculator(SCENARIO_TYPES.QA);
    });

    test("应正确计算准确率", () => {
      calculator.addResult({ itemId: "1", isCorrect: true, latency: 100 });
      calculator.addResult({ itemId: "2", isCorrect: true, latency: 150 });
      calculator.addResult({ itemId: "3", isCorrect: false, latency: 200 });

      const result = calculator.calculate();

      expect(result.metrics[METRIC_TYPES.ACCURACY]).toBeCloseTo(0.667, 2);
    });

    test("应正确计算平均延迟", () => {
      calculator.addResult({ itemId: "1", isCorrect: true, latency: 100 });
      calculator.addResult({ itemId: "2", isCorrect: true, latency: 200 });
      calculator.addResult({ itemId: "3", isCorrect: true, latency: 300 });

      const result = calculator.calculate();

      expect(result.metrics[METRIC_TYPES.LATENCY]).toBe(200);
    });

    test("应正确计算总 token 消耗", () => {
      calculator.addResult({ itemId: "1", isCorrect: true, tokenUsage: 100 });
      calculator.addResult({ itemId: "2", isCorrect: true, tokenUsage: 200 });

      const result = calculator.calculate();

      expect(result.metrics[METRIC_TYPES.COST]).toBe(300);
    });

    test("空结果应返回零值", () => {
      const result = calculator.calculate();

      expect(result.metrics[METRIC_TYPES.ACCURACY]).toBe(0);
      expect(result.metrics[METRIC_TYPES.LATENCY]).toBe(0);
    });
  });

  describe("问答类指标", () => {
    let calculator;

    beforeEach(() => {
      calculator = new MetricsCalculator(SCENARIO_TYPES.QA);
    });

    test("应正确计算引用准确率", () => {
      calculator.addResult({
        itemId: "1",
        isCorrect: true,
        metadata: { citations: ["doc1"], citationCorrect: true },
      });
      calculator.addResult({
        itemId: "2",
        isCorrect: true,
        metadata: { citations: ["doc2"], citationCorrect: false },
      });

      const result = calculator.calculate();

      expect(result.metrics[METRIC_TYPES.CITATION_ACCURACY]).toBe(0.5);
    });

    test("应正确计算拒答正确率", () => {
      calculator.addResult({
        itemId: "1",
        isCorrect: true,
        metadata: { isRejection: true, shouldReject: true },
      });
      calculator.addResult({
        itemId: "2",
        isCorrect: false,
        metadata: { isRejection: true, shouldReject: false },
      });

      const result = calculator.calculate();

      expect(result.metrics[METRIC_TYPES.REJECTION_ACCURACY]).toBe(0.5);
    });

    test("应正确计算命中率", () => {
      calculator.addResult({ itemId: "1", isCorrect: true, metadata: { answerRank: 1 } });
      calculator.addResult({ itemId: "2", isCorrect: true, metadata: { answerRank: 2 } });
      calculator.addResult({ itemId: "3", isCorrect: true, metadata: { answerRank: 4 } });

      const result = calculator.calculate();

      expect(result.metrics[METRIC_TYPES.HIT_RATE_TOP1]).toBeCloseTo(0.333, 2);
      expect(result.metrics[METRIC_TYPES.HIT_RATE_TOP3]).toBeCloseTo(0.667, 2);
    });
  });

  describe("审核类指标", () => {
    let calculator;

    beforeEach(() => {
      calculator = new MetricsCalculator(SCENARIO_TYPES.REVIEW);
    });

    test("应正确计算风险检出率", () => {
      calculator.addResult({
        itemId: "1",
        isCorrect: true,
        metadata: { expectedRisks: ["risk1"], detectedRisks: ["risk1", "risk2"] },
      });
      calculator.addResult({
        itemId: "2",
        isCorrect: false,
        metadata: { expectedRisks: ["risk3"], detectedRisks: [] },
      });

      const result = calculator.calculate();

      expect(result.metrics[METRIC_TYPES.RISK_DETECTION_RATE]).toBe(0.5);
    });

    test("应正确计算误报率", () => {
      calculator.addResult({
        itemId: "1",
        isCorrect: true,
        metadata: { expectedRisks: ["risk1"], detectedRisks: ["risk1", "risk2"] },
      });
      calculator.addResult({
        itemId: "2",
        isCorrect: true,
        metadata: { expectedRisks: ["risk1"], detectedRisks: ["risk1"] },
      });

      const result = calculator.calculate();

      expect(result.metrics[METRIC_TYPES.FALSE_POSITIVE_RATE]).toBe(0.5);
    });
  });

  describe("Text-to-SQL 指标", () => {
    let calculator;

    beforeEach(() => {
      calculator = new MetricsCalculator(SCENARIO_TYPES.TEXT_TO_SQL);
    });

    test("应正确计算 SQL 正确率", () => {
      calculator.addResult({ itemId: "1", isCorrect: true, metadata: { sqlCorrect: true } });
      calculator.addResult({ itemId: "2", isCorrect: false, metadata: { sqlCorrect: false } });

      const result = calculator.calculate();

      expect(result.metrics[METRIC_TYPES.SQL_CORRECTNESS]).toBe(0.5);
    });

    test("应正确计算执行成功率", () => {
      calculator.addResult({
        itemId: "1",
        isCorrect: true,
        metadata: { sqlExecuted: true, executionSuccess: true },
      });
      calculator.addResult({
        itemId: "2",
        isCorrect: false,
        metadata: { sqlExecuted: true, executionSuccess: false },
      });

      const result = calculator.calculate();

      expect(result.metrics[METRIC_TYPES.EXECUTION_SUCCESS]).toBe(0.5);
    });
  });

  describe("reset", () => {
    test("应清空所有结果", () => {
      const calculator = new MetricsCalculator(SCENARIO_TYPES.QA);
      calculator.addResult({ itemId: "1", isCorrect: true });

      calculator.reset();

      expect(calculator.results).toHaveLength(0);
    });
  });
});

