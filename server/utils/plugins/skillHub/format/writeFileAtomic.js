const fs = require("fs");
const path = require("path");

function randomSuffix() {
  return `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Best-effort atomic-ish write:
 * - write to a temp file in the same directory
 * - rename over target (POSIX atomic; Windows may require unlink fallback)
 *
 * @param {string} filePath
 * @param {string|Buffer} content
 * @param {{ encoding?: BufferEncoding }} [options]
 */
function writeFileAtomic(filePath, content, options = {}) {
  const targetPath = String(filePath || "").trim();
  if (!targetPath) throw new Error("filePath is required");

  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tmpPath = path.join(dir, `.${base}.tmp-${randomSuffix()}`);
  const encoding = options.encoding || "utf8";

  fs.writeFileSync(tmpPath, content, encoding);

  try {
    fs.renameSync(tmpPath, targetPath);
  } catch (error) {
    // Windows may not allow renaming over an existing file.
    try {
      fs.unlinkSync(targetPath);
    } catch {
      // ignore
    }
    fs.renameSync(tmpPath, targetPath);
  }
}

module.exports = { writeFileAtomic };
