/**
 * 数据脱敏工具类
 *
 * @description
 * 用于在记录 AI 员工调用步骤时对敏感数据进行脱敏处理
 * 支持 PII (个人身份信息) 检测和黑名单字段过滤
 */
class DataSanitizer {
  /**
   * PII 检测正则表达式
   * @type {Object.<string, RegExp>}
   */
  static PII_PATTERNS = {
    email: /[\w.-]+@[\w.-]+\.\w{2,}/gi,
    phone: /(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
    // 中国身份证号 (15位或18位)
    id_card: /\d{15}(\d{2}[0-9Xx])?/g,
    // 信用卡号 (16位，可能有分隔符)
    credit_card: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
    // 中国手机号
    cn_mobile: /1[3-9]\d{9}/g,
    // IP 地址
    ip_address: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  };

  /**
   * 禁止记录的字段黑名单 (小写)
   * @type {string[]}
   */
  static FORBIDDEN_FIELDS = [
    "password",
    "passwd",
    "pwd",
    "token",
    "api_key",
    "apikey",
    "api-key",
    "secret",
    "private_key",
    "privatekey",
    "private-key",
    "credit_card",
    "creditcard",
    "ssn",
    "social_security",
    "authorization",
    "auth_token",
    "access_token",
    "refresh_token",
    "session_id",
    "sessionid",
    "cookie",
  ];

  /**
   * 通用脱敏方法
   * @param {any} data - 待脱敏数据
   * @param {Object} [options={}] - 选项
   * @param {number} [options.maxLength=1000] - 最大长度
   * @param {string[]} [options.allowedFields=null] - 白名单字段(如提供则仅保留白名单)
   * @returns {string} 脱敏后的 JSON 字符串
   */
  static sanitize(data, options = {}) {
    const { maxLength = 1000, allowedFields = null } = options;

    try {
      let sanitized = data;

      // 1. 对象/数组: 递归过滤
      if (typeof data === "object" && data !== null) {
        sanitized = this.#sanitizeObject(data, allowedFields);
      }

      // 2. 转换为字符串
      let result;
      if (typeof sanitized === "string") {
        result = sanitized;
      } else {
        result = JSON.stringify(sanitized, null, 0);
      }

      // 3. PII 替换
      result = this.#removePII(result);

      // 4. 长度截断
      if (result.length > maxLength) {
        result = result.substring(0, maxLength) + "... [truncated]";
      }

      return result;
    } catch (err) {
      console.error("[DataSanitizer] Sanitization failed:", err.message);
      return "[sanitization failed]";
    }
  }

  /**
   * 仅进行 PII 脱敏，不进行字段过滤
   * @param {string} text - 待脱敏文本
   * @returns {string} 脱敏后的文本
   */
  static sanitizePII(text) {
    if (typeof text !== "string") return text;
    return this.#removePII(text);
  }

  /**
   * 检查字符串是否包含 PII
   * @param {string} text - 待检查文本
   * @returns {boolean} 是否包含 PII
   */
  static containsPII(text) {
    if (typeof text !== "string") return false;
    for (const pattern of Object.values(this.PII_PATTERNS)) {
      if (pattern.test(text)) return true;
    }
    return false;
  }

  /**
   * 递归处理对象/数组
   * @private
   */
  static #sanitizeObject(obj, allowedFields) {
    if (Array.isArray(obj)) {
      return obj
        .slice(0, 10)
        .map((item) => this.#sanitizeObject(item, allowedFields));
    }

    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // 黑名单过滤
      if (this.FORBIDDEN_FIELDS.includes(lowerKey)) {
        result[key] = "[REDACTED]";
        continue;
      }

      // 白名单模式
      if (allowedFields && !allowedFields.includes(key)) {
        continue;
      }

      // 递归处理
      result[key] = this.#sanitizeObject(value, allowedFields);
    }
    return result;
  }

  /**
   * 移除文本中的 PII
   * @private
   */
  static #removePII(text) {
    let sanitized = text;
    for (const [type, pattern] of Object.entries(this.PII_PATTERNS)) {
      // 重置正则表达式的 lastIndex
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(
        pattern,
        `[${type.toUpperCase()}_REDACTED]`
      );
    }
    return sanitized;
  }
}

module.exports = { DataSanitizer };
