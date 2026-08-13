/**
 * @fileoverview 工具超时配置和保护机制
 * @description 为每个工具定义超时时间，提供全局超时保护
 *
 * 优化方案 G: 工具调用超时保护
 * - 防止工具卡死导致整个会话阻塞
 * - 超时后 LLM 可以自动切换策略
 * - 用户体验改善（不会无限等待）
 */

const { TimeoutManager } = require("./timeout");

/**
 * 工具超时配置（毫秒）
 * 可通过环境变量覆盖
 */
const TOOL_TIMEOUTS = {
  // 网络相关工具
  "web-scraping": parseInt(process.env.TIMEOUT_WEB_SCRAPING) || 30000,
  "web-browsing": parseInt(process.env.TIMEOUT_WEB_BROWSING) || 20000,

  // 知识检索工具
  "rag-memory": parseInt(process.env.TIMEOUT_RAG_MEMORY) || 15000,
  "knowledge-graph": parseInt(process.env.TIMEOUT_KNOWLEDGE_GRAPH) || 15000,

  // MCP Hub broker tool (may block on HITL approvals)
  mcp_hub: parseInt(process.env.TIMEOUT_MCP_HUB) || 360000, // 6 minutes

  // 数据库工具
  "sql-agent#query": parseInt(process.env.TIMEOUT_SQL_QUERY) || 20000,
  "sql-agent#list-database-connections":
    parseInt(process.env.TIMEOUT_SQL_LIST) || 10000,
  "sql-agent#list-tables": parseInt(process.env.TIMEOUT_SQL_TABLES) || 10000,
  "sql-agent#get-table-schema":
    parseInt(process.env.TIMEOUT_SQL_SCHEMA) || 10000,
  "duckdb-agent#query": parseInt(process.env.TIMEOUT_DUCKDB_QUERY) || 20000,
  "duckdb-agent#list-files": parseInt(process.env.TIMEOUT_DUCKDB_LIST) || 10000,
  "duckdb-agent#get-file-schema":
    parseInt(process.env.TIMEOUT_DUCKDB_SCHEMA) || 10000,

  // 文档生成工具
  "generate-excel-report": parseInt(process.env.TIMEOUT_EXCEL_REPORT) || 60000,
  "generate-presentation": parseInt(process.env.TIMEOUT_PRESENTATION) || 60000,
  "generate-pdf-document": parseInt(process.env.TIMEOUT_PDF_DOCUMENT) || 60000,
  "generate-official-document":
    parseInt(process.env.TIMEOUT_OFFICIAL_DOCUMENT) || 60000,
  "create-chart": parseInt(process.env.TIMEOUT_CREATE_CHART) || 30000,

  // PPT 生成工具（内部需要调用 LLM，需要更长超时）
  "ppt-outline-flow": parseInt(process.env.TIMEOUT_PPT_OUTLINE) || 180000, // 3 分钟
  "ppt-generate-flow": parseInt(process.env.TIMEOUT_PPT_GENERATE) || 300000, // 5 分钟

  // 文档处理工具
  "document-summarizer": parseInt(process.env.TIMEOUT_DOC_SUMMARIZER) || 45000,
  "read-document-file": parseInt(process.env.TIMEOUT_READ_DOCUMENT) || 30000,
  "document-review": parseInt(process.env.TIMEOUT_DOC_REVIEW) || 45000,

  // 数据平台工具
  "doris-data-platform": parseInt(process.env.TIMEOUT_DORIS) || 30000,

  // 默认超时
  DEFAULT: parseInt(process.env.TIMEOUT_DEFAULT) || 60000,
};

/**
 * 工具超时保护执行器
 * @class ToolTimeoutExecutor
 */
class ToolTimeoutExecutor {
  /**
   * 创建工具超时执行器
   * @param {Object} options - 配置选项
   * @param {Function} options.introspect - 状态回调函数
   * @param {Function} options.log - 日志函数
   */
  constructor(options = {}) {
    this.introspect = options.introspect;
    this.log = options.log;
    this.timeoutOverrides = new Map();
  }

  /**
   * 获取工具超时时间
   * @param {string} toolName - 工具名称
   * @returns {number} 超时时间（毫秒）
   */
  getTimeout(toolName) {
    // 检查是否有动态覆盖
    if (this.timeoutOverrides.has(toolName)) {
      return this.timeoutOverrides.get(toolName);
    }
    return TOOL_TIMEOUTS[toolName] || TOOL_TIMEOUTS.DEFAULT;
  }

  /**
   * 动态设置工具超时时间（用于特殊场景）
   * @param {string} toolName - 工具名称
   * @param {number} timeoutMs - 超时时间（毫秒）
   */
  setTimeoutOverride(toolName, timeoutMs) {
    this.timeoutOverrides.set(toolName, timeoutMs);
  }

  /**
   * 清除工具超时覆盖
   * @param {string} toolName - 工具名称
   */
  clearTimeoutOverride(toolName) {
    this.timeoutOverrides.delete(toolName);
  }

  /**
   * 带超时保护执行工具
   * @param {string} toolName - 工具名称
   * @param {Function} handler - 工具处理函数
   * @param {Object} args - 工具参数
   * @returns {Promise<{success: boolean, result?: any, error?: string, timedOut?: boolean}>}
   */
  async executeWithTimeout(toolName, handler, args) {
    const timeoutMs = this.getTimeout(toolName);
    const startTime = Date.now();

    try {
      const result = await TimeoutManager.withTimeout(
        handler(args),
        timeoutMs,
        `Tool "${toolName}" timeout after ${timeoutMs}ms`
      );

      return {
        success: true,
        result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (error.code === "TIMEOUT" || error.message.includes("timeout")) {
        // 超时处理
        this.log?.(
          `[ToolTimeout] Tool "${toolName}" timed out after ${timeoutMs}ms`
        );
        this.introspect?.(
          `\u26a0 \u5de5\u5177 ${toolName} \u6267\u884c\u8d85\u65f6 (> ${Math.round(timeoutMs / 1000)}\u79d2)\uff0c\u5df2\u8df3\u8fc7`
        );

        return {
          success: false,
          error: this.#formatTimeoutError(toolName, timeoutMs),
          timedOut: true,
          durationMs,
        };
      }

      // 其他错误
      return {
        success: false,
        error: error.message,
        timedOut: false,
        durationMs,
      };
    }
  }

  /**
   * 格式化超时错误消息（供 LLM 理解）
   * @private
   */
  #formatTimeoutError(toolName, timeoutMs) {
    return (
      `\u5de5\u5177 "${toolName}" \u6267\u884c\u8d85\u65f6\uff08\u8d85\u8fc7 ${Math.round(timeoutMs / 1000)} \u79d2\uff09\u3002` +
      `\u5efa\u8bae\uff1a1) \u7b80\u5316\u67e5\u8be2\u6761\u4ef6 2) \u62c6\u5206\u4e3a\u591a\u4e2a\u5c0f\u4efb\u52a1 3) \u5c1d\u8bd5\u5176\u4ed6\u5de5\u5177\u66ff\u4ee3`
    );
  }

  /**
   * 获取所有工具超时配置
   * @returns {Object} 工具超时配置
   */
  getAllTimeouts() {
    const timeouts = { ...TOOL_TIMEOUTS };

    // 合并动态覆盖
    for (const [tool, timeout] of this.timeoutOverrides) {
      timeouts[tool] = timeout;
    }

    return timeouts;
  }
}

/**
 * 工具调用重试器
 * @class ToolRetryHandler
 */
class ToolRetryHandler {
  /**
   * 创建重试处理器
   * @param {Object} options - 配置选项
   * @param {number} options.maxRetries - 最大重试次数（默认 2）
   * @param {number} options.retryDelay - 重试延迟毫秒数（默认 1000）
   * @param {Function} options.log - 日志函数
   */
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 2;
    this.retryDelay = options.retryDelay || 1000;
    this.log = options.log;

    // 可重试的错误类型
    this.retryableErrors = new Set([
      "TIMEOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "RATE_LIMIT",
    ]);
  }

  /**
   * 判断错误是否可重试
   * @param {Error} error - 错误对象
   * @returns {boolean}
   */
  shouldRetry(error, _toolName = "") {
    if (!error) return false;

    const message =
      error?.message?.toLowerCase?.() || String(error || "").toLowerCase();

    if (error?.type === "permissionDenied") return false;
    if (error?.type === "cancelled") return false;
    if (
      message.includes("permission") ||
      message.includes("denied") ||
      message.includes("unauthorized") ||
      message.includes("forbidden")
    ) {
      return false;
    }
    if (
      /invalid.*argument|schema.*validation|missing.*required/i.test(message)
    ) {
      return false;
    }

    if (error.code && this.retryableErrors.has(error.code)) {
      return true;
    }

    if (/rate.?limit|429|too.?many/i.test(message)) {
      return true;
    }
    if (/mcp.*transport|mcp.*connection/i.test(message)) {
      return true;
    }

    return (
      message.includes("timeout") ||
      message.includes("rate limit") ||
      message.includes("connection") ||
      message.includes("network") ||
      message.includes("socket hang up")
    );
  }

  /**
   * @param {Error} error
   * @param {string} toolName
   * @returns {boolean}
   */
  isRetryable(error, toolName = "") {
    return this.shouldRetry(error, toolName);
  }

  /**
   * 带重试执行
   * @param {Function} fn - 要执行的异步函数
   * @param {string} taskName - 任务名称（用于日志）
   * @returns {Promise<any>}
   */
  async withRetry(fn, taskName = "Task") {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries && this.shouldRetry(error, taskName)) {
          const delay = this.retryDelay * Math.pow(2, attempt); // 指数退避
          this.log?.(
            `[Retry] ${taskName} failed, retrying in ${delay}ms... (${attempt + 1}/${this.maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }

    throw lastError;
  }
}

module.exports = {
  TOOL_TIMEOUTS,
  ToolTimeoutExecutor,
  ToolRetryHandler,
};
