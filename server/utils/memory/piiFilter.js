/**
 * PII (个人身份信息) 过滤器
 *
 * Phase 2: 在记忆保存时检测和脱敏敏感信息
 *
 * @module utils/memory/piiFilter
 */

/**
 * PII 类型定义
 */
const PII_TYPES = {
  API_KEY: "api_key",
  PASSWORD: "password",
  EMAIL: "email",
  PHONE: "phone",
  ID_CARD: "id_card",
  CREDIT_CARD: "credit_card",
  IP_ADDRESS: "ip_address",
  SECRET: "secret",
};

/**
 * PII 检测模式
 */
const PII_PATTERNS = {
  // API Keys (各种格式)
  [PII_TYPES.API_KEY]: [
    /(?:api[_-]?key|apikey|api_secret|access[_-]?token|bearer)\s*[:=]\s*["']?([a-zA-Z0-9_\-]{20,})["']?/gi,
    /(?:sk|pk|ak|rk|secret)[_-][a-zA-Z0-9]{20,}/gi,
    /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}/g, // GitHub tokens
    /xox[baprs]-[a-zA-Z0-9-]+/g, // Slack tokens
    /AKIA[0-9A-Z]{16}/g, // AWS Access Key
  ],

  // 密码
  [PII_TYPES.PASSWORD]: [
    /(?:password|passwd|pwd|secret)\s*[:=]\s*["']?([^\s"']{6,})["']?/gi,
    /(?:密码|口令)\s*[:：]\s*([^\s]{6,})/g,
  ],

  // 邮箱
  [PII_TYPES.EMAIL]: [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g],

  // 手机号 (中国)
  [PII_TYPES.PHONE]: [/(?:1[3-9]\d{9})/g, /(?:\+86\s*)?1[3-9]\d{9}/g],

  // 身份证号
  [PII_TYPES.ID_CARD]: [
    /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g,
  ],

  // 信用卡号
  [PII_TYPES.CREDIT_CARD]: [
    /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})/g,
  ],

  // IP 地址
  [PII_TYPES.IP_ADDRESS]: [
    /(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g,
  ],

  // 通用密钥/令牌
  [PII_TYPES.SECRET]: [
    /(?:secret|token|key|credential)\s*[:=]\s*["']?([a-zA-Z0-9_\-]{16,})["']?/gi,
  ],
};

/**
 * PII 过滤器
 */
const PIIFilter = {
  /**
   * 检测文本中的 PII
   *
   * @param {string} text - 要检测的文本
   * @returns {Array<{type: string, value: string, start: number, end: number}>} 检测到的 PII 列表
   */
  detect: function (text) {
    if (!text || typeof text !== "string") return [];

    const detected = [];

    for (const [type, patterns] of Object.entries(PII_PATTERNS)) {
      for (const pattern of patterns) {
        // 重置正则表达式的 lastIndex
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(text)) !== null) {
          // 获取匹配的值（可能是捕获组或整个匹配）
          const value = match[1] || match[0];

          // 避免重复检测
          const isDuplicate = detected.some(
            (d) => d.value === value && d.type === type
          );

          if (!isDuplicate && value.length >= 6) {
            detected.push({
              type,
              value,
              start: match.index,
              end: match.index + match[0].length,
              original: match[0],
            });
          }
        }
      }
    }

    return detected;
  },

  /**
   * 检查文本是否包含 PII
   *
   * @param {string} text - 要检测的文本
   * @returns {boolean}
   */
  hasPII: function (text) {
    return this.detect(text).length > 0;
  },

  /**
   * 脱敏文本中的 PII
   *
   * @param {string} text - 要脱敏的文本
   * @param {Object} options - 选项
   * @param {string[]} [options.types] - 要脱敏的 PII 类型，默认全部
   * @param {string} [options.replacement] - 替换字符，默认 "*"
   * @returns {{sanitized: string, detected: Array}} 脱敏后的文本和检测到的 PII
   */
  sanitize: function (text, options = {}) {
    const { types = null, replacement = "*" } = options;

    const detected = this.detect(text);
    let sanitized = text;

    // 按位置倒序排列，从后往前替换，避免位置偏移
    const sortedDetected = [...detected].sort((a, b) => b.start - a.start);

    for (const pii of sortedDetected) {
      // 如果指定了类型，只脱敏指定类型
      if (types && !types.includes(pii.type)) continue;

      // 生成脱敏字符串（保留前后各2个字符）
      const value = pii.value;
      let masked;

      if (value.length <= 6) {
        masked = replacement.repeat(value.length);
      } else {
        const prefix = value.slice(0, 2);
        const suffix = value.slice(-2);
        masked = prefix + replacement.repeat(value.length - 4) + suffix;
      }

      // 替换原文中的敏感信息
      sanitized =
        sanitized.slice(0, pii.start) +
        pii.original.replace(pii.value, masked) +
        sanitized.slice(pii.end);
    }

    return { sanitized, detected };
  },
};

module.exports = { PIIFilter, PII_TYPES, PII_PATTERNS };
