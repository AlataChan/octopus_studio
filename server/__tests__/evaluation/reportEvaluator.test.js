/* eslint-env jest */
const { ReportEvaluator } = require("../../utils/evaluation/scenarios/reportEvaluator");

describe("ReportEvaluator", () => {
  let evaluator;
  let mockReportGenerator;

  beforeEach(() => {
    mockReportGenerator = jest.fn();
    evaluator = new ReportEvaluator({
      reportGenerator: mockReportGenerator,
      workspace: { id: 1, slug: "test" },
    });
  });

  describe("calculateStructureCompliance", () => {
    it("无期望结构时返回 1", () => {
      const compliance = evaluator.calculateStructureCompliance("任意内容", []);
      expect(compliance).toBe(1);
    });

    it("应正确计算结构合规率", () => {
      const content = "# 摘要\n内容\n## 背景\n背景内容\n## 结论\n结论内容";
      const expectedStructure = ["摘要", "背景", "分析", "结论"];
      const compliance = evaluator.calculateStructureCompliance(content, expectedStructure);
      expect(compliance).toBe(0.75); // 3/4 命中
    });

    it("完全匹配时返回 1", () => {
      const content = "# 摘要\n## 背景\n## 分析\n## 结论";
      const expectedStructure = ["摘要", "背景", "分析", "结论"];
      const compliance = evaluator.calculateStructureCompliance(content, expectedStructure);
      expect(compliance).toBe(1);
    });
  });

  describe("calculateContentCoverage", () => {
    it("无关键词时返回 1", () => {
      const coverage = evaluator.calculateContentCoverage("任意内容", []);
      expect(coverage).toBe(1);
    });

    it("无内容时返回 0", () => {
      const coverage = evaluator.calculateContentCoverage("", ["关键词"]);
      expect(coverage).toBe(0);
    });

    it("应正确计算内容覆盖率", () => {
      const content = "这是一份关于市场分析的报告，包含竞品分析和趋势预测";
      const keywords = ["市场", "竞品", "趋势", "用户"];
      const coverage = evaluator.calculateContentCoverage(content, keywords);
      expect(coverage).toBe(0.75); // 3/4 命中
    });
  });

  describe("calculateCitationCompleteness", () => {
    it("期望 0 个引用时返回 1", () => {
      const completeness = evaluator.calculateCitationCompleteness([], 0);
      expect(completeness).toBe(1);
    });

    it("无引用时返回 0", () => {
      const completeness = evaluator.calculateCitationCompleteness([], 3);
      expect(completeness).toBe(0);
    });

    it("应正确计算引用完整性", () => {
      const citations = [{ id: 1 }, { id: 2 }];
      const completeness = evaluator.calculateCitationCompleteness(citations, 4);
      expect(completeness).toBe(0.5);
    });

    it("引用超过期望时返回 1", () => {
      const citations = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const completeness = evaluator.calculateCitationCompleteness(citations, 2);
      expect(completeness).toBe(1);
    });
  });

  describe("calculateFormatCompliance", () => {
    it("无内容时返回 0", () => {
      const compliance = evaluator.calculateFormatCompliance("");
      expect(compliance).toBe(0);
    });

    it("应检测标题格式", () => {
      const content = "# 报告标题\n内容";
      const compliance = evaluator.calculateFormatCompliance(content);
      expect(compliance).toBeGreaterThanOrEqual(0.25);
    });

    it("应检测引用标记", () => {
      const content = "这是内容 [来源1] 更多内容 [2]";
      const compliance = evaluator.calculateFormatCompliance(content);
      expect(compliance).toBeGreaterThanOrEqual(0.25);
    });

    it("完整格式应返回高分", () => {
      const content = `# 报告标题
## 摘要
内容 [来源1]
## 参考来源
[来源1] 文档名`;
      const compliance = evaluator.calculateFormatCompliance(content);
      expect(compliance).toBe(1);
    });
  });

  describe("evaluateReport", () => {
    it("应综合评估报告质量", () => {
      const testCase = {
        id: "test-1",
        input: "生成市场分析报告",
        expectedOutput: "",
        metadata: {
          expectedStructure: ["摘要", "背景", "分析", "结论"],
          keywords: ["市场", "竞品", "趋势"],
          expectedCitations: 2,
        },
      };

      const response = {
        content: `# 市场分析报告
## 摘要
市场概述 [来源1]
## 背景
背景信息
## 分析
竞品分析和趋势预测 [来源2]
## 结论
总结
## 参考来源
[来源1] 文档1
[来源2] 文档2`,
        citations: [{ id: 1 }, { id: 2 }],
      };

      const result = evaluator.evaluateReport(testCase, response);

      expect(result.structureCompliance).toBe(1);
      expect(result.contentCoverage).toBeGreaterThanOrEqual(0.66);
      expect(result.citationCompleteness).toBe(1);
      expect(result.formatCompliance).toBe(1);
      expect(result.passed).toBe(true);
    });
  });

  describe("runSingleTest", () => {
    it("应正确运行测试并返回结果", async () => {
      mockReportGenerator.mockResolvedValue({
        content: "# 报告\n## 摘要\n内容",
        citations: [{ id: 1 }],
      });

      const testCase = {
        id: "test-run-1",
        input: "生成报告",
        expectedOutput: "",
        metadata: {},
      };

      const result = await evaluator.runSingleTest(testCase);

      expect(result.id).toBe("test-run-1");
      expect(result.actualOutput).toBe("# 报告\n## 摘要\n内容");
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it("应正确处理错误", async () => {
      mockReportGenerator.mockRejectedValue(new Error("生成失败"));

      const testCase = {
        id: "test-error",
        input: "生成报告",
        expectedOutput: "",
        metadata: {},
      };

      const result = await evaluator.runSingleTest(testCase);

      expect(result.error).toBe("生成失败");
      expect(result.passed).toBe(false);
    });
  });
});

