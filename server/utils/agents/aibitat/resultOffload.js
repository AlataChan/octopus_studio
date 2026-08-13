const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { isWithin } = require("../../files");

const DEFAULT_THRESHOLD_CHARS = 50000;
const DEFAULT_PREVIEW_CHARS = 500;

function asString(result) {
  if (result == null) return "";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result) ?? String(result);
  } catch (_) {
    return String(result);
  }
}

function sanitizeSegment(s, fallback) {
  const cleaned = String(s == null ? "" : s).replace(/[^a-zA-Z0-9_-]/g, "_");
  return cleaned.length ? cleaned : fallback;
}

function shouldOffload(
  result,
  { thresholdChars = DEFAULT_THRESHOLD_CHARS } = {}
) {
  return asString(result).length > thresholdChars;
}

function buildOffloadHandle({
  toolName,
  result,
  runId,
  storageDir,
  writeFile = fs.writeFileSync,
  previewChars = DEFAULT_PREVIEW_CHARS,
}) {
  const text = asString(result);
  const safeTool = sanitizeSegment(toolName, "tool");
  const safeRun = sanitizeSegment(runId, "norun");
  const storageRoot = path.resolve(storageDir, "tool-results");
  const dir = path.resolve(storageRoot, safeRun);
  const fileName = `${safeTool}-${crypto.randomUUID()}.txt`;
  const filePath = path.resolve(dir, fileName);

  if (!isWithin(storageRoot, filePath)) {
    throw new Error(`resultOffload: path escapes storage root: ${filePath}`);
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
  writeFile(filePath, text);

  const storageRef = path.relative(path.resolve(storageDir), filePath);
  const preview = text.slice(0, previewChars);
  const llmText =
    `${preview}\n... [工具 ${safeTool} 输出过大（${text.length} 字符）已落盘：` +
    `${storageRef}。需要完整内容时用文件读取工具按此路径读取。]`;

  return {
    path: filePath,
    storageRef,
    bytes: Buffer.byteLength(text),
    text: llmText,
  };
}

function maybeOffloadResult(
  toolName,
  result,
  {
    enabled = false,
    runId,
    storageDir,
    writeFile,
    thresholdChars = DEFAULT_THRESHOLD_CHARS,
    previewChars = DEFAULT_PREVIEW_CHARS,
  } = {}
) {
  if (!enabled || !shouldOffload(result, { thresholdChars })) {
    return { result, offloaded: false };
  }
  const handle = buildOffloadHandle({
    toolName,
    result,
    runId,
    storageDir,
    writeFile,
    previewChars,
  });
  return { result: handle.text, offloaded: true };
}

module.exports = {
  shouldOffload,
  buildOffloadHandle,
  maybeOffloadResult,
  DEFAULT_THRESHOLD_CHARS,
  DEFAULT_PREVIEW_CHARS,
};
