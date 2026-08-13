/**
 * @fileoverview Joi 验证中间件
 * 提供统一的请求体验证功能
 */

/**
 * 创建验证中间件
 * @param {import('joi').Schema} schema - Joi 验证 Schema
 * @param {Object} options - 配置选项
 * @param {string} options.source - 验证数据来源: 'body' | 'query' | 'params'
 * @param {boolean} options.abortEarly - 是否在第一个错误时停止验证
 * @returns {Function} Express 中间件
 */
function validate(schema, options = {}) {
  const { source = "body", abortEarly = false } = options;

  return (req, res, next) => {
    let data;

    switch (source) {
      case "query":
        data = req.query;
        break;
      case "params":
        data = req.params;
        break;
      case "body":
      default:
        data = req.body;
        break;
    }

    const { error, value } = schema.validate(data, {
      abortEarly,
      stripUnknown: true, // 移除未定义的字段
      convert: true, // 自动类型转换
    });

    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);

      return res.status(400).json({
        success: false,
        error: "输入验证失败",
        details: errorMessages,
      });
    }

    // 将验证后的数据放回请求对象
    switch (source) {
      case "query":
        req.query = value;
        break;
      case "params":
        req.params = value;
        break;
      case "body":
      default:
        req.body = value;
        break;
    }

    next();
  };
}

/**
 * 验证 UUID 格式的辅助函数
 * @param {string} uuid - 待验证的 UUID
 * @returns {boolean} 是否为有效的 UUID v4 格式
 */
function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== "string") return false;
  const uuidV4Regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(uuid);
}

module.exports = {
  validate,
  isValidUUID,
};
