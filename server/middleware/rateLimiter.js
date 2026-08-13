/**
 * API 限流中间件
 * 使用 express-rate-limit 防止 DoS 攻击和 API 滥用
 * @module middleware/rateLimiter
 */

const rateLimitPackage = require("express-rate-limit");
const rateLimit = rateLimitPackage.rateLimit || rateLimitPackage;
const ipKeyGenerator =
  rateLimitPackage.ipKeyGenerator || ((ipAddress) => String(ipAddress || ""));

/**
 * 并发请求追踪器
 * 用于限制同时处理的聊天请求数量
 */
const concurrentRequests = new Map(); // IP -> 当前并发数

/**
 * 限流配置常量
 * 可通过环境变量覆盖默认值
 *
 * 设计原则：
 * - 通用 API：需要足够宽松以支持正常页面操作（SPA 单页加载会触发多个请求）
 * - 聊天 API：适度限制以保护 LLM 配额
 * - 认证 API：严格限制以防止暴力破解
 */
const RATE_LIMIT_CONFIG = {
  // 通用 API 限流窗口（毫秒）- 默认 1 分钟
  GENERAL_WINDOW_MS: parseInt(process.env.RATE_LIMIT_GENERAL_WINDOW_MS) || 60 * 1000,
  // 通用 API 每窗口最大请求数 - 默认 300 次/分钟（正常页面操作足够）
  GENERAL_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_GENERAL_MAX) || 300,

  // 认证接口限流窗口（毫秒）- 默认 15 分钟
  AUTH_WINDOW_MS: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000,
  // 认证接口每窗口最大请求数 - 默认 10 次失败请求（防止暴力破解）
  AUTH_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 10,

  // 聊天接口限流窗口（毫秒）- 默认 1 分钟
  CHAT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_CHAT_WINDOW_MS) || 60 * 1000,
  // 聊天接口每窗口最大请求数 - 默认 30 次/分钟（支持活跃对话）
  CHAT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_CHAT_MAX) || 30,
  // 聊天接口最大并发请求数 - 默认 5 个
  CHAT_MAX_CONCURRENT: parseInt(process.env.RATE_LIMIT_CHAT_CONCURRENT) || 5,

  // 严格限流窗口（毫秒）- 默认 1 小时
  STRICT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_STRICT_WINDOW_MS) || 60 * 60 * 1000,
  // 严格限流每窗口最大请求数 - 默认 10 次（用于敏感操作）
  STRICT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_STRICT_MAX) || 10,

  // 渠道 webhook 限流窗口（毫秒）- 默认 1 分钟
  CHANNEL_WEBHOOK_WINDOW_MS:
    parseInt(process.env.RATE_LIMIT_CHANNEL_WEBHOOK_WINDOW_MS) || 60 * 1000,
  // 渠道 webhook 每窗口最大请求数 - 默认 120 次/分钟/账号
  CHANNEL_WEBHOOK_MAX:
    parseInt(process.env.RATE_LIMIT_CHANNEL_WEBHOOK_MAX) || 120,
};

/**
 * 生成标准错误响应
 * @param {string} message - 错误消息
 * @returns {Object} - 标准错误响应对象
 */
function createErrorResponse(message) {
  return {
    success: false,
    error: message,
    code: "RATE_LIMIT_EXCEEDED",
  };
}

/**
 * 通用 API 限流器
 * 适用于大多数 API 端点
 * 配置: 5分钟内最多 100 次请求（更细粒度控制）
 * 注意：使用默认 keyGenerator（基于 req.ip），不自定义以避免 IPv6 问题
 */
const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.GENERAL_WINDOW_MS,
  max: RATE_LIMIT_CONFIG.GENERAL_MAX_REQUESTS,
  standardHeaders: true, // 返回 RateLimit-* headers
  legacyHeaders: false, // 禁用 X-RateLimit-* headers
  message: createErrorResponse("请求过于频繁，请稍后再试"),
  // 使用默认 keyGenerator（基于 req.ip），自动处理 IPv6
  skip: (req) => {
    const path = String(req?.path || "");
    const originalUrl = String(req?.originalUrl || "");

    // 跳过健康检查等非敏感端点
    if (
      path === "/api/health" ||
      path === "/api/ping" ||
      path === "/health" ||
      path === "/ping" ||
      originalUrl === "/api/health" ||
      originalUrl === "/api/ping"
    ) {
      return true;
    }

    // Webhook endpoints have their own limiter (channelWebhookLimiter).
    if (
      path.startsWith("/im-gateway/webhook/") ||
      originalUrl.includes("/im-gateway/webhook/")
    ) {
      return true;
    }

    return false;
  },
});

/**
 * 认证接口限流器（严格）
 * 用于登录、注册等认证端点，防止暴力破解
 * 配置: 15分钟内最多 10 次失败请求（成功请求不计入）
 */
const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.AUTH_WINDOW_MS,
  max: RATE_LIMIT_CONFIG.AUTH_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: createErrorResponse("认证请求过于频繁，请15分钟后再试"),
  // 使用默认 keyGenerator（基于 req.ip），自动处理 IPv6
  skipSuccessfulRequests: true, // 仅计算失败请求，成功请求不计入限制
});

/**
 * 聊天接口限流器
 * 用于 LLM 聊天端点，保护 API 配额
 * 配置: 1分钟内最多 10 次请求（更合理的正常使用频率）
 */
const chatLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.CHAT_WINDOW_MS,
  max: RATE_LIMIT_CONFIG.CHAT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: createErrorResponse("聊天请求过于频繁，请稍后再试"),
  // 使用默认 keyGenerator（基于 req.ip），自动处理 IPv6
});

/**
 * 聊天并发限制中间件
 * 限制同一 IP 同时处理的聊天请求数量
 * 配置: 同时最多 5 个请求在处理
 * @param {Request} req - Express 请求对象
 * @param {Response} res - Express 响应对象
 * @param {Function} next - Express next 函数
 */
function chatConcurrencyLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const maxConcurrent = RATE_LIMIT_CONFIG.CHAT_MAX_CONCURRENT;

  // 获取当前 IP 的并发请求数
  const currentCount = concurrentRequests.get(ip) || 0;

  if (currentCount >= maxConcurrent) {
    return res.status(429).json(
      createErrorResponse(`并发请求过多，当前已有 ${currentCount} 个请求在处理，请稍后再试`)
    );
  }

  // 增加并发计数
  concurrentRequests.set(ip, currentCount + 1);

  // 请求完成时减少计数（无论成功还是失败）
  const cleanup = () => {
    const count = concurrentRequests.get(ip) || 1;
    if (count <= 1) {
      concurrentRequests.delete(ip);
    } else {
      concurrentRequests.set(ip, count - 1);
    }
  };

  // 监听响应结束事件
  res.on("finish", cleanup);
  res.on("close", cleanup);

  next();
}

/**
 * 严格限流器
 * 用于敏感操作（如密码重置、邀请生成等）
 * 配置: 1小时内最多 5 次请求
 */
const strictLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.STRICT_WINDOW_MS,
  max: RATE_LIMIT_CONFIG.STRICT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: createErrorResponse("敏感操作请求过于频繁，请1小时后再试"),
  // 使用默认 keyGenerator（基于 req.ip），自动处理 IPv6
});

/**
 * 创建自定义限流器
 * @param {Object} options - 限流配置
 * @param {number} options.windowMs - 时间窗口（毫秒）
 * @param {number} options.max - 最大请求数
 * @param {string} options.message - 错误消息
 * @returns {Function} - Express 中间件函数
 */
function createCustomLimiter({
  windowMs,
  max,
  message,
  keyGenerator = null,
  skip = null,
}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: createErrorResponse(message || "请求过于频繁，请稍后再试"),
    ...(typeof keyGenerator === "function" ? { keyGenerator } : {}),
    ...(typeof skip === "function" ? { skip } : {}),
  });
}

/**
 * 渠道 webhook 限流器
 * 以 provider + accountId 为粒度，限制单渠道账号的入站流量。
 */
const channelWebhookLimiter = createCustomLimiter({
  windowMs: RATE_LIMIT_CONFIG.CHANNEL_WEBHOOK_WINDOW_MS,
  max: RATE_LIMIT_CONFIG.CHANNEL_WEBHOOK_MAX,
  message: "渠道消息过于频繁，请稍后再试",
  keyGenerator: (req) => {
    const provider = req.params?.provider || "unknown";
    const accountId =
      req.params?.accountId ||
      ipKeyGenerator(req.ip || req.connection?.remoteAddress);
    return `${provider}:${accountId}`;
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  chatLimiter,
  chatConcurrencyLimiter,
  strictLimiter,
  channelWebhookLimiter,
  createCustomLimiter,
  RATE_LIMIT_CONFIG,
  // 导出用于测试
  _concurrentRequests: concurrentRequests,
};
