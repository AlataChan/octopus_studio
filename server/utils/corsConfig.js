/**
 * CORS 配置模块
 * 提供可配置的跨域资源共享策略
 *
 * @module utils/corsConfig
 */

/**
 * 解析 CORS 允许的来源列表
 *
 * 支持的格式：
 * - 逗号分隔的域名列表: "https://example.com,https://app.example.com"
 * - 通配符 "*" 表示允许所有来源（等同于 origin: true）
 * - 未设置时非桌面运行时默认允许所有来源（向后兼容）
 * - 桌面运行时未设置时默认不允许跨域，由 Electron 注入精确来源
 *
 * @returns {boolean|string|string[]|Function} CORS origin 配置
 */
function parseCorsOrigins() {
  const originsEnv = process.env.CORS_ALLOWED_ORIGINS;
  const isDesktopRuntime =
    String(process.env.ANYTHING_LLM_RUNTIME || "").toLowerCase() === "desktop";

  // 未配置或为空：非桌面部署保持向后兼容；桌面运行时要求 Electron 注入精确来源。
  if (!originsEnv || originsEnv.trim() === "") {
    if (isDesktopRuntime) {
      return false;
    }
    return true;
  }

  // 通配符：显式允许所有来源
  if (originsEnv.trim() === "*") {
    return true;
  }

  // 解析逗号分隔的来源列表
  const origins = originsEnv
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  // 单个来源：直接返回字符串
  if (origins.length === 1) {
    return origins[0];
  }

  // 多个来源：返回数组
  if (origins.length > 1) {
    return origins;
  }

  // 兜底：非桌面部署保持向后兼容；桌面运行时不接受空解析结果。
  if (isDesktopRuntime) {
    return false;
  }
  return true;
}

/**
 * 生产环境必须显式配置 CORS 来源，避免默认 origin:true + credentials:true。
 * 如需继续允许所有来源，必须显式设置 CORS_ALLOWED_ORIGINS=*。
 */
function assertProductionCorsConfig() {
  const originsEnv = process.env.CORS_ALLOWED_ORIGINS;
  const isDesktopRuntime =
    String(process.env.ANYTHING_LLM_RUNTIME || "").toLowerCase() === "desktop";

  if (process.env.NODE_ENV !== "production" || isDesktopRuntime) return;
  if (originsEnv && originsEnv.trim() !== "") return;

  throw new Error(
    "CORS_ALLOWED_ORIGINS is required in production. Set comma-separated origins, or set CORS_ALLOWED_ORIGINS=* to deliberately allow all origins."
  );
}

/**
 * 获取 CORS 配置对象
 *
 * 环境变量:
 * - CORS_ALLOWED_ORIGINS: 允许的来源列表（逗号分隔）或 "*"
 * - CORS_CREDENTIALS: 是否允许携带凭据（默认 true）
 *
 * @example
 * // .env 配置示例
 * CORS_ALLOWED_ORIGINS=https://example.com,https://app.example.com
 * CORS_CREDENTIALS=true
 *
 * @returns {Object} cors 中间件配置对象
 */
function getCorsConfig() {
  const origin = parseCorsOrigins();
  const isDesktopRuntime =
    String(process.env.ANYTHING_LLM_RUNTIME || "").toLowerCase() === "desktop";
  const credentials =
    process.env.CORS_CREDENTIALS !== "false" &&
    !(isDesktopRuntime && (origin === true || origin === false));

  return {
    origin,
    credentials,
    // 允许的 HTTP 方法
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // 允许的请求头
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "X-Request-ID",
    ],
    // 暴露给客户端的响应头
    exposedHeaders: [
      "X-Request-ID",
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
    ],
    // 预检请求缓存时间（秒）
    maxAge: 86400, // 24 小时
  };
}

/**
 * Public embed chat routes are designed to be called from customer domains.
 * They keep the historical explicit origin:true behavior even when the rest of
 * the API is locked down by CORS_ALLOWED_ORIGINS, but never allow browser
 * credentials with reflected origins.
 */
function getPublicEmbedCorsConfig() {
  return {
    origin: true,
    credentials: false,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Origin", "X-Requested-With"],
    maxAge: 86400,
    preflightContinue: true,
  };
}

/**
 * 记录 CORS 配置信息（仅开发模式）
 */
function logCorsConfig() {
  if (process.env.NODE_ENV !== "development") return;

  const config = getCorsConfig();
  const originDisplay =
    config.origin === true
      ? "* (允许所有来源)"
      : Array.isArray(config.origin)
        ? config.origin.join(", ")
        : config.origin;

  console.log(`[CORS] 配置已加载:`);
  console.log(`  - 允许来源: ${originDisplay}`);
  console.log(`  - 允许凭据: ${config.credentials}`);
}

module.exports = {
  assertProductionCorsConfig,
  getCorsConfig,
  getPublicEmbedCorsConfig,
  parseCorsOrigins,
  logCorsConfig,
};
