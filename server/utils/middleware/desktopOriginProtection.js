const { SystemSettings } = require("../../models/systemSettings");
const {
  isDesktopRuntime,
  isDesktopSingleUserNoAuthRuntime,
} = require("../authRuntime");

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"]);

function isUnsafeMethod(method) {
  return UNSAFE_METHODS.has(String(method || "GET").toUpperCase());
}

function configuredDesktopOrigins() {
  return String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== "*");
}

function requestHostOrigin(request) {
  const host = request.header("Host");
  if (!host) return null;

  const protocol = request.protocol || (request.secure ? "https" : "http");
  return `${protocol}://${host}`;
}

function originsMatch(left, right) {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch (_error) {
    return false;
  }
}

function isTrustedDesktopOrigin(request, origin) {
  if (!origin) return true;

  const allowedOrigins = configuredDesktopOrigins();
  if (allowedOrigins.some((allowed) => originsMatch(origin, allowed))) {
    return true;
  }

  const hostOrigin = requestHostOrigin(request);
  return !!hostOrigin && originsMatch(origin, hostOrigin);
}

function rejectUntrustedDesktopUnsafeRequest(request, response) {
  if (!isUnsafeMethod(request.method)) return false;

  const origin = request.header("Origin");
  if (!isTrustedDesktopOrigin(request, origin)) {
    response.status(403).json({
      error: "Cross-origin desktop requests are not allowed.",
    });
    return true;
  }

  const secFetchSite = String(request.header("Sec-Fetch-Site") || "")
    .trim()
    .toLowerCase();
  if (secFetchSite && !TRUSTED_FETCH_SITES.has(secFetchSite)) {
    response.status(403).json({
      error: "Cross-site desktop requests are not allowed.",
    });
    return true;
  }

  return false;
}

async function desktopOriginProtection(request, response, next) {
  try {
    if (
      !isUnsafeMethod(request.method) ||
      !isDesktopRuntime() ||
      process.env.AUTH_TOKEN
    ) {
      next();
      return;
    }

    const multiUserMode = await SystemSettings.isMultiUserMode();
    if (!isDesktopSingleUserNoAuthRuntime({ multiUserMode })) {
      next();
      return;
    }

    if (rejectUntrustedDesktopUnsafeRequest(request, response)) return;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  desktopOriginProtection,
  rejectUntrustedDesktopUnsafeRequest,
};
