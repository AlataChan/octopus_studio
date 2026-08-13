/**
 * 可重试错误定义
 * 用于判断错误是否可以通过重试来解决
 */

/**
 * 可重试的错误代码
 */
const RETRYABLE_ERROR_CODES = [
  "ETIMEDOUT", // 连接超时
  "ECONNRESET", // 连接重置
  "ENOTFOUND", // DNS 查找失败
  "ECONNREFUSED", // 连接被拒绝
  "EPIPE", // 管道破裂
  "EAI_AGAIN", // DNS 临时失败
  "EHOSTUNREACH", // 主机不可达
  "ENETUNREACH", // 网络不可达
];

/**
 * 可重试的 HTTP 状态码
 */
const RETRYABLE_STATUS_CODES = [
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
];

/**
 * 可重试的错误消息关键词
 */
const RETRYABLE_MESSAGE_PATTERNS = [
  "timeout",
  "rate limit",
  "temporarily unavailable",
  "service unavailable",
  "too many requests",
  "connection reset",
  "network error",
  "socket hang up",
  "ECONNRESET",
];

/**
 * 判断错误是否可以重试
 * @param {Error|object} error - 错误对象
 * @returns {boolean}
 */
function isRetryableError(error) {
  if (!error) return false;

  // 检查错误代码
  if (error.code && RETRYABLE_ERROR_CODES.includes(error.code)) {
    return true;
  }

  // 检查 HTTP 状态码
  if (error.status && RETRYABLE_STATUS_CODES.includes(error.status)) {
    return true;
  }

  if (error.statusCode && RETRYABLE_STATUS_CODES.includes(error.statusCode)) {
    return true;
  }

  // 检查错误消息
  const message = (error.message || "").toLowerCase();
  for (const pattern of RETRYABLE_MESSAGE_PATTERNS) {
    if (message.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  // 检查 response.status（axios 风格）
  if (
    error.response &&
    error.response.status &&
    RETRYABLE_STATUS_CODES.includes(error.response.status)
  ) {
    return true;
  }

  return false;
}

/**
 * 计算重试延迟（指数退避）
 * @param {number} retryCount - 当前重试次数（从 0 开始）
 * @param {number} baseDelayMs - 基础延迟（毫秒），默认 60000（1分钟）
 * @param {number} maxDelayMs - 最大延迟（毫秒），默认 300000（5分钟）
 * @returns {number} 延迟时间（毫秒）
 */
function calculateRetryDelay(
  retryCount,
  baseDelayMs = 60000,
  maxDelayMs = 300000
) {
  // 指数退避: baseDelay * 2^retryCount
  const delay = baseDelayMs * Math.pow(2, retryCount);
  // 添加随机抖动（±10%）
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, maxDelayMs);
}

/**
 * 获取下次重试时间
 * @param {number} retryCount - 当前重试次数
 * @returns {Date}
 */
function getNextRetryTime(retryCount) {
  const delayMs = calculateRetryDelay(retryCount);
  return new Date(Date.now() + delayMs);
}

module.exports = {
  RETRYABLE_ERROR_CODES,
  RETRYABLE_STATUS_CODES,
  RETRYABLE_MESSAGE_PATTERNS,
  isRetryableError,
  calculateRetryDelay,
  getNextRetryTime,
};
