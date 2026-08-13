/**
 * Metric Dictionary - 指标字典语义层
 *
 * 提供业务指标的语义定义，帮助 LLM 理解业务口径
 *
 * @module sql-agent/metricDictionary
 */

/**
 * 指标定义结构
 * @typedef {Object} MetricDefinition
 * @property {string} id - 指标唯一标识
 * @property {string} name - 指标名称
 * @property {string} alias - 指标别名（用于匹配用户查询）
 * @property {string} description - 指标描述
 * @property {string} formula - 计算公式（SQL 表达式）
 * @property {string} unit - 单位
 * @property {string} category - 分类
 * @property {string[]} tables - 相关表
 * @property {string[]} dimensions - 可用维度
 * @property {Object} businessRules - 业务规则
 */

/**
 * 内存中的指标字典存储
 * 实际生产环境应使用数据库存储
 */
const metricStore = new Map();

/**
 * 创建指标定义
 * @param {MetricDefinition} metric - 指标定义
 * @returns {MetricDefinition} 创建的指标
 */
function createMetric(metric) {
  const id = metric.id || `metric-${Date.now()}`;
  const fullMetric = {
    id,
    name: metric.name || "",
    alias: metric.alias || [],
    description: metric.description || "",
    formula: metric.formula || "",
    unit: metric.unit || "",
    category: metric.category || "default",
    tables: metric.tables || [],
    dimensions: metric.dimensions || [],
    businessRules: metric.businessRules || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  metricStore.set(id, fullMetric);
  return fullMetric;
}

/**
 * 获取指标定义
 * @param {string} id - 指标 ID
 * @returns {MetricDefinition|null} 指标定义
 */
function getMetric(id) {
  return metricStore.get(id) || null;
}

/**
 * 更新指标定义
 * @param {string} id - 指标 ID
 * @param {Partial<MetricDefinition>} updates - 更新内容
 * @returns {MetricDefinition|null} 更新后的指标
 */
function updateMetric(id, updates) {
  const existing = metricStore.get(id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...updates,
    id, // 保持 ID 不变
    updatedAt: new Date().toISOString(),
  };

  metricStore.set(id, updated);
  return updated;
}

/**
 * 删除指标定义
 * @param {string} id - 指标 ID
 * @returns {boolean} 是否删除成功
 */
function deleteMetric(id) {
  return metricStore.delete(id);
}

/**
 * 列出所有指标
 * @param {Object} filter - 过滤条件
 * @returns {MetricDefinition[]} 指标列表
 */
function listMetrics(filter = {}) {
  let metrics = Array.from(metricStore.values());

  if (filter.category) {
    metrics = metrics.filter((m) => m.category === filter.category);
  }

  if (filter.table) {
    metrics = metrics.filter((m) => m.tables.includes(filter.table));
  }

  return metrics;
}

/**
 * 根据名称或别名搜索指标
 * @param {string} query - 搜索词
 * @returns {MetricDefinition[]} 匹配的指标
 */
function searchMetrics(query) {
  if (!query) return [];

  const lowerQuery = query.toLowerCase();
  return Array.from(metricStore.values()).filter((metric) => {
    // 匹配名称
    if (metric.name.toLowerCase().includes(lowerQuery)) return true;

    // 匹配别名
    if (Array.isArray(metric.alias)) {
      if (metric.alias.some((a) => a.toLowerCase().includes(lowerQuery)))
        return true;
    }

    // 匹配描述
    if (metric.description.toLowerCase().includes(lowerQuery)) return true;

    return false;
  });
}

/**
 * 生成指标的 SQL 片段
 * @param {string} metricId - 指标 ID
 * @param {Object} options - 选项
 * @returns {Object} { sql: string, description: string }
 */
function generateMetricSql(metricId, options = {}) {
  const metric = metricStore.get(metricId);
  if (!metric) {
    return { sql: null, description: null, error: "指标不存在" };
  }

  const { alias = metric.name, groupBy = [] } = options;

  let sql = `${metric.formula} AS "${alias}"`;

  return {
    sql,
    description: metric.description,
    unit: metric.unit,
    businessRules: metric.businessRules,
  };
}

/**
 * 为 LLM 生成指标上下文
 * @param {string[]} metricIds - 指标 ID 列表
 * @returns {string} 指标上下文描述
 */
function generateMetricContext(metricIds = []) {
  const metrics = metricIds.map((id) => metricStore.get(id)).filter(Boolean);

  if (metrics.length === 0) {
    return "未找到相关指标定义。";
  }

  const lines = ["## 相关指标定义\n"];

  for (const metric of metrics) {
    lines.push(`### ${metric.name}`);
    lines.push(`- **描述**: ${metric.description}`);
    lines.push(`- **计算公式**: \`${metric.formula}\``);
    lines.push(`- **单位**: ${metric.unit}`);
    lines.push(`- **相关表**: ${metric.tables.join(", ")}`);
    lines.push(`- **可用维度**: ${metric.dimensions.join(", ")}`);

    if (Object.keys(metric.businessRules).length > 0) {
      lines.push(`- **业务规则**:`);
      for (const [key, value] of Object.entries(metric.businessRules)) {
        lines.push(`  - ${key}: ${value}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * 清空指标字典（用于测试）
 */
function clearMetrics() {
  metricStore.clear();
}

module.exports = {
  createMetric,
  getMetric,
  updateMetric,
  deleteMetric,
  listMetrics,
  searchMetrics,
  generateMetricSql,
  generateMetricContext,
  clearMetrics,
};
