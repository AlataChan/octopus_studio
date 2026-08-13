/**
 * Semantic Layer - 语义层检索集成
 *
 * 在 SQL 查询前先匹配指标字典，确认业务口径
 *
 * @module sql-agent/semanticLayer
 */

const {
  searchMetrics,
  generateMetricContext,
  listMetrics,
} = require("./metricDictionary");
const { validateSqlQuery } = require("./queryValidator");

/**
 * 从用户查询中提取可能的指标关键词
 * @param {string} query - 用户查询
 * @returns {string[]} 提取的关键词
 */
function extractMetricKeywords(query) {
  if (!query) return [];

  const keywords = new Set();

  // 常见的指标后缀模式 - 提取完整词
  const suffixPatterns = [
    /[\u4e00-\u9fa5]+率/g, // XX率
    /[\u4e00-\u9fa5]+额/g, // XX额
    /[\u4e00-\u9fa5]+量/g, // XX量
    /[\u4e00-\u9fa5]+数/g, // XX数
    /[\u4e00-\u9fa5]+值/g, // XX值
    /[\u4e00-\u9fa5]+价/g, // XX价
    /[\u4e00-\u9fa5]+比/g, // XX比
    /平均[\u4e00-\u9fa5]+/g, // 平均XX
    /总[\u4e00-\u9fa5]+/g, // 总XX
  ];

  for (const pattern of suffixPatterns) {
    const matches = query.match(pattern);
    if (matches) {
      matches.forEach((m) => keywords.add(m));
    }
  }

  // 添加原始查询中的名词短语（简单分词）
  const words = query.split(/[，。？！\s和与的]+/).filter((w) => w.length >= 2);
  words.forEach((w) => keywords.add(w));

  return Array.from(keywords);
}

/**
 * 匹配用户查询中的指标
 * @param {string} query - 用户查询
 * @returns {Object} { metrics: MetricDefinition[], context: string }
 */
function matchMetricsFromQuery(query) {
  const keywords = extractMetricKeywords(query);
  const matchedMetrics = new Map();

  // 对每个关键词搜索指标
  for (const keyword of keywords) {
    const results = searchMetrics(keyword);
    for (const metric of results) {
      if (!matchedMetrics.has(metric.id)) {
        matchedMetrics.set(metric.id, metric);
      }
    }
  }

  const metrics = Array.from(matchedMetrics.values());
  const metricIds = metrics.map((m) => m.id);
  const context = generateMetricContext(metricIds);

  return {
    metrics,
    context,
    keywords,
  };
}

/**
 * 生成增强的系统提示词
 * @param {string} userQuery - 用户查询
 * @param {Object} options - 选项
 * @returns {string} 增强的提示词
 */
function generateEnhancedPrompt(userQuery, options = {}) {
  const { includeAllMetrics = false, maxMetrics = 10 } = options;

  let metricsContext = "";

  if (includeAllMetrics) {
    // 包含所有指标
    const allMetrics = listMetrics();
    const metricIds = allMetrics.slice(0, maxMetrics).map((m) => m.id);
    metricsContext = generateMetricContext(metricIds);
  } else {
    // 只包含匹配的指标
    const { context } = matchMetricsFromQuery(userQuery);
    metricsContext = context;
  }

  const prompt = `
你是一个专业的数据分析助手，负责将用户的自然语言查询转换为 SQL 查询。

${metricsContext}

## 重要规则

1. **使用指标定义**: 如果用户查询涉及上述指标，必须使用指标定义中的计算公式
2. **确认口径**: 在生成 SQL 前，先确认用户想要的统计口径
3. **维度选择**: 根据用户需求选择合适的维度进行分组
4. **业务规则**: 遵循指标定义中的业务规则

## 用户查询
${userQuery}

请根据上述指标定义和规则，生成准确的 SQL 查询。
`.trim();

  return prompt;
}

/**
 * 验证 SQL 是否符合指标定义
 * @param {string} sql - 生成的 SQL
 * @param {string[]} metricIds - 期望使用的指标 ID
 * @returns {Object} { valid: boolean, warnings: string[] }
 */
function validateSqlAgainstMetrics(sql, metricIds = [], options = {}) {
  const warnings = [];
  const queryValidation = validateSqlQuery({
    sql,
    allowWrites: options.allowWrites === true,
    dialect: options.dialect || "postgresql",
    defaultRowLimit: options.defaultRowLimit || 1000,
  });

  if (!queryValidation.ok) {
    return {
      valid: false,
      warnings,
      error: queryValidation.error,
      code: queryValidation.code,
    };
  }

  // 这里保留指标口径验证扩展点；结构安全已由 AST 校验器完成。
  // 例如未来可以检查 SQL 中是否使用了正确的指标公式。

  for (const _metricId of metricIds) {
    // 简单检查：指标名称是否出现在 SQL 中
    // 实际应用中可能需要更复杂的 AST 分析
  }

  return {
    valid: warnings.length === 0,
    warnings,
    normalizedSql: queryValidation.normalizedSql,
  };
}

/**
 * 创建语义层增强的查询处理器
 * @param {Object} options - 配置选项
 * @returns {Object} 查询处理器
 */
function createSemanticQueryProcessor(options = {}) {
  return {
    /**
     * 预处理用户查询
     * @param {string} query - 用户查询
     * @returns {Object} 预处理结果
     */
    preprocess(query) {
      const { metrics, context, keywords } = matchMetricsFromQuery(query);

      return {
        originalQuery: query,
        matchedMetrics: metrics,
        metricContext: context,
        extractedKeywords: keywords,
        enhancedPrompt: generateEnhancedPrompt(query, options),
      };
    },

    /**
     * 后处理 SQL 结果
     * @param {string} sql - 生成的 SQL
     * @param {Object} preprocessResult - 预处理结果
     * @returns {Object} 后处理结果
     */
    postprocess(sql, preprocessResult) {
      const metricIds = preprocessResult.matchedMetrics.map((m) => m.id);
      const validation = validateSqlAgainstMetrics(sql, metricIds, options);

      return {
        sql: validation.normalizedSql || sql,
        validation,
        usedMetrics: preprocessResult.matchedMetrics,
        metadata: {
          keywords: preprocessResult.extractedKeywords,
          metricsCount: metricIds.length,
        },
      };
    },
  };
}

module.exports = {
  extractMetricKeywords,
  matchMetricsFromQuery,
  generateEnhancedPrompt,
  validateSqlAgainstMetrics,
  createSemanticQueryProcessor,
};
