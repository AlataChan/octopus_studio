const { SystemSettings } = require("../../models/systemSettings");
const { User } = require("../../models/user");
const { EncryptionManager } = require("../EncryptionManager");
const {
  isDesktopSingleUserNoAuthRuntime,
} = require("../authRuntime");
const {
  rejectUntrustedDesktopUnsafeRequest,
} = require("./desktopOriginProtection");
const { decodeJWT } = require("../http");
const bcrypt = require("bcryptjs");

const EncryptionMgr = new EncryptionManager();

/**
 * 预计算 AUTH_TOKEN 的 bcrypt hash（启动时计算一次，避免每次请求重复计算）
 * bcrypt.hashSync 每次需要约 100-300ms，这会严重影响认证性能
 * @type {string|null}
 */
let cachedAuthTokenHash = null;

/**
 * 获取预计算的 AUTH_TOKEN hash
 * @returns {string|null}
 */
function getAuthTokenHash() {
  if (cachedAuthTokenHash) return cachedAuthTokenHash;
  if (process.env.AUTH_TOKEN) {
    cachedAuthTokenHash = bcrypt.hashSync(process.env.AUTH_TOKEN, 10);
  }
  return cachedAuthTokenHash;
}

async function validatedRequest(request, response, next) {
  const multiUserMode = await SystemSettings.isMultiUserMode();
  response.locals.multiUserMode = multiUserMode;
  if (multiUserMode)
    return await validateMultiUserRequest(request, response, next);

  // Development convenience: allow unauthenticated requests.
  if (process.env.NODE_ENV === "development") {
    next();
    return;
  }

  if (isDesktopSingleUserNoAuthRuntime({ multiUserMode })) {
    if (rejectUntrustedDesktopUnsafeRequest(request, response)) return;
    next();
    return;
  }

  // In non-development, JWT must be configured (single-user & multi-user both rely on JWTs).
  if (!process.env.JWT_SECRET) {
    response.status(500).json({
      error:
        "Server misconfigured: JWT_SECRET is unset. Set JWT_SECRET (and AUTH_TOKEN for single-user mode) before running in production.",
    });
    return;
  }

  if (!process.env.AUTH_TOKEN) {
    response.status(401).json({
      error:
        "Authentication required: set AUTH_TOKEN to enable single-user password mode (or enable multi-user mode).",
    });
    return;
  }

  const auth = request.header("Authorization");
  const token = auth ? auth.split(" ")[1] : null;

  if (!token) {
    response.status(401).json({
      error: "No auth token found.",
    });
    return;
  }

  const { p } = decodeJWT(token);

  if (p === null || !/\w{32}:\w{32}/.test(p)) {
    response.status(401).json({
      error: "Token expired or failed validation.",
    });
    return;
  }

  // Since the blame of this comment we have been encrypting the `p` property of JWTs with the persistent
  // encryptionManager PEM's. This prevents us from storing the `p` unencrypted in the JWT itself, which could
  // be unsafe. As a consequence, existing JWTs with invalid `p` values that do not match the regex
  // in ln:44 will be marked invalid so they can be logged out and forced to log back in and obtain an encrypted token.
  // This kind of methodology only applies to single-user password mode.
  // [性能优化] 使用预计算的 hash，避免每次请求都重新计算 bcrypt hash（~100-300ms）
  const authTokenHash = getAuthTokenHash();
  if (
    !authTokenHash ||
    !bcrypt.compareSync(EncryptionMgr.decrypt(p), authTokenHash)
  ) {
    response.status(401).json({
      error: "Invalid auth credentials.",
    });
    return;
  }

  next();
}

async function validateMultiUserRequest(request, response, next) {
  const auth = request.header("Authorization");
  const token = auth ? auth.split(" ")[1] : null;

  if (!token) {
    response.status(401).json({
      error: "No auth token found.",
    });
    return;
  }

  const valid = decodeJWT(token);
  if (!valid || !valid.id) {
    response.status(401).json({
      error: "Invalid auth token.",
    });
    return;
  }

  const user = await User.get({ id: valid.id });
  if (!user) {
    response.status(401).json({
      error: "Invalid auth for user.",
    });
    return;
  }

  if (user.suspended) {
    response.status(401).json({
      error: "User is suspended from system",
    });
    return;
  }

  response.locals.user = user;
  next();
}

module.exports = {
  validatedRequest,
};
