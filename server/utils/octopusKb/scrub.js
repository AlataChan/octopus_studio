const SECRET_REPLACEMENT = "[REDACTED_SECRET]";
const EMAIL_REPLACEMENT = "[REDACTED_EMAIL]";

const PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/gi,
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s,;]+["']?/gi,
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function scrubSensitiveText(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  for (const pattern of PATTERNS) {
    text = text.replace(pattern, (match) => {
      if (/^(api[_-]?key|token|secret|password)/i.test(match)) {
        const [key] = match.split(/[:=]/);
        return `${key.trim()}=${SECRET_REPLACEMENT}`;
      }
      if (/^Bearer\s+/i.test(match)) return `Bearer ${SECRET_REPLACEMENT}`;
      return SECRET_REPLACEMENT;
    });
  }
  return text.replace(EMAIL_PATTERN, EMAIL_REPLACEMENT);
}

module.exports = {
  EMAIL_REPLACEMENT,
  SECRET_REPLACEMENT,
  scrubSensitiveText,
};
