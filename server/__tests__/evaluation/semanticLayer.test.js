/* eslint-env jest */
const {
  extractMetricKeywords,
  matchMetricsFromQuery,
  generateEnhancedPrompt,
  createSemanticQueryProcessor,
} = require("../../utils/agents/aibitat/plugins/sql-agent/semanticLayer");
const { createMetric, clearMetrics } = require("../../utils/agents/aibitat/plugins/sql-agent/metricDictionary");

describe("SemanticLayer", () => {
  beforeEach(() => {
    clearMetrics();
    // 创建测试指标
    createMetric({
      id: "revenue",
      name: "营业收入",
      alias: ["收入", "销售额"],
      description: "公司主营业务收入总额",
      formula: "SUM(amount)",
      unit: "元",
      tables: ["orders"],
      dimensions: ["date", "product", "region"],
    });
    createMetric({
      id: "conversion_rate",
      name: "转化率",
      alias: ["转换率"],
      description: "访客转化为客户的比率",
      formula: "COUNT(DISTINCT buyer_id) / COUNT(DISTINCT visitor_id) * 100",
      unit: "%",
      tables: ["visits", "orders"],
      dimensions: ["date", "channel"],
    });
    createMetric({
      id: "avg_order_value",
      name: "平均订单金额",
      alias: ["客单价"],
      description: "每笔订单的平均金额",
      formula: "AVG(amount)",
      unit: "元",
      tables: ["orders"],
      dimensions: ["date", "product"],
    });
  });

  describe("extractMetricKeywords", () => {
    it("应提取率类指标", () => {
      const keywords = extractMetricKeywords("查询转化率和复购率");
      // 检查是否包含带"率"的关键词
      expect(keywords.some((k) => k.includes("转化率"))).toBe(true);
      expect(keywords.some((k) => k.includes("复购率"))).toBe(true);
    });

    it("应提取额类指标", () => {
      const keywords = extractMetricKeywords("统计销售额和退款额");
      // 检查是否包含带"额"的关键词
      expect(keywords.some((k) => k.includes("销售额"))).toBe(true);
      expect(keywords.some((k) => k.includes("退款额"))).toBe(true);
    });

    it("应提取平均类指标", () => {
      const keywords = extractMetricKeywords("计算平均订单金额");
      expect(keywords.some((k) => k.includes("平均"))).toBe(true);
    });

    it("空查询返回空数组", () => {
      expect(extractMetricKeywords("")).toEqual([]);
      expect(extractMetricKeywords(null)).toEqual([]);
    });
  });

  describe("matchMetricsFromQuery", () => {
    it("应匹配查询中的指标", () => {
      const result = matchMetricsFromQuery("查询上个月的营业收入");

      expect(result.metrics.length).toBeGreaterThan(0);
      expect(result.metrics.some((m) => m.id === "revenue")).toBe(true);
    });

    it("应匹配别名", () => {
      // 直接搜索别名
      const result = matchMetricsFromQuery("客单价");

      expect(result.metrics.some((m) => m.id === "avg_order_value")).toBe(true);
    });

    it("应生成上下文", () => {
      // 直接搜索指标名称
      const result = matchMetricsFromQuery("转化率");

      expect(result.context).toContain("转化率");
      expect(result.context).toContain("COUNT");
    });

    it("无匹配时返回空", () => {
      const result = matchMetricsFromQuery("今天天气怎么样");

      expect(result.metrics).toHaveLength(0);
    });
  });

  describe("generateEnhancedPrompt", () => {
    it("应生成包含指标上下文的提示词", () => {
      // 直接搜索指标名称
      const prompt = generateEnhancedPrompt("营业收入");

      expect(prompt).toContain("营业收入");
      expect(prompt).toContain("SUM(amount)");
      expect(prompt).toContain("用户查询");
    });

    it("应包含重要规则", () => {
      const prompt = generateEnhancedPrompt("查询转化率");

      expect(prompt).toContain("使用指标定义");
      expect(prompt).toContain("确认口径");
    });
  });

  describe("createSemanticQueryProcessor", () => {
    it("应预处理查询", () => {
      const processor = createSemanticQueryProcessor();
      // 直接搜索指标名称
      const result = processor.preprocess("营业收入");

      expect(result.originalQuery).toBe("营业收入");
      expect(result.matchedMetrics.length).toBeGreaterThan(0);
      expect(result.enhancedPrompt).toBeDefined();
    });

    it("应后处理 SQL", () => {
      const processor = createSemanticQueryProcessor();
      const preprocessResult = processor.preprocess("查询营业收入");
      const postResult = processor.postprocess(
        "SELECT SUM(amount) FROM orders",
        preprocessResult
      );

      expect(postResult.sql).toBeDefined();
      expect(postResult.validation).toBeDefined();
      expect(postResult.usedMetrics).toBeDefined();
    });

    it("应记录元数据", () => {
      const processor = createSemanticQueryProcessor();
      const preprocessResult = processor.preprocess("查询转化率");
      const postResult = processor.postprocess(
        "SELECT COUNT(*) FROM orders",
        preprocessResult
      );

      expect(postResult.metadata.keywords).toBeDefined();
      expect(postResult.metadata.metricsCount).toBeGreaterThanOrEqual(0);
    });
  });
});

