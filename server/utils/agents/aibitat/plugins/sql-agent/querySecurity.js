/**
 * SQL Query Security - 查询安全增强模块
 *
 * 提供 SQL 查询的安全增强功能：
 * - LIMIT 强制
 * - 超时控制
 * - 只读强制
 * - 敏感字段脱敏
 *
 * @module sql-agent/querySecurity
 */

/**
 * 默认安全配置
 */
const DEFAULT_SECURITY_CONFIG = {
  maxLimit: 1000, // 最大返回行数
  defaultLimit: 100, // 默认返回行数
  queryTimeout: 30000, // 查询超时（毫秒）
  allowedStatements: ["SELECT"], // 允许的语句类型
  sensitiveFields: [], // 敏感字段列表
  maskPattern: "***", // 脱敏模式
};

/**
 * 危险关键字列表
 */
const DANGEROUS_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "TRUNCATE",
  "ALTER",
  "CREATE",
  "GRANT",
  "REVOKE",
  "EXEC",
  "EXECUTE",
  "CALL",
  "INTO OUTFILE",
  "INTO DUMPFILE",
  "LOAD_FILE",
  "BENCHMARK",
  "SLEEP",
  "WAITFOR",
];

/**
 * 验证 SQL 查询是否安全
 * @param {string} query - SQL 查询语句
 * @param {Object} config - 安全配置
 * @returns {Object} { valid: boolean, error: string|null, warnings: string[] }
 */
function validateQuery(query, config = {}) {
  const securityConfig = { ...DEFAULT_SECURITY_CONFIG, ...config };
  const result = { valid: true, error: null, warnings: [] };

  if (!query || typeof query !== "string") {
    return { valid: false, error: "查询语句不能为空", warnings: [] };
  }

  const upperQuery = query.toUpperCase().trim();

  // 检查是否为允许的语句类型
  const isAllowedStatement = securityConfig.allowedStatements.some((stmt) =>
    upperQuery.startsWith(stmt)
  );

  if (!isAllowedStatement) {
    return {
      valid: false,
      error: `只允许执行 ${securityConfig.allowedStatements.join(", ")} 语句`,
      warnings: [],
    };
  }

  // 检查危险关键字
  for (const keyword of DANGEROUS_KEYWORDS) {
    if (upperQuery.includes(keyword)) {
      return {
        valid: false,
        error: `查询包含不允许的关键字: ${keyword}`,
        warnings: [],
      };
    }
  }

  // 检查是否有 LIMIT
  if (!upperQuery.includes("LIMIT")) {
    result.warnings.push(
      `查询未指定 LIMIT，将自动添加 LIMIT ${securityConfig.defaultLimit}`
    );
  }

  // 检查注释（可能用于注入）
  if (query.includes("--") || query.includes("/*")) {
    result.warnings.push("查询包含注释，请确保不是注入攻击");
  }

  return result;
}

/**
 * 强制添加 LIMIT 子句
 * @param {string} query - SQL 查询语句
 * @param {number} maxLimit - 最大限制
 * @param {number} defaultLimit - 默认限制
 * @returns {string} 处理后的查询
 */
function enforceLimit(query, maxLimit = 1000, defaultLimit = 100) {
  const upperQuery = query.toUpperCase();

  // 检查是否已有 LIMIT
  const limitMatch = upperQuery.match(/LIMIT\s+(\d+)/i);

  if (limitMatch) {
    const currentLimit = parseInt(limitMatch[1], 10);
    if (currentLimit > maxLimit) {
      // 替换为最大限制
      return query.replace(/LIMIT\s+\d+/i, `LIMIT ${maxLimit}`);
    }
    return query;
  }

  // 添加默认 LIMIT
  return `${query.trim()} LIMIT ${defaultLimit}`;
}

/**
 * 对敏感字段进行脱敏
 * @param {Array} rows - 查询结果行
 * @param {Array} sensitiveFields - 敏感字段列表
 * @param {string} maskPattern - 脱敏模式
 * @returns {Array} 脱敏后的结果
 */
function maskSensitiveFields(rows, sensitiveFields = [], maskPattern = "***") {
  if (!rows || rows.length === 0 || sensitiveFields.length === 0) {
    return rows;
  }

  const sensitiveSet = new Set(sensitiveFields.map((f) => f.toLowerCase()));

  return rows.map((row) => {
    const maskedRow = { ...row };
    for (const key of Object.keys(maskedRow)) {
      if (sensitiveSet.has(key.toLowerCase())) {
        maskedRow[key] = maskPattern;
      }
    }
    return maskedRow;
  });
}

/**
 * 安全执行查询的包装器
 * @param {Function} queryFn - 原始查询函数
 * @param {string} query - SQL 查询
 * @param {Object} config - 安全配置
 * @returns {Promise<Object>} 查询结果
 */
async function secureQueryWrapper(queryFn, query, config = {}) {
  const securityConfig = { ...DEFAULT_SECURITY_CONFIG, ...config };

  // 验证查询
  const validation = validateQuery(query, securityConfig);
  if (!validation.valid) {
    return { rows: [], count: 0, error: validation.error };
  }

  // 强制 LIMIT
  const safeQuery = enforceLimit(
    query,
    securityConfig.maxLimit,
    securityConfig.defaultLimit
  );

  // 执行查询（带超时）
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("查询超时")),
      securityConfig.queryTimeout
    );
  });

  try {
    const result = await Promise.race([queryFn(safeQuery), timeoutPromise]);

    // 脱敏处理
    if (result.rows && securityConfig.sensitiveFields.length > 0) {
      result.rows = maskSensitiveFields(
        result.rows,
        securityConfig.sensitiveFields,
        securityConfig.maskPattern
      );
    }

    return result;
  } catch (error) {
    return { rows: [], count: 0, error: error.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  DEFAULT_SECURITY_CONFIG,
  DANGEROUS_KEYWORDS,
  validateQuery,
  enforceLimit,
  maskSensitiveFields,
  secureQueryWrapper,
};
