/* eslint-env jest */
const { QAEvaluator } = require("../../utils/evaluation/scenarios/qaEvaluator");

describe("QAEvaluator", () => {
  let evaluator;
  let mockChatHandler;

  beforeEach(() => {
    mockChatHandler = jest.fn();
    evaluator = new QAEvaluator({
      chatHandler: mockChatHandler,
      workspace: { id: 1, slug: "test" },
    });
  });

  describe("evaluateResponse", () => {
    it("应正确评估拒答场景 - 正确拒答", () => {
      const testCase = {
        id: "test-1",
        input: "超出范围的问题",
        expectedOutput: "",
        metadata: { shouldRefuse: true },
      };

      const response = {
        text: "抱歉，我无法回答这个问题",
        sources: [],
      };

      const result = evaluator.evaluateResponse(testCase, response);

      expect(result.refusalCorrect).toBe(true);
      expect(result.passed).toBe(true);
    });

    it("应正确评估拒答场景 - 错误回答", () => {
      const testCase = {
        id: "test-2",
        input: "超出范围的问题",
        expectedOutput: "",
        metadata: { shouldRefuse: true },
      };

      const response = {
        text: "这是一个正常的回答",
        sources: [],
      };

      const result = evaluator.evaluateResponse(testCase, response);

      expect(result.refusalCorrect).toBe(false);
      expect(result.passed).toBe(false);
    });

    it("应正确计算引用准确率", () => {
      const testCase = {
        id: "test-3",
        input: "关于产品的问题",
        expectedOutput: "产品说明",
        metadata: {
          expectedSources: ["doc-1", "doc-2"],
        },
      };

      const response = {
        text: "产品说明内容",
        sources: [{ id: "doc-1" }, { id: "doc-3" }],
      };

      const result = evaluator.evaluateResponse(testCase, response);

      expect(result.citationAccuracy).toBe(0.5); // 1/2 命中
    });

    it("应正确计算命中率", () => {
      const testCase = {
        id: "test-4",
        input: "关于功能的问题",
        expectedOutput: "",
        metadata: {
          keywords: ["功能", "特性", "支持"],
        },
      };

      const response = {
        text: "这个功能支持多种操作",
        sources: [],
      };

      const result = evaluator.evaluateResponse(testCase, response);

      expect(result.hitRate).toBeCloseTo(0.67, 1); // 2/3 命中
    });
  });

  describe("calculateCitationAccuracy", () => {
    it("无期望来源时返回 1", () => {
      const accuracy = evaluator.calculateCitationAccuracy([{ id: "doc-1" }], []);
      expect(accuracy).toBe(1);
    });

    it("无实际来源时返回 0", () => {
      const accuracy = evaluator.calculateCitationAccuracy([], ["doc-1"]);
      expect(accuracy).toBe(0);
    });

    it("部分匹配时返回正确比例", () => {
      const actual = [{ id: "doc-1" }, { id: "doc-2" }];
      const expected = ["doc-1", "doc-3", "doc-4"];
      const accuracy = evaluator.calculateCitationAccuracy(actual, expected);
      expect(accuracy).toBeCloseTo(0.33, 1);
    });
  });

  describe("calculateHitRate", () => {
    it("无关键词时返回 1", () => {
      const rate = evaluator.calculateHitRate("任意文本", []);
      expect(rate).toBe(1);
    });

    it("无文本时返回 0", () => {
      const rate = evaluator.calculateHitRate("", ["关键词"]);
      expect(rate).toBe(0);
    });

    it("应正确计算命中率", () => {
      const rate = evaluator.calculateHitRate("这是一个测试文本", ["测试", "文本", "示例"]);
      expect(rate).toBeCloseTo(0.67, 1);
    });
  });

  describe("textSimilarity", () => {
    it("相同文本返回 1", () => {
      const similarity = evaluator.textSimilarity("hello world", "hello world");
      expect(similarity).toBe(1);
    });

    it("完全不同文本返回 0", () => {
      const similarity = evaluator.textSimilarity("abc", "xyz");
      expect(similarity).toBe(0);
    });

    it("部分相同返回正确比例", () => {
      const similarity = evaluator.textSimilarity("hello world", "hello there");
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe("runSingleTest", () => {
    it("应正确运行测试并返回结果", async () => {
      mockChatHandler.mockResolvedValue({
        text: "这是回答",
        sources: [{ id: "doc-1" }],
      });

      const testCase = {
        id: "test-run-1",
        input: "测试问题",
        expectedOutput: "这是回答",
        metadata: {},
      };

      const result = await evaluator.runSingleTest(testCase);

      expect(result.id).toBe("test-run-1");
      expect(result.actualOutput).toBe("这是回答");
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(mockChatHandler).toHaveBeenCalledWith({
        message: "测试问题",
        workspace: { id: 1, slug: "test" },
      });
    });

    it("应正确处理错误", async () => {
      mockChatHandler.mockRejectedValue(new Error("测试错误"));

      const testCase = {
        id: "test-error",
        input: "测试问题",
        expectedOutput: "",
        metadata: {},
      };

      const result = await evaluator.runSingleTest(testCase);

      expect(result.error).toBe("测试错误");
      expect(result.passed).toBe(false);
    });
  });
});

