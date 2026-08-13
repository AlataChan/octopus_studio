// Shared sidecar staging exclusions. This module is intentionally side-effect free
// so tests can import it without running the full staging process.

export const EXCLUDE_NAME_PATTERNS = [
  "node_modules",
  "__tests__",
  "tests",
  "coverage",
  ".git",
  ".env",
  ".env.*",
  "*.md",
  "*.map",
  ".pnp.cjs",
  ".pnp.loader.mjs",
  ".yarn",
  "nodemon.json",
  "jest.config.js",
  ".flowconfig",
  ".gitignore",
  ".nvmrc",
  "*.test.js",
  "*.spec.js",
];

// Root-only excludes apply to every staged sidecar root: server, collector, and
// alata-im-gateway. Current collector/gateway runtime trees do not depend on a
// root scripts/ directory; the gateway uses bin/ for runtime commands.
export const EXCLUDE_ROOT_DIRS = new Set([
  "hotdir", // collector temp files
  "storage", // server storage data
  "vector-cache", // server vector cache
  "documents", // server documents
  "scripts", // maintenance/build scripts must not ship in desktop sidecars
]);

export function shouldExclude(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const name = parts[parts.length - 1];

  if (parts.length === 1 && EXCLUDE_ROOT_DIRS.has(name)) {
    return true;
  }

  return EXCLUDE_NAME_PATTERNS.some((pattern) => {
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return regex.test(name);
    }
    return name === pattern;
  });
}
