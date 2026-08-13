/**
 * 路径净化工具
 * 用于清理和验证用户输入的文件路径，防止路径遍历攻击
 */

const path = require("path");

/**
 * 净化用户输入的路径
 * @param {string} inputPath - 用户输入的路径
 * @returns {string} 净化后的路径
 * @throws {Error} 如果路径无效
 */
function sanitizePath(inputPath) {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("Invalid path: path must be a non-empty string");
  }

  // 移除 NULL 字符（可能被用于绕过检查）
  let sanitized = inputPath.replace(/\0/g, "");

  // 移除连续的点（防止 ... 等变体）
  sanitized = sanitized.replace(/\.{2,}/g, ".");

  // 规范化路径分隔符
  sanitized = sanitized.trim().replace(/\\/g, "/");

  // 移除重复的斜杠
  sanitized = sanitized.replace(/\/+/g, "/");

  // 移除开头和结尾的空白
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * 检查路径是否包含危险模式
 * @param {string} inputPath - 要检查的路径
 * @returns {{ safe: boolean, reason?: string }}
 */
function checkDangerousPatterns(inputPath) {
  const dangerousPatterns = [
    { pattern: /\.\./, reason: "Path traversal detected (..)" },
    { pattern: /~/, reason: "Home directory expansion (~)" },
    { pattern: /\$/, reason: "Variable expansion ($)" },
    { pattern: /`/, reason: "Command substitution (`)" },
    { pattern: /\|/, reason: "Pipe character (|)" },
    { pattern: /;/, reason: "Command separator (;)" },
    { pattern: /&/, reason: "Background operator (&)" },
    { pattern: />/, reason: "Output redirection (>)" },
    { pattern: /</, reason: "Input redirection (<)" },
  ];

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(inputPath)) {
      return { safe: false, reason };
    }
  }

  return { safe: true };
}

/**
 * 获取安全的绝对路径
 * @param {string} inputPath - 用户输入的路径
 * @param {string} baseDir - 基础目录（可选）
 * @returns {string} 绝对路径
 */
function getSafeAbsolutePath(inputPath, baseDir = null) {
  const sanitized = sanitizePath(inputPath);

  if (baseDir) {
    // 如果提供了基础目录，则相对于基础目录解析
    return path.resolve(baseDir, sanitized);
  }

  return path.resolve(sanitized);
}

module.exports = {
  sanitizePath,
  checkDangerousPatterns,
  getSafeAbsolutePath,
};
