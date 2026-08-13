const DEFAULT_COLLECTOR_REQUEST_BODY_LIMIT = "10mb";

const SIZE_UNITS = {
  b: 1,
  kb: 1024,
  k: 1024,
  mb: 1024 * 1024,
  m: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
  g: 1024 * 1024 * 1024,
};

function parseSizeLimitToBytes(value, fallbackBytes) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value !== "string" || value.trim() === "") return fallbackBytes;

  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(b|kb|k|mb|m|gb|g)?$/);
  if (!match) return fallbackBytes;

  const parsed = Number(match[1]);
  const multiplier = SIZE_UNITS[match[2] || "b"];
  const bytes = Math.floor(parsed * multiplier);

  return Number.isFinite(bytes) && bytes > 0 ? bytes : fallbackBytes;
}

function getCollectorRequestBodyLimit(env = process.env) {
  const envValue = env.COLLECTOR_REQUEST_BODY_LIMIT;
  return parseSizeLimitToBytes(envValue, null)
    ? envValue.trim()
    : DEFAULT_COLLECTOR_REQUEST_BODY_LIMIT;
}

module.exports = {
  DEFAULT_COLLECTOR_REQUEST_BODY_LIMIT,
  getCollectorRequestBodyLimit,
  parseSizeLimitToBytes,
};
