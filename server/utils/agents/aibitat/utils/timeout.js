/**
 * @fileoverview 统一的超时管理工具类
 * @description 为 Agent 插件提供标准化的 Promise 超时控制
 */

/**
 * 默认超时时间配置（毫秒）
 */
const DEFAULT_TIMEOUTS = {
  /** 网络请求默认超时 */
  NETWORK: 30_000,
  /** 搜索引擎请求超时 */
  SEARCH: 30_000,
  /** 网页抓取超时 */
  SCRAPING: 60_000,
  /** 文本摘要超时 */
  SUMMARIZATION: 60_000,
  /** 数据库查询超时 */
  DATABASE: 30_000,
  /** MCP 工具调用超时 */
  MCP_TOOL: 60_000,
  /** 文件操作超时 */
  FILE_OPERATION: 30_000,
};

/**
 * 超时管理器
 * @class TimeoutManager
 */
class TimeoutManager {
  /**
   * 为 Promise 添加超时控制
   * @template T
   * @param {Promise<T>} promise - 需要添加超时的 Promise
   * @param {number} timeoutMs - 超时时间（毫秒）
   * @param {string} [errorMessage] - 超时错误消息
   * @returns {Promise<T>} 带超时控制的 Promise
   * @throws {Error} 超时时抛出错误
   *
   * @example
   * const result = await TimeoutManager.withTimeout(
   *   fetch('https://api.example.com'),
   *   30000,
   *   'API request timeout'
   * );
   */
  static async withTimeout(promise, timeoutMs, errorMessage) {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(
          errorMessage || `Operation timeout after ${timeoutMs}ms`
        );
        error.code = "TIMEOUT";
        reject(error);
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      return result;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * 为 fetch 请求添加超时控制
   * @param {string} url - 请求 URL
   * @param {RequestInit} [options] - fetch 选项
   * @param {number} [timeoutMs=30000] - 超时时间（毫秒）
   * @returns {Promise<Response>} fetch 响应
   *
   * @example
   * const response = await TimeoutManager.fetchWithTimeout(
   *   'https://api.example.com/data',
   *   { method: 'GET' },
   *   30000
   * );
   */
  static async fetchWithTimeout(
    url,
    options = {},
    timeoutMs = DEFAULT_TIMEOUTS.NETWORK
  ) {
    const controller = new AbortController();
    const { signal } = controller;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal,
      });
      return response;
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error(
          `Request timeout after ${timeoutMs}ms: ${url}`
        );
        timeoutError.code = "TIMEOUT";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 创建一个可取消的超时 Promise
   * @param {number} timeoutMs - 超时时间（毫秒）
   * @returns {{ promise: Promise<void>, cancel: Function }} 超时 Promise 和取消函数
   *
   * @example
   * const { promise, cancel } = TimeoutManager.createCancelableTimeout(5000);
   * // 在某个条件下取消超时
   * if (condition) cancel();
   */
  static createCancelableTimeout(timeoutMs) {
    let timeoutId;
    let rejectFn;

    const promise = new Promise((_, reject) => {
      rejectFn = reject;
      timeoutId = setTimeout(() => {
        const error = new Error(`Timeout after ${timeoutMs}ms`);
        error.code = "TIMEOUT";
        reject(error);
      }, timeoutMs);
    });

    const cancel = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    return { promise, cancel };
  }

  /**
   * 获取默认超时配置
   * @returns {typeof DEFAULT_TIMEOUTS} 默认超时配置
   */
  static getDefaults() {
    return { ...DEFAULT_TIMEOUTS };
  }
}

module.exports = { TimeoutManager, DEFAULT_TIMEOUTS };
