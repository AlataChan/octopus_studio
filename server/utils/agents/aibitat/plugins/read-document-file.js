/**
 * Read Document File Plugin
 *
 * 用于读取指定路径的文档文件内容
 * 支持目录列举、文件读取、批量读取等操作
 * 仅允许访问白名单目录
 */

const fs = require("fs").promises;
const path = require("path");
const { sanitizePath } = require("../../../security/pathSanitizer");
const { validatePath } = require("../../../security/pathValidator");

module.exports = {
  name: "read-document-file",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description: `读取本地文件系统中指定路径的文档文件内容。支持以下操作：
- list: 列出目录中的文件和子目录
- read: 读取单个文件的完整内容
- read_batch: 批量读取多个文件
- get_info: 获取文件/目录的元信息

⚠️ 仅允许访问白名单目录。`,
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["list", "read", "read_batch", "get_info"],
                description: "操作类型",
              },
              path: {
                type: "string",
                description: "文件或目录的绝对路径",
              },
              paths: {
                type: "array",
                items: { type: "string" },
                description: "文件路径列表（用于 read_batch）",
              },
              encoding: {
                type: "string",
                default: "utf8",
                description: "文件编码，默认 utf8",
              },
              maxSize: {
                type: "number",
                default: 1048576,
                description: "最大读取字节数，默认 1MB",
              },
            },
            required: ["action", "path"],
          },
          handler: async function ({
            action,
            path: filePath,
            paths,
            encoding = "utf8",
            maxSize = 1048576,
          }) {
            try {
              // 去重检查 - 使用 aibitat 注入的 tracker 实例
              const callId = { action, filePath, paths: paths || [] };
              if (this.tracker && this.tracker.isDuplicate(this.name, callId)) {
                return "该操作刚刚已执行过，请尝试其他操作。";
              }

              // 安全验证
              const sanitized = sanitizePath(filePath);
              const validation = validatePath(sanitized);
              if (!validation.valid) {
                return `❌ 权限拒绝：${validation.reason}`;
              }
              const safePath = validation.sanitizedPath;

              switch (action) {
                case "list":
                  return await listDirectory(safePath);
                case "read":
                  return await readFile(safePath, encoding, maxSize);
                case "read_batch":
                  return await readBatch(paths || [], encoding, maxSize);
                case "get_info":
                  return await getFileInfo(safePath);
                default:
                  return "❌ 未知操作类型";
              }
            } catch (error) {
              console.error("[read-document-file] Error:", error);
              return `❌ 操作失败: ${error.message}`;
            }
          },
        });
      },
    };
  },
};

/**
 * 列出目录内容
 */
async function listDirectory(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];
  const dirs = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // 跳过隐藏文件

    const fullPath = path.join(dirPath, entry.name);
    try {
      const stats = await fs.stat(fullPath);
      if (entry.isFile()) {
        files.push({
          name: entry.name,
          path: fullPath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        });
      } else if (entry.isDirectory()) {
        dirs.push({ name: entry.name, path: fullPath });
      }
    } catch (e) {
      // 跳过无法访问的文件
      continue;
    }
  }

  const fileList = files
    .map(
      (f) => `  - ${f.name} (${formatSize(f.size)}, ${formatDate(f.modified)})`
    )
    .join("\n");
  const dirList = dirs.map((d) => `  - ${d.name}/`).join("\n");

  return `📁 目录: ${dirPath}

📄 文件 (${files.length}):
${fileList || "  (空)"}

📂 子目录 (${dirs.length}):
${dirList || "  (空)"}`;
}

/**
 * 读取单个文件
 * 对于二进制文件（PDF、Word等）返回文件信息而非内容
 */
async function readFile(filePath, encoding, maxSize) {
  const stats = await fs.stat(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // 二进制文件类型 - 无法直接读取文本内容
  const binaryExtensions = [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".bmp",
    ".mp3",
    ".mp4",
    ".avi",
    ".mov",
  ];

  if (binaryExtensions.includes(ext)) {
    return `📄 文件信息

📄 路径: ${filePath}
📊 大小: ${formatSize(stats.size)}
📝 类型: ${ext.substring(1).toUpperCase()} 文件
🕐 修改时间: ${formatDate(stats.mtime.toISOString())}

⚠️ **注意**: 这是一个二进制文件（${ext}），无法直接读取文本内容。

💡 **建议操作**:
- 对于 PDF/Word 文档：请使用 **document-summarizer** 工具（如果文件已上传到知识库）
- 对于需要审核的文档：请使用 **document-review** 工具创建审核任务
- 如需提取文本内容：请先将文件上传到系统知识库进行解析`;
  }

  if (stats.size > maxSize) {
    return `⚠️ 文件过大 (${formatSize(stats.size)})，超过限制 (${formatSize(maxSize)})。请使用流式读取或分块处理。`;
  }

  const content = await fs.readFile(filePath, encoding);

  // 限制返回内容长度，避免 token 超限（最多 50000 字符，约 25000 tokens）
  const MAX_CONTENT_LENGTH = 50000;
  let truncated = false;
  let displayContent = content;

  if (content.length > MAX_CONTENT_LENGTH) {
    displayContent = content.substring(0, MAX_CONTENT_LENGTH);
    truncated = true;
  }

  return `✅ 文件读取成功

📄 路径: ${filePath}
📊 大小: ${formatSize(stats.size)}
🕐 修改时间: ${formatDate(stats.mtime.toISOString())}
${truncated ? `⚠️ 内容已截断（显示前 ${MAX_CONTENT_LENGTH} 字符）` : ""}

--- 内容开始 ---
${displayContent}
--- 内容结束 ---${truncated ? "\n\n（文件内容过长，已截断）" : ""}`;
}

/**
 * 批量读取文件
 */
async function readBatch(paths, encoding, maxSize) {
  if (!paths || paths.length === 0) {
    return "❌ 请提供文件路径列表";
  }

  const results = [];

  for (const p of paths) {
    try {
      const sanitized = sanitizePath(p);
      const validation = validatePath(sanitized);

      if (!validation.valid) {
        results.push({ path: p, success: false, error: "权限拒绝" });
        continue;
      }

      const stats = await fs.stat(validation.sanitizedPath);
      if (stats.size > maxSize) {
        results.push({
          path: p,
          success: false,
          error: `文件过大 (${formatSize(stats.size)})`,
        });
        continue;
      }

      const content = await fs.readFile(validation.sanitizedPath, encoding);
      // 截取前 500 字符作为预览
      const preview =
        content.length > 500 ? content.substring(0, 500) + "..." : content;
      results.push({ path: p, success: true, preview, size: stats.size });
    } catch (err) {
      results.push({ path: p, success: false, error: err.message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const output = results
    .map((r, i) => {
      if (r.success) {
        return `${i + 1}. ✅ ${r.path} (${formatSize(r.size)})\n${r.preview}`;
      }
      return `${i + 1}. ❌ ${r.path}: ${r.error}`;
    })
    .join("\n\n");

  return `📚 批量读取完成 (${successCount}/${results.length} 成功)

${output}`;
}

/**
 * 获取文件信息
 */
async function getFileInfo(filePath) {
  const stats = await fs.stat(filePath);

  const info = {
    path: filePath,
    type: stats.isFile() ? "文件" : stats.isDirectory() ? "目录" : "其他",
    size: stats.size,
    created: stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString(),
    accessed: stats.atime.toISOString(),
  };

  return `📋 文件信息

路径: ${info.path}
类型: ${info.type}
大小: ${formatSize(info.size)}
创建时间: ${formatDate(info.created)}
修改时间: ${formatDate(info.modified)}
访问时间: ${formatDate(info.accessed)}`;
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * 格式化日期
 */
function formatDate(isoString) {
  return new Date(isoString).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
