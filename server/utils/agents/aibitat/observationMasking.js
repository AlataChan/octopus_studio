/**
 * Observation Masking - 工具结果压缩模块
 *
 * Phase 3: Context Engineering - Tool Result 压缩
 *
 * 目的：
 * - 减少工具调用结果占用的 token 数量
 * - 保留关键信息，过滤冗余数据
 * - 根据工具类型应用不同的压缩策略
 *
 * @module observationMasking
 */

/**
 * 压缩配置
 */
const COMPRESSION_CONFIG = {
  // 是否启用压缩
  enabled: true,
  // 触发压缩的最小字符数
  minCharsToCompress: 500,
  // 压缩后的最大字符数
  maxCompressedChars: 2000,
  // JSON 数组的最大保留条目数
  maxArrayItems: 10,
  // JSON 对象的最大深度
  maxObjectDepth: 3,
  // 长字符串截断长度
  maxStringLength: 500,
  // 日志级别: 'none' | 'basic' | 'verbose'
  logLevel: "basic",
};

/**
 * 工具特定的压缩规则
 */
const TOOL_COMPRESSION_RULES = {
  // 搜索工具：保留前 N 条结果
  "web-search": {
    maxItems: 5,
    keepFields: ["title", "url", "snippet"],
    removeFields: ["raw_html", "cached_page"],
  },
  // 代码搜索：保留文件名和匹配行
  "code-search": {
    maxItems: 10,
    keepFields: ["file", "line", "content", "match"],
    removeFields: ["full_content", "surrounding_context"],
  },
  // 文件读取：截断长内容
  "read-file": {
    maxContentLength: 3000,
    addTruncationNote: true,
  },
  // 数据库查询：限制返回行数
  "database-query": {
    maxRows: 20,
    keepFields: null, // 保留所有字段
  },
  // API 调用：移除响应头和元数据
  "api-call": {
    keepFields: ["data", "status", "message"],
    removeFields: ["headers", "config", "request", "raw_response"],
  },
  // 默认规则
  default: {
    maxItems: 10,
    maxContentLength: 2000,
  },
};

/**
 * 估算文本的 token 数量
 * @param {string} text - 文本内容
 * @returns {number} 估算的 token 数
 */
function estimateTokens(text) {
  if (!text) return 0;
  // 简单估算：中文约 1.5 字符/token，英文约 4 字符/token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * 截断字符串
 * @param {string} str - 原始字符串
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的字符串
 */
function truncateString(str, maxLength) {
  if (!str || str.length <= maxLength) return str;
  return (
    str.substring(0, maxLength) +
    `... [truncated, ${str.length - maxLength} chars omitted]`
  );
}

function resolveMaxResultTokens(value) {
  const cap = Math.floor(Number(value));
  return Number.isFinite(cap) && cap > 0 ? cap : null;
}

function stringifyForTokenCap(value) {
  if (typeof value === "string") return value;
  const json = JSON.stringify(value);
  return typeof json === "string" ? json : String(value ?? "");
}

function hardCapToTokens(text, cap) {
  let low = 0;
  let high = text.length;
  let best = "";

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.slice(0, mid);
    if (estimateTokens(candidate) <= cap) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function capToTokens(value, cap) {
  const text = stringifyForTokenCap(value);
  if (estimateTokens(text) <= cap) return text;

  let low = 0;
  let high = Math.min(text.length, cap * 4);
  let best = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const omitted = text.length - mid;
    const candidate =
      text.slice(0, mid) + `... [truncated, ${omitted} chars omitted]`;

    if (estimateTokens(candidate) <= cap) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best || hardCapToTokens(text, cap);
}

function addCappedStats(stats, compressed, maxResultTokens) {
  if (!maxResultTokens) return stats;
  return {
    ...stats,
    compressedLength: compressed.length,
    compressedTokens: estimateTokens(compressed),
  };
}

/**
 * 压缩 JSON 数组
 * @param {Array} arr - 原始数组
 * @param {number} maxItems - 最大条目数
 * @param {Object} rules - 压缩规则
 * @returns {Array} 压缩后的数组
 */
function compressArray(arr, maxItems, rules = {}) {
  if (!Array.isArray(arr)) return arr;

  const { keepFields, removeFields } = rules;
  let result = arr.slice(0, maxItems);

  // 对每个元素应用字段过滤
  if (keepFields || removeFields) {
    result = result.map((item) => {
      if (typeof item !== "object" || item === null) return item;

      if (keepFields) {
        const filtered = {};
        for (const field of keepFields) {
          if (item[field] !== undefined) {
            filtered[field] = item[field];
          }
        }
        return filtered;
      }

      if (removeFields) {
        const filtered = { ...item };
        for (const field of removeFields) {
          delete filtered[field];
        }
        return filtered;
      }

      return item;
    });
  }

  // 如果原数组被截断，添加提示
  if (arr.length > maxItems) {
    result.push({
      _truncated: true,
      _message: `${arr.length - maxItems} more items omitted`,
      _totalCount: arr.length,
    });
  }

  return result;
}

/**
 * 递归压缩 JSON 对象
 * @param {any} obj - 原始对象
 * @param {number} depth - 当前深度
 * @param {Object} rules - 压缩规则
 * @returns {any} 压缩后的对象
 */
function compressObject(obj, depth = 0, rules = {}) {
  if (obj === null || obj === undefined) return obj;

  // 处理字符串
  if (typeof obj === "string") {
    const maxLen = rules.maxContentLength || COMPRESSION_CONFIG.maxStringLength;
    return truncateString(obj, maxLen);
  }

  // 处理数组
  if (Array.isArray(obj)) {
    const maxItems = rules.maxItems || COMPRESSION_CONFIG.maxArrayItems;
    const compressed = compressArray(obj, maxItems, rules);
    return compressed.map((item) => compressObject(item, depth + 1, rules));
  }

  // 处理对象
  if (typeof obj === "object") {
    // 检查深度限制
    if (depth >= COMPRESSION_CONFIG.maxObjectDepth) {
      return "[object, depth limit reached]";
    }

    const { keepFields, removeFields } = rules;
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
      // 应用字段过滤
      if (keepFields && !keepFields.includes(key)) continue;
      if (removeFields && removeFields.includes(key)) continue;

      result[key] = compressObject(value, depth + 1, rules);
    }

    return result;
  }

  // 其他类型直接返回
  return obj;
}

/**
 * 尝试解析 JSON
 * @param {string} str - 可能是 JSON 的字符串
 * @returns {{ isJson: boolean, data: any }} 解析结果
 */
function tryParseJson(str) {
  if (typeof str !== "string") return { isJson: false, data: str };

  try {
    const trimmed = str.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      return { isJson: true, data: JSON.parse(trimmed) };
    }
  } catch {
    // 不是有效 JSON
  }
  return { isJson: false, data: str };
}

/**
 * 压缩工具结果
 * @param {string} toolName - 工具名称
 * @param {string} result - 工具返回结果
 * @param {Object} options - 压缩选项
 * @returns {{ compressed: string, stats: Object }} 压缩后的结果和统计信息
 */
function compressToolResult(toolName, result, options = {}) {
  const maxResultTokens = resolveMaxResultTokens(options.maxResultTokens);
  const capCompressed = (value) =>
    maxResultTokens ? capToTokens(value, maxResultTokens) : value;

  if (!COMPRESSION_CONFIG.enabled) {
    const compressed = capCompressed(result);
    return {
      compressed,
      stats: addCappedStats(
        { skipped: true, reason: "disabled" },
        compressed,
        maxResultTokens
      ),
    };
  }

  if (!result || result.length < COMPRESSION_CONFIG.minCharsToCompress) {
    const compressed = capCompressed(result);
    return {
      compressed,
      stats: addCappedStats(
        {
          skipped: true,
          reason: "below threshold",
          originalLength: result?.length || 0,
        },
        compressed,
        maxResultTokens
      ),
    };
  }

  const originalLength = result.length;
  const originalTokens = estimateTokens(result);

  // 获取工具特定规则或默认规则
  const rules =
    TOOL_COMPRESSION_RULES[toolName] || TOOL_COMPRESSION_RULES.default;

  // 尝试解析 JSON
  const { isJson, data } = tryParseJson(result);

  let compressed;
  if (isJson) {
    // JSON 结构化压缩
    const compressedData = compressObject(data, 0, rules);
    compressed = JSON.stringify(compressedData, null, 2);
  } else {
    // 纯文本截断
    const maxLen =
      rules.maxContentLength || COMPRESSION_CONFIG.maxCompressedChars;
    compressed = truncateString(result, maxLen);
  }

  // 确保最终结果不超过最大限制
  if (compressed.length > COMPRESSION_CONFIG.maxCompressedChars) {
    compressed = truncateString(
      compressed,
      COMPRESSION_CONFIG.maxCompressedChars
    );
  }

  compressed = capCompressed(compressed);

  const compressedLength = compressed.length;
  const compressedTokens = estimateTokens(compressed);
  const compressionRatio = (
    (1 - compressedLength / originalLength) *
    100
  ).toFixed(1);

  const stats = {
    toolName,
    originalLength,
    compressedLength,
    originalTokens,
    compressedTokens,
    compressionRatio: `${compressionRatio}%`,
    isJson,
  };

  if (COMPRESSION_CONFIG.logLevel !== "none") {
    console.log(
      `[ObservationMasking] ${toolName}: ${originalLength} -> ${compressedLength} chars (${compressionRatio}% reduction)`
    );
  }

  return { compressed, stats };
}

/**
 * 创建压缩中间件
 * 用于在工具结果注入到消息历史之前进行压缩
 *
 * @param {Object} options - 配置选项
 * @returns {Function} 中间件函数
 */
function createCompressionMiddleware(options = {}) {
  // 合并配置
  const config = { ...COMPRESSION_CONFIG, ...options };

  return function compressResult(toolName, result) {
    if (!config.enabled) return result;

    try {
      const { compressed } = compressToolResult(toolName, result);
      return compressed;
    } catch (error) {
      console.error(
        `[ObservationMasking] Error compressing result for ${toolName}:`,
        error
      );
      return result; // 压缩失败时返回原始结果
    }
  };
}

/**
 * 批量压缩多个工具结果
 * @param {Array<{ name: string, result: string }>} toolResults - 工具结果数组
 * @returns {Array<{ name: string, compressed: string, stats: Object }>} 压缩后的结果数组
 */
function compressBatch(toolResults) {
  return toolResults.map(({ name, result }) => {
    const { compressed, stats } = compressToolResult(name, result);
    return { name, compressed, stats };
  });
}

/**
 * 更新压缩配置
 * @param {Object} newConfig - 新配置
 */
function updateConfig(newConfig) {
  Object.assign(COMPRESSION_CONFIG, newConfig);
}

/**
 * 添加工具特定规则
 * @param {string} toolName - 工具名称
 * @param {Object} rules - 压缩规则
 */
function addToolRule(toolName, rules) {
  TOOL_COMPRESSION_RULES[toolName] = rules;
}

module.exports = {
  compressToolResult,
  createCompressionMiddleware,
  compressBatch,
  updateConfig,
  addToolRule,
  estimateTokens,
  COMPRESSION_CONFIG,
  TOOL_COMPRESSION_RULES,
};
