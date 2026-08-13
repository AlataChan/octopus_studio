/**
 * 路径验证工具
 * 用于验证文件路径是否在允许的范围内
 */

const path = require("path");
const { sanitizePath, checkDangerousPatterns } = require("./pathSanitizer");

/**
 * 允许访问的路径白名单
 * 可以通过环境变量扩展
 */
const ALLOWED_PATHS = [
  "/workspace/uploads",
  "/workspace/data",
  "/workspace/output",
  "/workspace/documents",
  // 开发/测试环境：允许项目内的 tests 目录
  ...(process.env.NODE_ENV !== "production"
    ? [process.cwd().replace(/\/server$/, "") + "/tests"]
    : []),
  // 从环境变量读取额外的允许路径
  ...(process.env.ALLOWED_FILE_PATHS || "").split(",").filter(Boolean),
];

/**
 * 明确禁止访问的路径模式
 */
const BLOCKED_PATTERNS = [
  /\/\.\./, // 路径遍历
  /\.\.\//, // 路径遍历
  /\/etc\//i, // 系统配置
  /\/var\//i, // 系统变量
  /\/root/i, // root 目录
  /\/home\//i, // 用户目录
  /\/usr\//i, // 系统程序
  /\/bin\//i, // 系统二进制
  /\/sbin\//i, // 系统管理二进制
  /\/proc\//i, // 进程信息
  /\/sys\//i, // 系统信息
  /\/dev\//i, // 设备文件
  /\/boot\//i, // 启动文件
  /\/tmp\//i, // 临时文件（可选，根据需求）
  /\.env/i, // 环境变量文件
  /\.git\//i, // Git 目录
  /node_modules\//i, // Node 模块
];

/**
 * 验证路径是否允许访问
 * @param {string} inputPath - 用户输入的路径
 * @returns {{ valid: boolean, reason?: string, sanitizedPath?: string }}
 */
function validatePath(inputPath) {
  try {
    // 1. 先检查危险模式
    const dangerCheck = checkDangerousPatterns(inputPath);
    if (!dangerCheck.safe) {
      return { valid: false, reason: dangerCheck.reason };
    }

    // 2. 净化路径
    const sanitized = sanitizePath(inputPath);

    // 3. 检查黑名单模式
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(sanitized)) {
        return { valid: false, reason: `Blocked pattern: ${pattern}` };
      }
    }

    // 4. 获取绝对路径
    const absolutePath = path.resolve(sanitized);

    // 5. 再次检查绝对路径的黑名单
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(absolutePath)) {
        return {
          valid: false,
          reason: `Blocked absolute path pattern: ${pattern}`,
        };
      }
    }

    // 6. 检查是否在白名单目录内
    const isAllowed = ALLOWED_PATHS.some((allowed) => {
      const allowedAbs = path.resolve(allowed);
      return (
        absolutePath === allowedAbs ||
        absolutePath.startsWith(allowedAbs + path.sep)
      );
    });

    if (!isAllowed) {
      return {
        valid: false,
        reason: `Path not in allowed directories. Allowed: ${ALLOWED_PATHS.join(", ")}`,
      };
    }

    return { valid: true, sanitizedPath: absolutePath };
  } catch (error) {
    return { valid: false, reason: error.message };
  }
}

/**
 * 验证多个路径
 * @param {string[]} paths - 路径数组
 * @returns {{ allValid: boolean, results: Array<{ path: string, valid: boolean, reason?: string }> }}
 */
function validatePaths(paths) {
  const results = paths.map((p) => ({
    path: p,
    ...validatePath(p),
  }));

  return {
    allValid: results.every((r) => r.valid),
    results,
  };
}

/**
 * 添加允许的路径（运行时）
 * @param {string} allowedPath - 要添加的路径
 */
function addAllowedPath(allowedPath) {
  const resolved = path.resolve(allowedPath);
  if (!ALLOWED_PATHS.includes(resolved)) {
    ALLOWED_PATHS.push(resolved);
  }
}

module.exports = {
  validatePath,
  validatePaths,
  addAllowedPath,
  ALLOWED_PATHS,
  BLOCKED_PATTERNS,
};
