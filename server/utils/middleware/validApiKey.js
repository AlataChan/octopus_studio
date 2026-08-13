const { ApiKey } = require("../../models/apiKeys");
const { SystemSettings } = require("../../models/systemSettings");

/**
 * 验证 API Key 中间件
 * 检查 API Key 是否有效、是否启用、是否过期
 * 同时更新使用统计
 */
async function validApiKey(request, response, next) {
  const multiUserMode = await SystemSettings.isMultiUserMode();
  response.locals.multiUserMode = multiUserMode;

  const auth = request.header("Authorization");
  const bearerKey = auth ? auth.split(" ")[1] : null;
  if (!bearerKey) {
    response.status(403).json({
      error: "No valid api key found.",
    });
    return;
  }

  // 使用新的 validate 方法，会自动检查 isActive、expiresAt 并更新使用统计
  const { valid, apiKey, error } = await ApiKey.validate(bearerKey);
  if (!valid) {
    response.status(403).json({
      error: error || "No valid api key found.",
    });
    return;
  }

  // 将 API Key 信息存储到 response.locals 供后续使用
  response.locals.apiKey = apiKey;

  next();
}

module.exports = {
  validApiKey,
};
