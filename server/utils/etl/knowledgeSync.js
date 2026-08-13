/**
 * @fileoverview 知识 ETL 脚本
 * 将高质量的 Agent 调用记录同步到知识库
 *
 * 同步条件：
 * - user_rating >= 4（用户评分 4-5 星）
 * - success = true（执行成功）
 * - 未被同步过（synced_to_knowledge = false）
 */

const { PrismaClient } = require("@prisma/client");
const { getVectorDbClass } = require("../helpers");

const prisma = new PrismaClient();

/**
 * 知识同步配置
 */
const SYNC_CONFIG = {
  // 最低评分要求
  MIN_RATING: 4,
  // 每次同步的最大记录数
  BATCH_SIZE: 100,
  // 知识库命名空间前缀
  NAMESPACE_PREFIX: "agent-knowledge-",
};

/**
 * 获取待同步的高质量调用记录
 * @param {number} limit - 最大记录数
 * @returns {Promise<Array>}
 */
async function getPendingSyncRecords(limit = SYNC_CONFIG.BATCH_SIZE) {
  try {
    const records = await prisma.workspace_agent_invocations.findMany({
      where: {
        success: true,
        user_rating: {
          gte: SYNC_CONFIG.MIN_RATING,
        },
        // 使用 metadata 中的标记来判断是否已同步
        // 因为 Prisma schema 中没有 synced_to_knowledge 字段
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // 过滤掉已同步的记录（通过 metadata 判断）
    return records.filter((r) => {
      try {
        const metadata =
          typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata;
        return !metadata?.synced_to_knowledge;
      } catch {
        return true; // 如果解析失败，认为未同步
      }
    });
  } catch (error) {
    console.error("[KnowledgeSync] Failed to get pending records:", error);
    return [];
  }
}

/**
 * 将调用记录转换为知识文档格式
 * @param {Object} record - 调用记录
 * @returns {Object} 知识文档
 */
function recordToDocument(record) {
  const metadata =
    typeof record.metadata === "string"
      ? JSON.parse(record.metadata || "{}")
      : record.metadata || {};

  // 构建知识内容
  const content = [
    `## 用户问题`,
    record.prompt || "",
    "",
    `## AI 回答`,
    record.completion || "",
    "",
    `## 元数据`,
    `- 工作区: ${record.workspace?.name || "未知"}`,
    `- 评分: ${record.user_rating}/5`,
    `- 时间: ${record.createdAt?.toISOString() || "未知"}`,
    metadata.agent_role ? `- 执行角色: ${metadata.agent_role}` : "",
    metadata.tools_used ? `- 使用工具: ${metadata.tools_used.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    pageContent: content,
    docId: `agent-invocation-${record.id}`,
    metadata: {
      source: "agent-invocation",
      invocationId: record.id,
      workspaceId: record.workspaceId,
      workspaceName: record.workspace?.name,
      userRating: record.user_rating,
      createdAt: record.createdAt?.toISOString(),
      ...metadata,
    },
  };
}

/**
 * 同步单条记录到知识库
 * @param {Object} record - 调用记录
 * @param {Object} vectorDb - 向量数据库实例
 * @returns {Promise<boolean>}
 */
async function syncRecordToKnowledge(record, vectorDb) {
  try {
    const document = recordToDocument(record);
    const namespace = `${SYNC_CONFIG.NAMESPACE_PREFIX}${record.workspaceId}`;

    // 添加到向量数据库
    const result = await vectorDb.addDocumentToNamespace(
      namespace,
      document,
      null, // 无文件路径
      true // 跳过缓存
    );

    if (!result.vectorized) {
      console.error(
        `[KnowledgeSync] Failed to vectorize record ${record.id}:`,
        result.error
      );
      return false;
    }

    // 标记为已同步（更新 metadata）
    const existingMetadata =
      typeof record.metadata === "string"
        ? JSON.parse(record.metadata || "{}")
        : record.metadata || {};

    await prisma.workspace_agent_invocations.update({
      where: { id: record.id },
      data: {
        metadata: JSON.stringify({
          ...existingMetadata,
          synced_to_knowledge: true,
          synced_at: new Date().toISOString(),
        }),
      },
    });

    return true;
  } catch (error) {
    console.error(`[KnowledgeSync] Error syncing record ${record.id}:`, error);
    return false;
  }
}

/**
 * 执行知识同步
 * @returns {Promise<{success: number, failed: number, total: number}>}
 */
async function runKnowledgeSync() {
  console.log("[KnowledgeSync] Starting knowledge sync...");

  const stats = { success: 0, failed: 0, total: 0 };

  try {
    // 获取向量数据库实例
    const VectorDb = getVectorDbClass();
    if (!VectorDb) {
      console.error("[KnowledgeSync] Vector database not configured");
      return stats;
    }

    // 获取待同步记录
    const records = await getPendingSyncRecords();
    stats.total = records.length;

    if (records.length === 0) {
      console.log("[KnowledgeSync] No records to sync");
      return stats;
    }

    console.log(`[KnowledgeSync] Found ${records.length} records to sync`);

    // 逐条同步
    for (const record of records) {
      const success = await syncRecordToKnowledge(record, VectorDb);
      if (success) {
        stats.success++;
      } else {
        stats.failed++;
      }
    }

    console.log(
      `[KnowledgeSync] Sync completed: ${stats.success} success, ${stats.failed} failed`
    );
    return stats;
  } catch (error) {
    console.error("[KnowledgeSync] Sync failed:", error);
    return stats;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 获取同步统计信息
 * @returns {Promise<Object>}
 */
async function getSyncStats() {
  try {
    const totalInvocations = await prisma.workspace_agent_invocations.count();
    const highRatedInvocations = await prisma.workspace_agent_invocations.count(
      {
        where: {
          success: true,
          user_rating: { gte: SYNC_CONFIG.MIN_RATING },
        },
      }
    );

    // 获取已同步数量（通过查询 metadata 包含 synced_to_knowledge 的记录）
    // 注意：这是一个近似值，因为 SQLite 不支持 JSON 查询
    const allHighRated = await prisma.workspace_agent_invocations.findMany({
      where: {
        success: true,
        user_rating: { gte: SYNC_CONFIG.MIN_RATING },
      },
      select: { metadata: true },
    });

    const syncedCount = allHighRated.filter((r) => {
      try {
        const metadata =
          typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata;
        return metadata?.synced_to_knowledge === true;
      } catch {
        return false;
      }
    }).length;

    return {
      totalInvocations,
      highRatedInvocations,
      syncedCount,
      pendingCount: highRatedInvocations - syncedCount,
      minRating: SYNC_CONFIG.MIN_RATING,
    };
  } catch (error) {
    console.error("[KnowledgeSync] Failed to get stats:", error);
    return null;
  }
}

module.exports = {
  runKnowledgeSync,
  getSyncStats,
  SYNC_CONFIG,
};
