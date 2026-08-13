/**
 * @fileoverview 全局错误处理中间件
 * 作为所有路由的最后一道防线，捕获未处理的错误并返回统一格式的响应
 */

/**
 * 全局错误处理中间件
 * Express 错误处理中间件必须有 4 个参数 (err, req, res, next)
 * @param {Error} err - 错误对象
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - 下一个中间件
 */
function errorHandler(err, req, res, next) {
  // 获取请求追踪 ID（由 requestIdMiddleware 生成）
  const requestId = req.requestId || "N/A";

  // 记录错误日志，包含请求上下文信息
  console.error(
    `[ERROR] [${requestId}] ${req.method} ${req.path}:`,
    err.message
  );

  // 在开发环境下打印完整堆栈
  if (process.env.NODE_ENV === "development") {
    console.error(err.stack);
  }

  // 如果响应头已经发送，交给 Express 默认处理
  // 这种情况通常发生在流式响应中途出错
  if (res.headersSent) {
    return next(err);
  }

  // 确定 HTTP 状态码
  // 优先使用错误对象上的 statusCode，否则默认 500
  const statusCode = err.statusCode || err.status || 500;

  // 构建统一的错误响应格式
  const errorResponse = {
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Unknown error",
    requestId: requestId,
  };

  // 在开发环境下附加更多调试信息
  if (process.env.NODE_ENV === "development") {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details || null;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * 未捕获的 Promise 拒绝处理器
 * 防止未处理的 Promise 拒绝导致进程崩溃
 */
function setupUnhandledRejectionHandler() {
  process.on("unhandledRejection", (reason, _promise) => {
    console.error("[UNHANDLED REJECTION] Unhandled Promise Rejection:");
    console.error("Reason:", reason);
    // 不要退出进程，只记录日志
  });
}

/**
 * 未捕获的异常处理器
 * 记录错误但不立即退出，让进程有机会完成当前请求
 */
function setupUncaughtExceptionHandler() {
  process.on("uncaughtException", (err) => {
    console.error("[UNCAUGHT EXCEPTION] Uncaught Exception:");
    console.error(err);
    // 对于未捕获的异常，记录后让进程继续运行
    // 在生产环境中，可能需要配合进程管理器（如 PM2）来重启
  });
}

module.exports = {
  errorHandler,
  setupUnhandledRejectionHandler,
  setupUncaughtExceptionHandler,
};

