/**
 * @fileoverview 统一的插件错误处理工具类
 * @description 为 Agent 插件提供标准化的错误处理、日志记录和用户友好提示
 */

/**
 * 插件错误处理器
 * @class PluginErrorHandler
 */
class PluginErrorHandler {
  /**
   * 统一处理插件错误
   * @param {Object} context - 插件上下文 (this)
   * @param {Error} error - 错误对象
   * @param {Object} options - 配置选项
   * @param {string} options.plugin - 插件名称
   * @param {string} options.caller - 调用方标识
   * @param {boolean} [options.introspect=true] - 是否向用户发送提示
   * @param {string} [options.hint] - 给用户的额外提示
   * @param {boolean} [options.returnJson=true] - 是否返回 JSON 格式
   * @returns {string} 格式化的错误响应
   */
  static handle(context, error, options = {}) {
    const {
      plugin = "unknown",
      caller = "unknown",
      introspect = true,
      hint = "请稍后重试或联系管理员",
      returnJson = true,
    } = options;

    // 1. 记录详细日志到服务端
    const logPayload = {
      message: error.message,
      code: error.code || "UNKNOWN_ERROR",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    };

    if (context?.super?.handlerProps?.log) {
      context.super.handlerProps.log(
        `[${plugin}] Error in ${caller}:`,
        logPayload
      );
    } else {
      console.error(`[${plugin}] Error in ${caller}:`, logPayload);
    }

    // 2. 向用户发送友好提示
    if (introspect && context?.super?.introspect) {
      context.super.introspect(`${caller}: 操作失败 - ${error.message}`);
    }

    // 3. 返回标准格式响应
    if (returnJson) {
      return JSON.stringify({
        success: false,
        error: error.message,
        code: error.code || "UNKNOWN_ERROR",
        hint,
      });
    }

    return `操作失败: ${error.message}。${hint}`;
  }

  /**
   * 创建一个带有错误码的自定义错误
   * @param {string} message - 错误消息
   * @param {string} code - 错误码
   * @returns {Error} 带有 code 属性的错误对象
   */
  static createError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  /**
   * 常见错误码定义
   */
  static ErrorCodes = {
    // 配置相关
    CONFIG_MISSING: "CONFIG_MISSING",
    CONFIG_INVALID: "CONFIG_INVALID",
    API_KEY_MISSING: "API_KEY_MISSING",

    // 网络相关
    NETWORK_ERROR: "NETWORK_ERROR",
    TIMEOUT: "TIMEOUT",
    API_ERROR: "API_ERROR",

    // 数据相关
    INVALID_INPUT: "INVALID_INPUT",
    PARSE_ERROR: "PARSE_ERROR",
    NO_DATA: "NO_DATA",

    // 权限相关
    PERMISSION_DENIED: "PERMISSION_DENIED",
    RATE_LIMITED: "RATE_LIMITED",

    // 系统相关
    INTERNAL_ERROR: "INTERNAL_ERROR",
    NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  };

  /**
   * 错误码对应的用户友好提示
   */
  static ErrorHints = {
    CONFIG_MISSING: "请检查系统配置是否完整",
    CONFIG_INVALID: "配置格式不正确，请联系管理员",
    API_KEY_MISSING: "缺少必要的 API 密钥，请在设置中配置",
    NETWORK_ERROR: "网络连接失败，请检查网络状态",
    TIMEOUT: "操作超时，请稍后重试",
    API_ERROR: "外部服务返回错误，请稍后重试",
    INVALID_INPUT: "输入参数不正确，请检查输入",
    PARSE_ERROR: "数据解析失败",
    NO_DATA: "未找到相关数据",
    PERMISSION_DENIED: "权限不足，请联系管理员",
    RATE_LIMITED: "请求过于频繁，请稍后重试",
    INTERNAL_ERROR: "系统内部错误，请联系技术支持",
    NOT_IMPLEMENTED: "该功能尚未实现",
  };

  /**
   * 根据错误码获取用户友好提示
   * @param {string} code - 错误码
   * @returns {string} 用户友好提示
   */
  static getHint(code) {
    return this.ErrorHints[code] || "请稍后重试或联系管理员";
  }
}

module.exports = { PluginErrorHandler };
