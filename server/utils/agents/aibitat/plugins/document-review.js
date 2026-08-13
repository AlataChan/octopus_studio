/**
 * Document Review Plugin (知识库版本)
 *
 * 用于创建和管理文档审核任务
 * 支持从知识库列出文档、创建审核任务、查询状态等操作
 *
 * @version 2.1.0 - 集成统一数据源访问层
 */

const { DocumentReviewTask } = require("../../../../models/documentReviewTask");
const { Document } = require("../../../../models/documents");
const { TASK_STATUS, REVIEW_TYPE } = require("../../../constants/reviewSteps");
const {
  getWorkspaceDocuments,
  getDocumentStatusReport,
} = require("../../../documentAccess");

module.exports = {
  name: "document-review",
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
          description: `管理文档审核任务。支持以下操作：
- list_documents: 列出知识库中的文档（待审核）
- check_document_status: 检查文档数据一致性状态
- create: 基于知识库文档创建审核任务
- create_batch: 批量创建审核任务（基于 documentIds）
- list_tasks: 列出待处理的审核任务
- get_status: 查询任务状态
- cancel: 取消待处理的任务
- stats: 获取任务统计信息`,
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: [
                  "list_documents",
                  "check_document_status",
                  "create",
                  "create_batch",
                  "list_tasks",
                  "get_status",
                  "cancel",
                  "stats",
                ],
                description: "操作类型",
              },
              documentIds: {
                type: "array",
                items: { type: "string" },
                description: "知识库文档 ID 列表（docId）",
              },
              reviewType: {
                type: "string",
                enum: ["standard", "strict", "quick"],
                default: "standard",
                description: "审核类型：standard=标准, strict=严格, quick=快速",
              },
              priority: {
                type: "number",
                default: 0,
                description: "优先级，数字越大越优先",
              },
              taskId: {
                type: "string",
                description: "任务 ID（用于 get_status 和 cancel）",
              },
              options: {
                type: "object",
                description: "自定义审核参数",
              },
            },
            required: ["action"],
          },
          handler: async function ({
            action,
            documentIds,
            reviewType = REVIEW_TYPE.STANDARD,
            priority = 0,
            taskId,
            options,
          }) {
            try {
              const { workspaceId, user } = aibitat.handlerProps;

              // 去重检查
              const callId = {
                action,
                taskId: taskId || "",
                documentIds: documentIds || [],
              };
              if (this.tracker && this.tracker.isDuplicate(this.name, callId)) {
                return "该操作刚刚已执行过，请尝试其他操作。";
              }

              switch (action) {
                case "list_documents":
                  return await listDocumentsInWorkspace(workspaceId);
                case "check_document_status":
                  // 检查文档数据一致性状态
                  const { report } = await getDocumentStatusReport(workspaceId);
                  return report;
                case "create":
                  return await createTaskFromDocument(
                    workspaceId,
                    user,
                    documentIds,
                    reviewType,
                    priority,
                    options
                  );
                case "create_batch":
                  return await createBatchTasksFromDocuments(
                    workspaceId,
                    user,
                    documentIds,
                    reviewType,
                    priority
                  );
                case "list_tasks":
                  return await listTasks(workspaceId);
                case "get_status":
                  return await getTaskStatus(taskId);
                case "cancel":
                  return await cancelTask(taskId);
                case "stats":
                  return await getStats(workspaceId);
                default:
                  return "❌ 未知操作类型";
              }
            } catch (error) {
              console.error("[document-review] Error:", error);
              return `❌ 操作失败: ${error.message}`;
            }
          },
        });
      },
    };
  },
};

/**
 * 列出知识库中的文档（排除审核报告）
 * 使用统一数据访问层，同时显示向量化状态
 */
async function listDocumentsInWorkspace(workspaceId) {
  // 使用统一数据访问层获取文档和向量化状态
  const { documents, totalInDb, vectorIndexed } =
    await getWorkspaceDocuments(workspaceId);

  // 过滤掉审核报告类型的文档
  const sourceDocuments = documents.filter((doc) => {
    try {
      const metadata = JSON.parse(doc.metadata || "{}");
      return metadata.type !== "review_report";
    } catch {
      return true;
    }
  });

  if (sourceDocuments.length === 0) {
    // 增加诊断信息
    return `📂 知识库中没有待审核的文档。
📊 诊断: 数据库记录 ${totalInDb} 个, 向量化完成 ${vectorIndexed} 个
💡 请先上传文档到知识库。`;
  }

  const docList = sourceDocuments
    .map((doc, i) => {
      let metadata = {};
      try {
        metadata = JSON.parse(doc.metadata || "{}");
      } catch {}

      // 显示向量化状态
      const vectorStatus = doc.isVectorIndexed ? "✅" : "⏳";

      return `${i + 1}. ${doc.filename} ${vectorStatus}
   文档 ID: ${doc.docId}
   上传时间: ${formatDate(doc.createdAt)}
   ${metadata.title ? `标题: ${metadata.title}` : ""}`;
    })
    .join("\n\n");

  // 计算已向量化的源文档数量
  const vectorizedSourceDocs = sourceDocuments.filter(
    (d) => d.isVectorIndexed
  ).length;

  return `📂 知识库文档列表 (${sourceDocuments.length} 个文档, ${vectorizedSourceDocs} 个已向量化)

${docList}

💡 使用 create 或 create_batch 操作创建审核任务，传入 documentIds 参数
📝 ✅ = 已向量化可审核, ⏳ = 等待向量化`;
}

/**
 * 基于知识库文档创建单个审核任务
 */
async function createTaskFromDocument(
  workspaceId,
  user,
  documentIds,
  reviewType,
  priority,
  options
) {
  if (!documentIds || documentIds.length === 0) {
    return "❌ 请提供知识库文档 ID（documentIds）";
  }

  const docId = documentIds[0];

  // 从知识库获取文档信息
  const document = await Document.get({ docId, workspaceId });
  if (!document) {
    return `❌ 未找到文档 ID: ${docId}`;
  }

  // 解析文档元数据
  let metadata = {};
  try {
    metadata = JSON.parse(document.metadata || "{}");
  } catch {}

  // 检查是否已存在该文档的审核任务
  const existingTask = await DocumentReviewTask.findByDocumentId(
    docId,
    workspaceId
  );
  if (existingTask && existingTask.status !== TASK_STATUS.COMPLETED) {
    return `ℹ️ 该文档已有审核任务

任务 ID: ${existingTask.id}
文件名: ${existingTask.fileName}
状态: ${formatStatus(existingTask.status)}
创建时间: ${formatDate(existingTask.createdAt)}`;
  }

  // 创建审核任务
  const task = await DocumentReviewTask.create({
    workspaceId,
    userId: user?.id,
    documentId: docId,
    inputPath: document.docpath,
    fileName: document.filename,
    fileHash: metadata.fileHash || docId,
    reviewType,
    priority,
    options,
  });

  return `✅ 审核任务已创建

任务 ID: ${task.id}
文档名: ${document.filename}
文档 ID: ${docId}
审核类型: ${reviewType}
优先级: ${priority}

📝 接下来请调用 document-review-executor 的 process_task 操作开始审核`;
}

/**
 * 批量创建审核任务（基于知识库文档）
 */
async function createBatchTasksFromDocuments(
  workspaceId,
  user,
  documentIds,
  reviewType,
  priority
) {
  if (!documentIds || documentIds.length === 0) {
    return "❌ 请提供知识库文档 ID 列表";
  }

  const created = [];
  const skipped = [];
  const errors = [];

  for (const docId of documentIds) {
    try {
      const document = await Document.get({ docId, workspaceId });
      if (!document) {
        errors.push({ docId, error: "文档不存在" });
        continue;
      }

      // 检查是否已存在任务
      const existingTask = await DocumentReviewTask.findByDocumentId(
        docId,
        workspaceId
      );
      if (existingTask && existingTask.status !== TASK_STATUS.COMPLETED) {
        skipped.push({
          docId,
          fileName: document.filename,
          reason: "已有待处理任务",
        });
        continue;
      }

      // 解析元数据
      let metadata = {};
      try {
        metadata = JSON.parse(document.metadata || "{}");
      } catch {}

      // 创建任务
      const task = await DocumentReviewTask.create({
        workspaceId,
        userId: user?.id,
        documentId: docId,
        inputPath: document.docpath,
        fileName: document.filename,
        fileHash: metadata.fileHash || docId,
        reviewType,
        priority,
      });

      created.push({ taskId: task.id, fileName: document.filename });
    } catch (err) {
      errors.push({ docId, error: err.message });
    }
  }

  let message = `📋 批量创建审核任务结果\n`;

  if (created.length > 0) {
    message += `\n✅ 成功创建 ${created.length} 个任务：\n`;
    message += created.map((c) => `  - ${c.fileName} (${c.taskId})`).join("\n");
  }

  if (skipped.length > 0) {
    message += `\n\n⚠️ 跳过 ${skipped.length} 个文档：\n`;
    message += skipped.map((s) => `  - ${s.fileName}: ${s.reason}`).join("\n");
  }

  if (errors.length > 0) {
    message += `\n\n❌ 失败 ${errors.length} 个：\n`;
    message += errors.map((e) => `  - ${e.docId}: ${e.error}`).join("\n");
  }

  return message;
}

/**
 * 列出待处理任务
 */
async function listTasks(workspaceId) {
  const tasks = await DocumentReviewTask.getPendingTasks(workspaceId, 20);

  if (tasks.length === 0) {
    return "✅ 没有待处理的审核任务";
  }

  const taskList = tasks
    .map(
      (t, i) =>
        `${i + 1}. ${t.fileName}
   ID: ${t.id}
   状态: ${formatStatus(t.status)}
   版本: v${t.version}
   创建: ${formatDate(t.createdAt)}`
    )
    .join("\n\n");

  return `📋 待处理任务 (${tasks.length})

${taskList}`;
}

/**
 * 查询任务状态
 */
async function getTaskStatus(taskId) {
  if (!taskId) {
    return "❌ 请提供任务 ID";
  }

  const task = await DocumentReviewTask.get(taskId);
  if (!task) {
    return "❌ 未找到该任务";
  }

  let statusInfo = `📋 任务详情

ID: ${task.id}
文件名: ${task.fileName}
路径: ${task.inputPath}
状态: ${formatStatus(task.status)}
版本: v${task.version}
审核类型: ${task.reviewType}
创建时间: ${formatDate(task.createdAt)}`;

  if (task.startedAt) {
    statusInfo += `\n开始时间: ${formatDate(task.startedAt)}`;
  }

  if (task.completedAt) {
    statusInfo += `\n完成时间: ${formatDate(task.completedAt)}`;
  }

  if (task.outputPath) {
    statusInfo += `\n输出路径: ${task.outputPath}`;
  }

  if (task.result) {
    statusInfo += `\n\n📊 审核结果:
结论: ${task.result.conclusion || "N/A"}`;
  }

  if (task.error) {
    statusInfo += `\n\n❌ 错误: ${task.error}`;
  }

  if (task.retryCount > 0) {
    statusInfo += `\n\n🔄 重试次数: ${task.retryCount}/${task.maxRetries}`;
    if (task.lastError) {
      statusInfo += `\n上次错误: ${task.lastError}`;
    }
  }

  return statusInfo;
}

/**
 * 取消任务
 */
async function cancelTask(taskId) {
  if (!taskId) {
    return "❌ 请提供任务 ID";
  }

  const task = await DocumentReviewTask.get(taskId);
  if (!task) {
    return "❌ 未找到该任务";
  }

  if (task.status !== TASK_STATUS.PENDING) {
    return `❌ 无法取消：任务状态为 ${formatStatus(task.status)}，只能取消待处理的任务`;
  }

  await DocumentReviewTask.delete(taskId);
  return `✅ 已取消任务: ${task.fileName}`;
}

/**
 * 获取统计信息
 */
async function getStats(workspaceId) {
  const stats = await DocumentReviewTask.getStats(workspaceId);

  return `📊 审核任务统计

⏳ 待处理: ${stats.pending}
🔄 处理中: ${stats.processing}
✅ 已完成: ${stats.completed}
❌ 失败: ${stats.failed}

📈 总计: ${stats.total}`;
}

/**
 * 格式化状态
 */
function formatStatus(status) {
  const statusMap = {
    [TASK_STATUS.PENDING]: "⏳ 待处理",
    [TASK_STATUS.PROCESSING]: "🔄 处理中",
    [TASK_STATUS.COMPLETED]: "✅ 已完成",
    [TASK_STATUS.FAILED]: "❌ 失败",
  };
  return statusMap[status] || status;
}

/**
 * 格式化日期
 */
function formatDate(date) {
  if (!date) return "N/A";
  return new Date(date).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
