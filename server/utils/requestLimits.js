const DEFAULT_REQUEST_BODY_LIMIT = "10mb";
const DEFAULT_DOCUMENT_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;
const DEFAULT_IMAGE_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
const DEFAULT_UPLOAD_FILE_COUNT_LIMIT = 1;
const DEFAULT_UPLOAD_FIELD_COUNT_LIMIT = 20;
const DEFAULT_UPLOAD_PART_COUNT_LIMIT = 25;
const DEFAULT_UPLOAD_FIELD_SIZE_LIMIT_BYTES = 1024 * 1024;

const MULTER_PAYLOAD_LIMIT_ERROR_CODES = new Set([
  "LIMIT_FILE_SIZE",
  "LIMIT_FILE_COUNT",
  "LIMIT_FIELD_KEY",
  "LIMIT_FIELD_VALUE",
  "LIMIT_FIELD_COUNT",
  "LIMIT_PART_COUNT",
  "LIMIT_UNEXPECTED_FILE",
]);

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

function getBodyParserLimit(envValue, fallbackLimit) {
  if (typeof envValue === "number") {
    return parseSizeLimitToBytes(envValue, null) ? envValue : fallbackLimit;
  }

  return parseSizeLimitToBytes(envValue, null) ? envValue.trim() : fallbackLimit;
}

function getRequestBodyLimit(env = process.env) {
  return getBodyParserLimit(env.REQUEST_BODY_LIMIT, DEFAULT_REQUEST_BODY_LIMIT);
}

function getDocumentUploadLimit(env = process.env) {
  return parseSizeLimitToBytes(
    env.DOCUMENT_UPLOAD_FILE_SIZE_LIMIT,
    DEFAULT_DOCUMENT_UPLOAD_LIMIT_BYTES
  );
}

function getImageUploadLimit(env = process.env) {
  return parseSizeLimitToBytes(
    env.IMAGE_UPLOAD_FILE_SIZE_LIMIT,
    DEFAULT_IMAGE_UPLOAD_LIMIT_BYTES
  );
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getMultipartUploadLimits(fileSize, env = process.env) {
  return {
    fileSize,
    files: DEFAULT_UPLOAD_FILE_COUNT_LIMIT,
    fields: parsePositiveInteger(
      env.UPLOAD_FIELD_COUNT_LIMIT,
      DEFAULT_UPLOAD_FIELD_COUNT_LIMIT
    ),
    parts: parsePositiveInteger(
      env.UPLOAD_PART_COUNT_LIMIT,
      DEFAULT_UPLOAD_PART_COUNT_LIMIT
    ),
    fieldSize: parseSizeLimitToBytes(
      env.UPLOAD_FIELD_SIZE_LIMIT,
      DEFAULT_UPLOAD_FIELD_SIZE_LIMIT_BYTES
    ),
  };
}

function getUploadErrorStatusCode(err) {
  return MULTER_PAYLOAD_LIMIT_ERROR_CODES.has(err?.code) ? 413 : 500;
}

module.exports = {
  DEFAULT_UPLOAD_FIELD_COUNT_LIMIT,
  DEFAULT_UPLOAD_FIELD_SIZE_LIMIT_BYTES,
  DEFAULT_UPLOAD_FILE_COUNT_LIMIT,
  DEFAULT_UPLOAD_PART_COUNT_LIMIT,
  DEFAULT_REQUEST_BODY_LIMIT,
  DEFAULT_DOCUMENT_UPLOAD_LIMIT_BYTES,
  DEFAULT_IMAGE_UPLOAD_LIMIT_BYTES,
  getDocumentUploadLimit,
  getImageUploadLimit,
  getMultipartUploadLimits,
  getRequestBodyLimit,
  getUploadErrorStatusCode,
  parseSizeLimitToBytes,
};
