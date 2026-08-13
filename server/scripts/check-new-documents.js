#!/usr/bin/env node
/**
 * 文档监控脚本
 *
 * 定期扫描指定目录，检测新上传的文件
 * 可配置自动创建审核任务或仅发送提醒
 *
 * 使用方式:
 *   node server/scripts/check-new-documents.js
 *
 * 环境变量:
 *   WATCH_DIR - 监控目录，默认 /workspace/uploads
 *   WORKSPACE_SLUG - Workspace slug，默认 vera
 *   AUTO_CREATE_TASKS - 是否自动创建任务，默认 false
 */

const fs = require("fs").promises;
const path = require("path");

// 配置
const WATCH_DIR = process.env.WATCH_DIR || "/workspace/uploads";
const SNAPSHOT_FILE = path.join(__dirname, "../storage/document-snapshot.json");
const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG || "vera";
const AUTO_CREATE_TASKS = process.env.AUTO_CREATE_TASKS === "true";

// 延迟加载模块（避免启动时报错）
let prisma, DocumentReviewTask, Workspace;

async function loadModules() {
  try {
    prisma = require("../utils/prisma");
    const { DocumentReviewTask: DRT } = require("../models/documentReviewTask");
    const { Workspace: WS } = require("../models/workspace");
    DocumentReviewTask = DRT;
    Workspace = WS;
  } catch (error) {
    console.error("[DocumentWatcher] 无法加载依赖模块:", error.message);
    process.exit(1);
  }
}

/**
 * 加载快照文件
 */
async function loadSnapshot() {
  try {
    const data = await fs.readFile(SNAPSHOT_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * 保存快照文件
 */
async function saveSnapshot(snapshot) {
  const dir = path.dirname(SNAPSHOT_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
}

/**
 * 扫描目录
 */
async function scanDirectory(dir) {
  try {
    await fs.access(dir);
  } catch {
    console.log(`[DocumentWatcher] 目录不存在: ${dir}`);
    return {};
  }

  const files = await fs.readdir(dir, { withFileTypes: true });
  const snapshot = {};

  for (const file of files) {
    // 跳过隐藏文件和目录
    if (file.name.startsWith(".") || !file.isFile()) continue;

    const filePath = path.join(dir, file.name);
    try {
      const stats = await fs.stat(filePath);
      snapshot[file.name] = {
        path: filePath,
        mtime: stats.mtimeMs,
        size: stats.size,
      };
    } catch {
      continue;
    }
  }

  return snapshot;
}

/**
 * 发送提醒消息到 Workspace
 */
async function sendNotification(workspaceId, message) {
  try {
    // 直接使用 Prisma 插入系统消息
    await prisma.workspace_chats.create({
      data: {
        workspaceId,
        prompt: "[系统] 文件监控",
        response: JSON.stringify({
          text: message,
          type: "system_notification",
          sources: [],
        }),
        include: false,
      },
    });
    console.log(`[DocumentWatcher] 已发送提醒到 Workspace ${workspaceId}`);
  } catch (error) {
    console.error("[DocumentWatcher] 发送提醒失败:", error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log(`[DocumentWatcher] 开始检查: ${WATCH_DIR}`);
  console.log(`[DocumentWatcher] Workspace: ${WORKSPACE_SLUG}`);
  console.log(`[DocumentWatcher] 自动创建任务: ${AUTO_CREATE_TASKS}`);

  await loadModules();

  // 获取 Workspace
  const workspace = await Workspace.get({ slug: WORKSPACE_SLUG });
  if (!workspace) {
    console.error(`[DocumentWatcher] Workspace 不存在: ${WORKSPACE_SLUG}`);
    process.exit(1);
  }

  // 加载旧快照
  const oldSnapshot = await loadSnapshot();
  console.log(`[DocumentWatcher] 旧快照文件数: ${Object.keys(oldSnapshot).length}`);

  // 扫描当前目录
  const newSnapshot = await scanDirectory(WATCH_DIR);
  console.log(`[DocumentWatcher] 当前文件数: ${Object.keys(newSnapshot).length}`);

  // 找出新文件
  const newFiles = Object.entries(newSnapshot)
    .filter(([name]) => !oldSnapshot[name])
    .map(([name, info]) => ({ name, ...info }));

  // 找出修改的文件
  const modifiedFiles = Object.entries(newSnapshot)
    .filter(([name, info]) => {
      const old = oldSnapshot[name];
      return old && old.mtime !== info.mtime;
    })
    .map(([name, info]) => ({ name, ...info }));

  if (newFiles.length === 0 && modifiedFiles.length === 0) {
    console.log("[DocumentWatcher] ✅ 没有新文件或修改");
    process.exit(0);
  }

  console.log(`[DocumentWatcher] 🔔 发现 ${newFiles.length} 个新文件, ${modifiedFiles.length} 个修改`);

  const allFiles = [...newFiles, ...modifiedFiles];

  if (AUTO_CREATE_TASKS) {
    // 自动创建审核任务
    let created = 0;
    let skipped = 0;

    for (const file of allFiles) {
      try {
        const result = await DocumentReviewTask.createSmart({
          workspaceId: workspace.id,
          inputPath: file.path,
          fileName: file.name,
          fileSize: file.size,
          fileMtime: BigInt(file.mtime),
        });

        if (result.isDuplicate) {
          skipped++;
          console.log(`[DocumentWatcher] ⏭️ 跳过: ${file.name} (已在队列中)`);
        } else {
          created++;
          console.log(`[DocumentWatcher] ✅ 创建任务: ${file.name}`);
        }
      } catch (error) {
        console.error(`[DocumentWatcher] ❌ 创建失败: ${file.name}`, error.message);
      }
    }

    console.log(`[DocumentWatcher] 📊 创建 ${created} 个任务, 跳过 ${skipped} 个`);
  } else {
    // 仅发送提醒
    const fileList = allFiles.map((f) => `- ${f.name}`).join("\n");
    const message = `📁 检测到 ${allFiles.length} 个新文件/修改:\n\n${fileList}\n\n请使用 \`document-review\` 工具创建审核任务。`;

    await sendNotification(workspace.id, message);
  }

  // 保存新快照
  await saveSnapshot(newSnapshot);
  console.log("[DocumentWatcher] 💾 快照已更新");
}

// 错误处理
process.on("unhandledRejection", (error) => {
  console.error("[DocumentWatcher] 未处理的错误:", error);
  process.exit(1);
});

// 执行
main()
  .then(() => {
    console.log("[DocumentWatcher] ✅ 检查完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[DocumentWatcher] ❌ 执行失败:", error);
    process.exit(1);
  });

