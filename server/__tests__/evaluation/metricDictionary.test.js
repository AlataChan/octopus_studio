/* eslint-env jest */
const {
  createMetric,
  getMetric,
  updateMetric,
  deleteMetric,
  listMetrics,
  searchMetrics,
  generateMetricSql,
  generateMetricContext,
  clearMetrics,
} = require("../../utils/agents/aibitat/plugins/sql-agent/metricDictionary");

describe("MetricDictionary", () => {
  beforeEach(() => {
    clearMetrics();
  });

  describe("createMetric", () => {
    it("应创建指标定义", () => {
      const metric = createMetric({
        id: "revenue",
        name: "营业收入",
        description: "公司主营业务收入总额",
        formula: "SUM(amount)",
        unit: "元",
        category: "财务",
        tables: ["orders"],
        dimensions: ["date", "product", "region"],
      });

      expect(metric.id).toBe("revenue");
      expect(metric.name).toBe("营业收入");
      expect(metric.formula).toBe("SUM(amount)");
    });

    it("应自动生成 ID", () => {
      const metric = createMetric({ name: "测试指标" });
      expect(metric.id).toMatch(/^metric-\d+$/);
    });
  });

  describe("getMetric", () => {
    it("应获取已存在的指标", () => {
      createMetric({ id: "test", name: "测试" });
      const metric = getMetric("test");
      expect(metric.name).toBe("测试");
    });

    it("不存在时返回 null", () => {
      expect(getMetric("nonexistent")).toBeNull();
    });
  });

  describe("updateMetric", () => {
    it("应更新指标", () => {
      createMetric({ id: "test", name: "原名称" });
      const updated = updateMetric("test", { name: "新名称" });

      expect(updated.name).toBe("新名称");
      expect(updated.id).toBe("test");
    });

    it("不存在时返回 null", () => {
      expect(updateMetric("nonexistent", {})).toBeNull();
    });
  });

  describe("deleteMetric", () => {
    it("应删除指标", () => {
      createMetric({ id: "test", name: "测试" });
      expect(deleteMetric("test")).toBe(true);
      expect(getMetric("test")).toBeNull();
    });

    it("不存在时返回 false", () => {
      expect(deleteMetric("nonexistent")).toBe(false);
    });
  });

  describe("listMetrics", () => {
    beforeEach(() => {
      createMetric({ id: "m1", name: "指标1", category: "财务", tables: ["orders"] });
      createMetric({ id: "m2", name: "指标2", category: "运营", tables: ["users"] });
      createMetric({ id: "m3", name: "指标3", category: "财务", tables: ["orders"] });
    });

    it("应列出所有指标", () => {
      const metrics = listMetrics();
      expect(metrics).toHaveLength(3);
    });

    it("应按分类过滤", () => {
      const metrics = listMetrics({ category: "财务" });
      expect(metrics).toHaveLength(2);
    });

    it("应按表过滤", () => {
      const metrics = listMetrics({ table: "orders" });
      expect(metrics).toHaveLength(2);
    });
  });

  describe("searchMetrics", () => {
    beforeEach(() => {
      createMetric({
        id: "revenue",
        name: "营业收入",
        alias: ["收入", "销售额"],
        description: "公司主营业务收入",
      });
      createMetric({
        id: "profit",
        name: "净利润",
        alias: ["利润"],
        description: "扣除成本后的利润",
      });
    });

    it("应按名称搜索", () => {
      const results = searchMetrics("营业");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("revenue");
    });

    it("应按别名搜索", () => {
      const results = searchMetrics("销售额");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("revenue");
    });

    it("应按描述搜索", () => {
      const results = searchMetrics("成本");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("profit");
    });

    it("空查询返回空数组", () => {
      expect(searchMetrics("")).toEqual([]);
    });
  });

  describe("generateMetricSql", () => {
    it("应生成 SQL 片段", () => {
      createMetric({
        id: "revenue",
        name: "营业收入",
        formula: "SUM(amount)",
        unit: "元",
      });

      const result = generateMetricSql("revenue");

      expect(result.sql).toContain("SUM(amount)");
      expect(result.sql).toContain("营业收入");
      expect(result.unit).toBe("元");
    });

    it("不存在时返回错误", () => {
      const result = generateMetricSql("nonexistent");
      expect(result.error).toBeDefined();
    });
  });

  describe("generateMetricContext", () => {
    it("应生成 LLM 上下文", () => {
      createMetric({
        id: "revenue",
        name: "营业收入",
        description: "公司主营业务收入",
        formula: "SUM(amount)",
        unit: "元",
        tables: ["orders"],
        dimensions: ["date", "product"],
        businessRules: { 统计口径: "含税金额" },
      });

      const context = generateMetricContext(["revenue"]);

      expect(context).toContain("营业收入");
      expect(context).toContain("SUM(amount)");
      expect(context).toContain("orders");
      expect(context).toContain("统计口径");
    });

    it("空列表返回提示", () => {
      const context = generateMetricContext([]);
      expect(context).toContain("未找到");
    });
  });
});

