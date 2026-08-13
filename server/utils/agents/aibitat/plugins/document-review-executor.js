/**
 * Document Review Executor Plugin (知识库版本)
 *
 * 用于执行文档审核任务
 * 使用 RAG 检索文档内容，生成结构化审核报告
 *
 * @version 2.0.0 - 迁移到知识库架构
 */

const { DocumentReviewTask } = require("../../../../models/documentReviewTask");
const {
  TASK_STATUS,
  REVIEW_STEPS,
  formatProgressMessage,
} = require("../../../constants/reviewSteps");
const { searchDocuments } = require("../../../documentIngestion");
const { DIMENSION_LABELS } = require("../../../constants/reviewReportSchema");

module.exports = {
  name: "document-review-executor",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        // 工具 1: 执行审核任务
        aibitat.function({
          super: aibitat,
          name: this.name,
          description: `执行文档审核任务（知识库版本）。支持以下操作：
- process_next: 获取并开始处理下一个待处理任务
- process_task: 处理指定 ID 的任务
- retrieve_document: 使用 RAG 检索文档内容
- update_progress: 更新任务进度`,
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: [
                  "process_next",
                  "process_task",
                  "retrieve_document",
                  "update_progress",
                ],
                description: "操作类型",
              },
              taskId: {
                type: "string",
                description: "任务 ID",
              },
              query: {
                type: "string",
                description: "RAG 检索查询（用于 retrieve_document）",
              },
              progressStep: {
                type: "string",
                enum: [
                  "READING_FILE",
                  "RETRIEVING_STANDARDS",
                  "ANALYZING_CONTENT",
                  "GENERATING_REPORT",
                  "FINALIZING",
                ],
                description: "进度步骤",
              },
            },
            required: ["action"],
          },
          handler: async function ({ action, taskId, query, progressStep }) {
            try {
              const { workspaceId } = aibitat.handlerProps;

              switch (action) {
                case "process_next":
                  return await processNextTask(workspaceId);
                case "process_task":
                  return await processSpecificTask(taskId, workspaceId);
                case "retrieve_document":
                  return await retrieveDocumentContent(
                    taskId,
                    query,
                    workspaceId
                  );
                case "update_progress":
                  return await updateProgress(taskId, progressStep);
                default:
                  return "❌ 未知操作类型";
              }
            } catch (error) {
              console.error("[document-review-executor] Error:", error);
              return `❌ 执行失败: ${error.message}`;
            }
          },
        });

        // 工具 2: 标记任务完成
        aibitat.function({
          super: aibitat,
          name: "document-review-complete",
          description: "标记文档审核任务为完成或失败状态",
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "任务 ID",
              },
              status: {
                type: "string",
                enum: ["completed", "failed"],
                description: "最终状态",
              },
              outputPath: {
                type: "string",
                description: "输出文件路径",
              },
              result: {
                type: "object",
                properties: {
                  conclusion: { type: "string", description: "审核结论" },
                  issues: {
                    type: "array",
                    items: { type: "string" },
                    description: "发现的问题",
                  },
                  suggestions: {
                    type: "array",
                    items: { type: "string" },
                    description: "改进建议",
                  },
                  score: { type: "number", description: "审核评分 (0-100)" },
                },
                description: "审核结果",
              },
              error: {
                type: "string",
                description: "错误信息（仅当 status=failed 时）",
              },
            },
            required: ["taskId", "status"],
          },
          handler: async function ({
            taskId,
            status,
            outputPath,
            result,
            error,
          }) {
            try {
              // 去重检查
              const callId = `complete:${taskId}:${status}`;
              if (
                Deduplicator.isDuplicate(
                  this.super,
                  "document-review-complete",
                  callId
                )
              ) {
                return "该任务状态刚刚已更新过。";
              }

              if (status === TASK_STATUS.FAILED) {
                const failResult = await DocumentReviewTask.markFailed(taskId, {
                  message: error || "Unknown error",
                });

                if (failResult.retrying) {
                  return `⚠️ 任务执行失败，将自动重试

任务 ID: ${taskId}
重试次数: ${failResult.retryCount}
下次重试: ${formatDate(failResult.nextRetryAt)}
错误: ${error || "Unknown error"}`;
                }

                return `❌ 任务最终失败

任务 ID: ${taskId}
错误: ${failResult.finalError}`;
              }

              // 标记完成
              await DocumentReviewTask.updateStatus(
                taskId,
                TASK_STATUS.COMPLETED,
                {
                  outputPath,
                  result,
                }
              );

              const task = await DocumentReviewTask.get(taskId);

              return `✅ 审核任务完成！

任务 ID: ${taskId}
文件名: ${task?.fileName || "N/A"}
输出路径: ${outputPath || "未指定"}
结论: ${result?.conclusion || "N/A"}
评分: ${result?.score !== undefined ? result.score + "/100" : "N/A"}`;
            } catch (err) {
              console.error("[document-review-complete] Error:", err);
              return `❌ 更新状态失败: ${err.message}`;
            }
          },
        });
      },
    };
  },
};

/**
 * 处理下一个待处理任务
 */
async function processNextTask(workspaceId) {
  const task = await DocumentReviewTask.claimNextTask(workspaceId);

  if (!task) {
    return "✅ 没有待处理的审核任务";
  }

  return generateTaskInstructions(task);
}

/**
 * 处理指定任务
 */
async function processSpecificTask(taskId, _workspaceId) {
  if (!taskId) {
    return "❌ 请提供任务 ID";
  }

  const task = await DocumentReviewTask.get(taskId);
  if (!task) {
    return "❌ 未找到该任务";
  }

  if (task.status === TASK_STATUS.PROCESSING) {
    return generateTaskInstructions(task);
  }

  if (task.status !== TASK_STATUS.PENDING) {
    return `❌ 任务状态不正确：${task.status}，只能处理待处理或处理中的任务`;
  }

  // 更新状态为处理中
  await DocumentReviewTask.updateStatus(task.id, TASK_STATUS.PROCESSING);

  return generateTaskInstructions(task);
}

/**
 * 使用 RAG 检索文档内容
 */
async function retrieveDocumentContent(taskId, query, workspaceId) {
  if (!taskId) {
    return "❌ 请提供任务 ID";
  }

  const task = await DocumentReviewTask.get(taskId);
  if (!task) {
    return "❌ 未找到该任务";
  }

  // 构建检索查询
  const searchQuery = query || `文档内容 ${task.fileName}`;

  try {
    const results = await searchDocuments(workspaceId, searchQuery, {
      topN: 15,
      similarityThreshold: 0.2,
    });

    if (!results.fragments || results.fragments.length === 0) {
      return `⚠️ 未检索到文档内容

任务 ID: ${taskId}
文件名: ${task.fileName}
查询: ${searchQuery}

请确认文档已正确上传到知识库并完成向量化。`;
    }

    // 格式化检索结果
    const contentParts = results.fragments
      .map((f, i) => `--- 片段 ${i + 1} ---\n${f.text}`)
      .join("\n\n");

    return `📄 文档内容检索结果

任务 ID: ${taskId}
文件名: ${task.fileName}
检索到 ${results.fragments.length} 个相关片段

${contentParts}

---
💡 请基于以上内容进行审核分析，完成后调用 document-review-complete 提交结果`;
  } catch (error) {
    console.error("[document-review-executor] RAG search error:", error);
    return `❌ 检索失败: ${error.message}`;
  }
}

/**
 * 更新任务进度
 */
async function updateProgress(taskId, progressStep) {
  if (!taskId || !progressStep) {
    return "❌ 请提供任务 ID 和进度步骤";
  }

  const step = REVIEW_STEPS[progressStep];
  if (!step) {
    return "❌ 无效的进度步骤";
  }

  const progressMessage = formatProgressMessage(step);

  return `📊 ${progressMessage}

${step.description}`;
}

/**
 * 生成任务执行指令（知识库版本）
 */
function generateTaskInstructions(task) {
  // 构建审核维度说明
  const dimensionList = Object.entries(DIMENSION_LABELS)
    .map(([_key, label]) => `   - ${label}`)
    .join("\n");

  return `🔄 开始处理审核任务

📋 任务信息:
- 任务 ID: ${task.id}
- 文件名: ${task.fileName}
- 文档 ID: ${task.documentId || "N/A"}
- 审核类型: ${task.reviewType}
- 版本: v${task.version}
${task.retryCount > 0 ? `- 重试次数: ${task.retryCount}/${task.maxRetries}` : ""}

📝 请按以下步骤执行审核：

1️⃣ 调用 \`document-review-executor\` 检索文档内容
   - action: "retrieve_document"
   - taskId: "${task.id}"
   - query: "完整文档内容"

2️⃣ 分析文档内容，从以下维度进行审核：
${dimensionList}

3️⃣ 生成结构化审核结论，包含：
   - overallConclusion: approved/approved_with_conditions/needs_revision/rejected
   - overallScore: 0-100 分
   - dimensions: 各维度评分和发现
   - issues: 问题列表（含严重程度）
   - suggestions: 改进建议

4️⃣ 调用 \`document-review-complete\` 提交审核结果
   - taskId: "${task.id}"
   - status: "completed"
   - result: { 结构化审核结果 }

5️⃣ （可选）调用 \`generate-review-report\` 生成 Word 报告

⏰ 超时限制: 5 分钟`;
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
