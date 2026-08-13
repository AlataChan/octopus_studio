const DEVELOPMENT_HTTP_SOURCES = [
  "http://localhost:*",
  "http://127.0.0.1:*",
];
const DEVELOPMENT_WS_SOURCES = [
  "ws://localhost:*",
  "ws://127.0.0.1:*",
];

function normalizeLoopbackHost(serverHost) {
  const host = String(serverHost || "127.0.0.1").trim();
  const unwrappedHost = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;

  if (
    unwrappedHost === "localhost" ||
    unwrappedHost === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(unwrappedHost)
  ) {
    return unwrappedHost.includes(":") ? `[${unwrappedHost}]` : unwrappedHost;
  }

  throw new Error(`Electron renderer server host must be loopback: ${serverHost}`);
}

function normalizePort(serverPort) {
  const port = Number(serverPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Electron renderer server port is invalid: ${serverPort}`);
  }
  return port;
}

function buildAppContentSecurityPolicy({
  isDevelopment,
  serverHost = "127.0.0.1",
  serverPort,
}) {
  const host = normalizeLoopbackHost(serverHost);
  const port = normalizePort(serverPort);
  const appHttpSource = `http://${host}:${port}`;
  const appWsSource = `ws://${host}:${port}`;

  if (isDevelopment) {
    const httpSources = [...DEVELOPMENT_HTTP_SOURCES, appHttpSource].join(" ");
    const wsSources = [...DEVELOPMENT_WS_SOURCES, appWsSource].join(" ");
    return [
      `default-src 'self' ${httpSources} ${wsSources}`,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${httpSources}`,
      `style-src 'self' 'unsafe-inline' ${httpSources} https://fonts.googleapis.com`,
      "font-src 'self' data: https://fonts.gstatic.com",
      `img-src 'self' data: blob: ${httpSources} https:`,
      `connect-src 'self' ${httpSources} ${wsSources} https:`,
      "media-src 'self' blob:",
    ].join("; ");
  }

  return [
    `default-src 'self' ${appHttpSource}`,
    `script-src 'self' ${appHttpSource}`,
    // React renders many dynamic inline style attributes; keep this until the
    // packaged renderer is migrated to nonce/hash-based styles.
    `style-src 'self' 'unsafe-inline' ${appHttpSource} https://fonts.googleapis.com`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${appHttpSource} https:`,
    `connect-src 'self' ${appHttpSource} ${appWsSource}`,
    "media-src 'self' blob:",
  ].join("; ");
}

function handleWindowOpenPolicy({ url, openExternal }) {
  let protocol;
  try {
    protocol = new URL(url).protocol;
  } catch (_error) {
    return { action: "deny" };
  }

  if (protocol === "http:" || protocol === "https:") {
    openExternal(url);
  }

  return { action: "deny" };
}

function decideNavigationPolicy({ url, appOrigin }) {
  let parsedUrl;
  let parsedAppOrigin;
  try {
    parsedUrl = new URL(url);
    parsedAppOrigin = new URL(appOrigin);
  } catch (_error) {
    return { action: "deny", openExternal: false };
  }

  if (parsedUrl.origin === parsedAppOrigin.origin) {
    return { action: "allow", openExternal: false };
  }

  if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
    return { action: "deny", openExternal: true };
  }

  return { action: "deny", openExternal: false };
}

module.exports = {
  buildAppContentSecurityPolicy,
  decideNavigationPolicy,
  handleWindowOpenPolicy,
};
