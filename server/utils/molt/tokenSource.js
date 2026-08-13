const fs = require("fs/promises");

let pendingReload = null;

async function readFileToken(filePath) {
  if (!filePath) return null;
  try {
    const value = await fs.readFile(filePath, "utf8");
    const token = value.trim();
    return token || null;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(
        `[MoltToken] Unable to read token file ${filePath}:`,
        error.message
      );
    }
    return null;
  }
}

async function readMoltToken({ filePath, envName } = {}) {
  const fileToken = await readFileToken(filePath);
  if (fileToken) return fileToken;

  const envToken = envName ? process.env[envName] : null;
  if (envToken && String(envToken).trim()) return String(envToken).trim();

  return null;
}

async function doReloadMoltToken({ filePath, envName } = {}) {
  try {
    if (filePath) {
      try {
        const value = await fs.readFile(filePath, "utf8");
        const token = value.trim();
        if (token) return token;
      } catch (error) {
        console.warn(
          `[MoltToken] Unable to reload token from ${filePath}:`,
          error.message
        );
      }
    }

    const envToken = envName ? process.env[envName] : null;
    if (envToken && String(envToken).trim()) return String(envToken).trim();
    return null;
  } catch (error) {
    console.warn("[MoltToken] Token reload failed:", error.message);
    return null;
  }
}

async function reloadMoltToken(options = {}) {
  if (pendingReload) return pendingReload;

  pendingReload = doReloadMoltToken(options).finally(() => {
    pendingReload = null;
  });
  return pendingReload;
}

module.exports = { readMoltToken, reloadMoltToken };
