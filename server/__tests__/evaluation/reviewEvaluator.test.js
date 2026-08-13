/* eslint-env jest */
const { ReviewEvaluator } = require("../../utils/evaluation/scenarios/reviewEvaluator");

describe("ReviewEvaluator", () => {
  let evaluator;
  let mockReviewHandler;

  beforeEach(() => {
    mockReviewHandler = jest.fn();
    evaluator = new ReviewEvaluator({
      reviewHandler: mockReviewHandler,
      workspace: { id: 1, slug: "test" },
    });
  });

  describe("calculateRiskDetectionRate", () => {
    it("无期望风险时返回 1", () => {
      const rate = evaluator.calculateRiskDetectionRate([{ type: "risk" }], []);
      expect(rate).toBe(1);
    });

    it("无检测结果时返回 0", () => {
      const rate = evaluator.calculateRiskDetectionRate([], ["敏感信息"]);
      expect(rate).toBe(0);
    });

    it("应正确计算检出率", () => {
      const detected = [{ type: "敏感信息泄露" }, { type: "合规风险" }];
      const expected = ["敏感信息", "合规", "安全漏洞"];
      const rate = evaluator.calculateRiskDetectionRate(detected, expected);
      expect(rate).toBeCloseTo(0.67, 1);
    });

    it("完全匹配时返回 1", () => {
      const detected = [{ type: "敏感信息" }, { type: "合规风险" }];
      const expected = ["敏感信息", "合规"];
      const rate = evaluator.calculateRiskDetectionRate(detected, expected);
      expect(rate).toBe(1);
    });
  });

  describe("calculateFalsePositiveRate", () => {
    it("无检测结果时返回 0", () => {
      const rate = evaluator.calculateFalsePositiveRate([], ["风险"]);
      expect(rate).toBe(0);
    });

    it("无期望风险但有检测时返回 1", () => {
      const rate = evaluator.calculateFalsePositiveRate([{ type: "误报" }], []);
      expect(rate).toBe(1);
    });

    it("应正确计算误报率", () => {
      const detected = [{ type: "敏感信息" }, { type: "误报风险" }, { type: "合规" }];
      const expected = ["敏感信息", "合规"];
      const rate = evaluator.calculateFalsePositiveRate(detected, expected);
      expect(rate).toBeCloseTo(0.33, 1);
    });

    it("无误报时返回 0", () => {
      const detected = [{ type: "敏感信息" }];
      const expected = ["敏感信息", "合规"];
      const rate = evaluator.calculateFalsePositiveRate(detected, expected);
      expect(rate).toBe(0);
    });
  });

  describe("calculateEvidenceCoverage", () => {
    it("无期望证据时返回 1", () => {
      const coverage = evaluator.calculateEvidenceCoverage([{ text: "证据" }], []);
      expect(coverage).toBe(1);
    });

    it("无实际证据时返回 0", () => {
      const coverage = evaluator.calculateEvidenceCoverage([], ["证据1"]);
      expect(coverage).toBe(0);
    });

    it("应正确计算证据覆盖率", () => {
      const actual = [{ text: "包含敏感数据" }, { text: "违反合规要求" }];
      const expected = ["敏感数据", "合规", "安全"];
      const coverage = evaluator.calculateEvidenceCoverage(actual, expected);
      expect(coverage).toBeCloseTo(0.67, 1);
    });
  });

  describe("evaluateReview", () => {
    it("应综合评估审核结果", () => {
      const testCase = {
        id: "test-1",
        input: "审核内容",
        expectedOutput: "",
        metadata: {
          expectedRisks: ["敏感信息", "合规"],
          expectedEvidence: ["证据1", "证据2"],
        },
      };

      const response = {
        risks: [{ type: "敏感信息泄露" }, { type: "合规风险" }],
        evidence: [{ text: "证据1内容" }, { text: "证据2内容" }],
      };

      const result = evaluator.evaluateReview(testCase, response);

      expect(result.riskDetectionRate).toBe(1);
      expect(result.falsePositiveRate).toBe(0);
      expect(result.evidenceCoverage).toBe(1);
      expect(result.passed).toBe(true);
    });

    it("检出率低时应不通过", () => {
      const testCase = {
        id: "test-2",
        input: "审核内容",
        expectedOutput: "",
        metadata: {
          expectedRisks: ["敏感信息", "合规", "安全"],
          expectedEvidence: [],
        },
      };

      const response = {
        risks: [{ type: "敏感信息" }],
        evidence: [],
      };

      const result = evaluator.evaluateReview(testCase, response);

      expect(result.riskDetectionRate).toBeCloseTo(0.33, 1);
      expect(result.passed).toBe(false);
    });
  });

  describe("runSingleTest", () => {
    it("应正确运行测试并返回结果", async () => {
      mockReviewHandler.mockResolvedValue({
        risks: [{ type: "风险" }],
        evidence: [{ text: "证据" }],
      });

      const testCase = {
        id: "test-run-1",
        input: "审核内容",
        expectedOutput: "",
        metadata: {
          expectedRisks: ["风险"],
          expectedEvidence: ["证据"],
        },
      };

      const result = await evaluator.runSingleTest(testCase);

      expect(result.id).toBe("test-run-1");
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.riskDetectionRate).toBe(1);
    });

    it("应正确处理错误", async () => {
      mockReviewHandler.mockRejectedValue(new Error("审核失败"));

      const testCase = {
        id: "test-error",
        input: "审核内容",
        expectedOutput: "",
        metadata: {},
      };

      const result = await evaluator.runSingleTest(testCase);

      expect(result.error).toBe("审核失败");
      expect(result.passed).toBe(false);
    });
  });
});

