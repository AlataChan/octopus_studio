const fs = require("fs");
const path = require("path");

const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|password|authorization)/i;

function defaultAuditRoot() {
  return path.resolve(
    process.env.STORAGE_DIR || path.resolve(__dirname, "../../storage"),
    "logs/octopus-kb"
  );
}

function safeSlug(slug) {
  return String(slug || "workspace")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 120);
}

function auditLogPath(slug, { root = defaultAuditRoot() } = {}) {
  return path.join(root, `${safeSlug(slug)}.jsonl`);
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSecrets(entry),
    ])
  );
}

async function appendAuditEvent(event = {}, { root = defaultAuditRoot() } = {}) {
  const slug = safeSlug(event.slug);
  const file = auditLogPath(slug, { root });
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const payload = {
    timestamp: new Date().toISOString(),
    ...redactSecrets(event),
    slug,
  };

  await fs.promises.appendFile(file, `${JSON.stringify(payload)}\n`, "utf8");
  return { path: file, event: payload };
}

module.exports = {
  appendAuditEvent,
  auditLogPath,
  redactSecrets,
};
