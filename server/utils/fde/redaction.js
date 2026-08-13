const {
  redactSecrets: redactWorkAgentSecrets,
} = require("../workAgent/security/policy");

const MAX_REDACTION_DEPTH = 8;
const MAX_PREVIEW_CHARS = 2048;
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(?:key|token|secret|password|authorization)/i;

function redactFdeText(value) {
  return redactWorkAgentSecrets(value)
    .replace(/\b(Bearer\s+)[^\s"']+/gi, `$1${REDACTED}`)
    .replace(
      /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\s*[:=]\s*[^\s,"']+/gi,
      `$1=${REDACTED}`
    );
}

function redactFdeValue(value, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth)
    ? options.maxDepth
    : MAX_REDACTION_DEPTH;
  const seen = new WeakSet();

  function visit(entry, depth, key = "") {
    if (entry == null || typeof entry === "boolean" || typeof entry === "number") {
      return entry;
    }
    if (SENSITIVE_KEY.test(key)) return REDACTED;
    if (typeof entry === "string") return redactFdeText(entry);
    if (typeof entry !== "object") return redactFdeText(String(entry));
    if (depth >= maxDepth) return "[TRUNCATED:DEPTH]";
    if (seen.has(entry)) return "[TRUNCATED:CYCLE]";
    seen.add(entry);

    if (Array.isArray(entry)) {
      const output = entry.map((item) => visit(item, depth + 1));
      seen.delete(entry);
      return output;
    }

    const output = {};
    for (const [childKey, childValue] of Object.entries(entry)) {
      output[childKey] = visit(childValue, depth + 1, childKey);
    }
    seen.delete(entry);
    return output;
  }

  return visit(value, 0);
}

function previewFdeValue(value, maxChars = MAX_PREVIEW_CHARS) {
  const redacted = redactFdeValue(value);
  const serialized =
    typeof redacted === "string" ? redacted : JSON.stringify(redacted);
  if (serialized.length <= maxChars) return serialized;
  return serialized.slice(0, maxChars);
}

module.exports = {
  MAX_PREVIEW_CHARS,
  MAX_REDACTION_DEPTH,
  REDACTED,
  previewFdeValue,
  redactFdeText,
  redactFdeValue,
};
