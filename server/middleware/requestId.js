/**
 * 请求追踪 ID 中间件
 * 为每个请求生成唯一的追踪 ID，便于分布式系统日志追踪
 * @module middleware/requestId
 */

const { v4: uuidv4 } = require("uuid");

/**
 * 请求追踪 ID 配置
 */
const REQUEST_ID_CONFIG = {
  // 请求头名称
  HEADER_NAME: "X-Request-ID",
  // 是否在响应中返回请求 ID
  EXPOSE_IN_RESPONSE: true,
};

/**
 * 生成短格式的请求 ID（8字符）
 * 适用于日志显示，减少噪音
 * @returns {string} - 短格式 UUID
 */
function generateShortId() {
  return uuidv4().split("-")[0];
}

/**
 * 请求追踪 ID 中间件
 * - 如果客户端传入 X-Request-ID，则使用客户端的值
 * - 否则生成新的请求 ID
 * - 将请求 ID 挂载到 req.requestId 供后续中间件和日志使用
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - 下一个中间件
 */
function requestIdMiddleware(req, res, next) {
  // 优先使用客户端传入的请求 ID（用于分布式追踪链路透传）
  let requestId = req.headers[REQUEST_ID_CONFIG.HEADER_NAME.toLowerCase()];

  // 如果没有传入，则生成新的 ID
  if (!requestId) {
    requestId = generateShortId();
  }

  // 挂载到请求对象上，供后续中间件使用
  req.requestId = requestId;

  // 可选：在响应头中返回请求 ID，便于客户端排错
  if (REQUEST_ID_CONFIG.EXPOSE_IN_RESPONSE) {
    res.setHeader(REQUEST_ID_CONFIG.HEADER_NAME, requestId);
  }

  next();
}

/**
 * 从请求中获取请求 ID
 * @param {Object} req - Express 请求对象
 * @returns {string|null} - 请求 ID 或 null
 */
function getRequestId(req) {
  return req?.requestId || null;
}

module.exports = {
  requestIdMiddleware,
  getRequestId,
  REQUEST_ID_CONFIG,
};

