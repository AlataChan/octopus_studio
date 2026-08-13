const LOOPBACK_HOST = "127.0.0.1";

function isDesktopRuntime(env = process.env) {
  return String(env.ANYTHING_LLM_RUNTIME || "").toLowerCase() === "desktop";
}

function resolveServiceHost(env = process.env, hostEnvName = "SERVER_HOST") {
  const configuredHost = env[hostEnvName];
  if (configuredHost && configuredHost.trim()) {
    return configuredHost.trim();
  }

  if (isDesktopRuntime(env)) {
    return LOOPBACK_HOST;
  }

  return undefined;
}

function formatListenAddress(host, port) {
  return `${host || "default"}:${port}`;
}

module.exports = {
  LOOPBACK_HOST,
  formatListenAddress,
  isDesktopRuntime,
  resolveServiceHost,
};
