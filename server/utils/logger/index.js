/**
 * Logger 模块 - 统一日志管理
 * 支持：
 * - 生产环境下自动切换到 Winston
 * - 日志文件轮转（DailyRotateFile）
 * - 请求追踪 ID 支持
 * @module utils/logger
 */

const winston = require("winston");
const path = require("path");
const { redactFdeText, redactFdeValue } = require("../fde/redaction");

function redactLogArgs(args) {
  return args
    .map((arg) => {
      if (arg instanceof Error) return redactFdeText(arg.stack || arg.message);
      if (typeof arg === "object") {
        return JSON.stringify(redactFdeValue(arg, { maxDepth: 32 }));
      }
      return redactFdeText(String(arg));
    })
    .join(" ");
}

// 日志配置常量
const LOG_CONFIG = {
  // 日志目录（可通过环境变量覆盖）
  LOG_DIR: process.env.LOG_DIR || path.join(process.cwd(), "logs"),
  // 是否启用文件日志（生产环境默认启用）
  ENABLE_FILE_LOG: process.env.ENABLE_FILE_LOG !== "false",
  // 日志保留天数（默认 14 天）
  MAX_DAYS: parseInt(process.env.LOG_MAX_DAYS) || 14,
  // 单个日志文件最大大小（默认 20MB）
  MAX_SIZE: process.env.LOG_MAX_SIZE || "20m",
  // 日志级别（默认 info）
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};

class Logger {
  logger = console;
  static _instance;

  constructor() {
    if (Logger._instance) return Logger._instance;
    this.logger =
      process.env.NODE_ENV === "production" ? this.getWinstonLogger() : console;
    Logger._instance = this;
  }

  /**
   * 创建 Winston Logger 实例
   * 在生产环境中使用，支持文件轮转
   * @returns {winston.Logger}
   */
  getWinstonLogger() {
    const transports = [
      // 控制台输出（带颜色）
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(
            ({ level, message, service, origin = "", requestId = "" }) => {
              const requestIdPart = requestId
                ? `\x1b[35m[${requestId}]\x1b[0m`
                : "";
              const originPart = origin ? `\x1b[33m[${origin}]\x1b[0m` : "";
              return `\x1b[36m[${service}]\x1b[0m${originPart}${requestIdPart} ${level}: ${message}`;
            }
          )
        ),
      }),
    ];

    // 生产环境且启用文件日志时，添加文件轮转
    if (LOG_CONFIG.ENABLE_FILE_LOG) {
      try {
        const DailyRotateFile = require("winston-daily-rotate-file");

        // 普通日志文件（info 及以上级别）
        transports.push(
          new DailyRotateFile({
            dirname: LOG_CONFIG.LOG_DIR,
            filename: "app-%DATE%.log",
            datePattern: "YYYY-MM-DD",
            maxSize: LOG_CONFIG.MAX_SIZE,
            maxFiles: `${LOG_CONFIG.MAX_DAYS}d`,
            format: winston.format.combine(
              winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
              winston.format.json()
            ),
          })
        );

        // 错误日志文件（仅 error 级别）
        transports.push(
          new DailyRotateFile({
            dirname: LOG_CONFIG.LOG_DIR,
            filename: "error-%DATE%.log",
            datePattern: "YYYY-MM-DD",
            maxSize: LOG_CONFIG.MAX_SIZE,
            maxFiles: `${LOG_CONFIG.MAX_DAYS}d`,
            level: "error",
            format: winston.format.combine(
              winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
              winston.format.json()
            ),
          })
        );

        console.log(`[Logger] 日志文件轮转已启用，目录: ${LOG_CONFIG.LOG_DIR}`);
      } catch (_err) {
        console.warn(
          "[Logger] winston-daily-rotate-file 加载失败，仅使用控制台输出"
        );
      }
    }

    const logger = winston.createLogger({
      level: LOG_CONFIG.LOG_LEVEL,
      defaultMeta: { service: "backend" },
      transports,
    });

    /**
     * 格式化日志参数
     * @param {any[]} args - 日志参数数组
     * @returns {string} - 格式化后的字符串
     */
    const formatArgs = redactLogArgs;

    // 覆盖 console 方法，重定向到 Winston
    console.log = function (...args) {
      logger.info(formatArgs(args));
    };
    console.error = function (...args) {
      logger.error(formatArgs(args));
    };
    console.info = function (...args) {
      logger.warn(formatArgs(args));
    };

    return logger;
  }
}

/**
 * Sets and overrides Console methods for logging when called.
 * This is a singleton method and will not create multiple loggers.
 * @returns {winston.Logger | console} - instantiated logger interface.
 */
function setLogger() {
  return new Logger().logger;
}

module.exports = setLogger;
module.exports.LOG_CONFIG = LOG_CONFIG;
module.exports.redactLogArgs = redactLogArgs;
