const { ApiKey } = require("../../models/apiKeys");
const { SystemSettings } = require("../../models/systemSettings");
const { userFromSession } = require("../http");

/**
 * Validate either a user session (JWT) or an API key.
 *
 * Why: Some routes are used by the web UI (session auth) and also by external clients (API keys).
 * The existing `validApiKey` middleware only accepts API keys and will reject session tokens.
 */
async function validApiKeyOrSession(request, response, next) {
  const multiUserMode = await SystemSettings.isMultiUserMode();
  response.locals.multiUserMode = multiUserMode;

  // In single-user mode, allow requests without requiring either auth mechanism.
  if (!multiUserMode) {
    next();
    return;
  }

  // In multi-user mode, accept either session JWT or an API key.
  const sessionUser = await userFromSession(request, response);
  if (sessionUser) {
    response.locals.user = sessionUser;
    next();
    return;
  }

  const auth = request.header("Authorization");
  const bearerKey = auth ? auth.split(" ")[1] : null;
  if (!bearerKey) {
    response.status(401).json({
      error: "Unauthorized.",
    });
    return;
  }

  const { valid, apiKey } = await ApiKey.validate(bearerKey);
  if (!valid) {
    response.status(401).json({
      error: "Unauthorized.",
    });
    return;
  }

  response.locals.apiKey = apiKey;
  next();
}

module.exports = { validApiKeyOrSession };
