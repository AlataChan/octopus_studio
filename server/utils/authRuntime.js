function isDesktopRuntime(env = process.env) {
  return String(env.ANYTHING_LLM_RUNTIME || "").toLowerCase() === "desktop";
}

function isDesktopSingleUserNoAuthRuntime({
  env = process.env,
  multiUserMode = false,
} = {}) {
  return isDesktopRuntime(env) && !multiUserMode && !env.AUTH_TOKEN;
}

function requiresSingleUserAuth(env = process.env) {
  if (isDesktopSingleUserNoAuthRuntime({ env })) return false;
  return !!env.AUTH_TOKEN || env.NODE_ENV === "production";
}

module.exports = {
  isDesktopRuntime,
  isDesktopSingleUserNoAuthRuntime,
  requiresSingleUserAuth,
};
