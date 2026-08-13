/**
 * 结构性相似边计算模块
 * @module utils/graphBuilder/structuralSimilarity
 * @description 基于结构性关系（共标签、共引用、共现）计算文档相似边
 *
 * 相比向量相似边的优势：
 * 1. 低成本：不需要额外的 embedding 计算
 * 2. 高解释性：相似关系有明确的来源
 * 3. 可控规模：边数量有上限，不会爆炸
 */

const prisma = require("../prisma");
const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { graphCache } = require("../chats/graphCache");
const {
  KG_FEATURE_FLAGS,
  KG_SIMILARITY_CONFIG,
  KG_THROTTLE_CONFIG,
  throttledBatchProcess,
  sleep,
} = require("./featureFlags");

/**
 * 计算结构性相似边（主入口）
 *
 * 策略：
 * 1. 共标签相似：两个文档共享相同标签
 * 2. 共引用相似：多个 chat 引用同一对文档
 * 3. 共 Assistant 相似：同一 assistant 频繁引用的文档
 *
 * @param {number} workspaceId - Workspace ID
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 计算结果统计
 */
async function computeStructuralSimilarityEdges(workspaceId, options = {}) {
  if (!KG_FEATURE_FLAGS.SIMILARITY_EDGES_ENABLED) {
    console.log("[StructuralSimilarity] Feature is disabled");
    return { created: 0, skipped: true };
  }

  console.log(
    `[StructuralSimilarity] Starting computation for workspace ${workspaceId}`
  );
  const startTime = Date.now();
  const stats = {
    tagBased: 0,
    referenceBased: 0,
    assistantBased: 0,
    total: 0,
    errors: 0,
  };

  try {
    // 1. 计算共标签相似边
    if (options.includeTagBased !== false) {
      stats.tagBased = await computeTagBasedSimilarity(workspaceId);
    }

    // 2. 计算共引用相似边
    if (options.includeReferenceBased !== false) {
      stats.referenceBased = await computeReferenceBasedSimilarity(workspaceId);
    }

    // 3. 计算共 Assistant 相似边
    if (options.includeAssistantBased !== false) {
      stats.assistantBased = await computeAssistantBasedSimilarity(workspaceId);
    }

    stats.total = stats.tagBased + stats.referenceBased + stats.assistantBased;

    // 清理缓存
    graphCache.clearWorkspace(workspaceId);

    const duration = Date.now() - startTime;
    console.log(
      `[StructuralSimilarity] Completed in ${duration}ms. ` +
        `Tag: ${stats.tagBased}, Reference: ${stats.referenceBased}, Assistant: ${stats.assistantBased}`
    );

    return stats;
  } catch (error) {
    console.error("[StructuralSimilarity] Error:", error);
    stats.errors++;
    return stats;
  }
}

/**
 * 计算共标签相似边
 * 逻辑：如果两个文档共享至少一个标签，则创建相似边
 *
 * @param {number} workspaceId - Workspace ID
 * @returns {Promise<number>} 创建的边数量
 */
async function computeTagBasedSimilarity(workspaceId) {
  console.log("[StructuralSimilarity] Computing tag-based similarity...");
  let edgesCreated = 0;
  const config = KG_SIMILARITY_CONFIG;

  try {
    // 1. 获取所有标签边 (doc → tag)
    const tagEdges = await prisma.workspace_graph_edges.findMany({
      where: {
        workspaceId,
        relation: "tag",
      },
      select: {
        fromNodeId: true,
        toNodeId: true,
      },
    });

    if (tagEdges.length === 0) {
      return 0;
    }

    // 2. 构建 tag → docs 映射
    const tagToDocsMap = new Map();
    for (const edge of tagEdges) {
      // 假设 fromNodeId 是 doc 节点，toNodeId 是 tag 节点
      const docNodeId = edge.fromNodeId;
      const tagNodeId = edge.toNodeId;

      if (!docNodeId.startsWith("doc_")) continue;

      if (!tagToDocsMap.has(tagNodeId)) {
        tagToDocsMap.set(tagNodeId, new Set());
      }
      tagToDocsMap.get(tagNodeId).add(docNodeId);
    }

    // 3. 对于每个标签，找出共享该标签的文档对
    const docPairScores = new Map(); // 'docA:docB' → score

    for (const [tagNodeId, docNodes] of tagToDocsMap.entries()) {
      const docArray = Array.from(docNodes);
      if (docArray.length < 2) continue;

      // 生成所有文档对
      for (let i = 0; i < docArray.length; i++) {
        for (let j = i + 1; j < docArray.length; j++) {
          const pairKey = [docArray[i], docArray[j]].sort().join(":");
          const currentScore = docPairScores.get(pairKey) || 0;
          docPairScores.set(pairKey, currentScore + 1); // 每共享一个标签 +1
        }
      }
    }

    // 4. 为相似度足够高的文档对创建边
    const pairs = Array.from(docPairScores.entries())
      .filter(([, score]) => score >= 1) // 至少共享 1 个标签
      .sort((a, b) => b[1] - a[1]); // 按分数排序

    // 限制每个节点的相似边数量
    const nodeEdgeCount = new Map();

    for (const [pairKey, score] of pairs) {
      const [docA, docB] = pairKey.split(":");

      // 检查是否超过每个节点的边数限制
      const countA = nodeEdgeCount.get(docA) || 0;
      const countB = nodeEdgeCount.get(docB) || 0;

      if (
        countA >= config.MAX_SIMILAR_EDGES_PER_NODE ||
        countB >= config.MAX_SIMILAR_EDGES_PER_NODE
      ) {
        continue;
      }

      // 计算归一化权重 (0-1)
      const weight = Math.min(1.0, score * 0.2);

      if (weight < config.MIN_SIMILARITY_THRESHOLD) {
        continue;
      }

      try {
        await WorkspaceGraph.upsertEdge({
          workspaceId,
          fromNodeId: docA,
          toNodeId: docB,
          relation: "similar",
          weight,
          metadata: {
            type: "tag_based",
            sharedTagCount: score,
            computedAt: new Date().toISOString(),
          },
        });

        nodeEdgeCount.set(docA, countA + 1);
        nodeEdgeCount.set(docB, countB + 1);
        edgesCreated++;

        // 节流
        if (edgesCreated % KG_THROTTLE_CONFIG.BUILD_BATCH_SIZE === 0) {
          await sleep(KG_THROTTLE_CONFIG.SLEEP_BETWEEN_BATCHES_MS);
        }
      } catch (error) {
        console.warn(
          `[StructuralSimilarity] Error creating tag-based edge: ${error.message}`
        );
      }
    }

    console.log(
      `[StructuralSimilarity] Created ${edgesCreated} tag-based similarity edges`
    );
    return edgesCreated;
  } catch (error) {
    console.error(
      "[StructuralSimilarity] Error in tag-based similarity:",
      error
    );
    return edgesCreated;
  }
}

/**
 * 计算共引用相似边
 * 逻辑：如果多个 chat 同时引用了两个文档，则这两个文档可能相关
 *
 * @param {number} workspaceId - Workspace ID
 * @returns {Promise<number>} 创建的边数量
 */
async function computeReferenceBasedSimilarity(workspaceId) {
  console.log("[StructuralSimilarity] Computing reference-based similarity...");
  let edgesCreated = 0;
  const config = KG_SIMILARITY_CONFIG;

  try {
    // 1. 获取所有 chat → doc 引用边
    const referenceEdges = await prisma.workspace_graph_edges.findMany({
      where: {
        workspaceId,
        relation: "reference",
      },
      select: {
        fromNodeId: true,
        toNodeId: true,
      },
    });

    if (referenceEdges.length === 0) {
      return 0;
    }

    // 2. 构建 chat → docs 映射
    const chatToDocsMap = new Map();
    for (const edge of referenceEdges) {
      const chatNodeId = edge.fromNodeId;
      const docNodeId = edge.toNodeId;

      if (!chatNodeId.startsWith("chat_") || !docNodeId.startsWith("doc_")) {
        continue;
      }

      if (!chatToDocsMap.has(chatNodeId)) {
        chatToDocsMap.set(chatNodeId, new Set());
      }
      chatToDocsMap.get(chatNodeId).add(docNodeId);
    }

    // 3. 对于每个 chat，找出共同被引用的文档对
    const docPairScores = new Map();

    for (const [chatNodeId, docNodes] of chatToDocsMap.entries()) {
      const docArray = Array.from(docNodes);
      if (docArray.length < 2) continue;

      // 生成所有文档对
      for (let i = 0; i < docArray.length; i++) {
        for (let j = i + 1; j < docArray.length; j++) {
          const pairKey = [docArray[i], docArray[j]].sort().join(":");
          const currentScore = docPairScores.get(pairKey) || 0;
          docPairScores.set(pairKey, currentScore + 1);
        }
      }
    }

    // 4. 为共引用次数足够多的文档对创建边
    const pairs = Array.from(docPairScores.entries())
      .filter(([, score]) => score >= 2) // 至少被 2 个 chat 共同引用
      .sort((a, b) => b[1] - a[1]);

    const nodeEdgeCount = new Map();

    for (const [pairKey, score] of pairs) {
      const [docA, docB] = pairKey.split(":");

      const countA = nodeEdgeCount.get(docA) || 0;
      const countB = nodeEdgeCount.get(docB) || 0;

      if (
        countA >= config.MAX_SIMILAR_EDGES_PER_NODE ||
        countB >= config.MAX_SIMILAR_EDGES_PER_NODE
      ) {
        continue;
      }

      const weight = Math.min(1.0, score * 0.15);

      if (weight < config.MIN_SIMILARITY_THRESHOLD) {
        continue;
      }

      try {
        await WorkspaceGraph.upsertEdge({
          workspaceId,
          fromNodeId: docA,
          toNodeId: docB,
          relation: "similar",
          weight,
          metadata: {
            type: "reference_based",
            coReferenceCount: score,
            computedAt: new Date().toISOString(),
          },
        });

        nodeEdgeCount.set(docA, countA + 1);
        nodeEdgeCount.set(docB, countB + 1);
        edgesCreated++;

        if (edgesCreated % KG_THROTTLE_CONFIG.BUILD_BATCH_SIZE === 0) {
          await sleep(KG_THROTTLE_CONFIG.SLEEP_BETWEEN_BATCHES_MS);
        }
      } catch (error) {
        console.warn(
          `[StructuralSimilarity] Error creating reference-based edge: ${error.message}`
        );
      }
    }

    console.log(
      `[StructuralSimilarity] Created ${edgesCreated} reference-based similarity edges`
    );
    return edgesCreated;
  } catch (error) {
    console.error(
      "[StructuralSimilarity] Error in reference-based similarity:",
      error
    );
    return edgesCreated;
  }
}

/**
 * 计算共 Assistant 相似边
 * 逻辑：同一个 Assistant 频繁引用的文档之间可能相关
 *
 * @param {number} workspaceId - Workspace ID
 * @returns {Promise<number>} 创建的边数量
 */
async function computeAssistantBasedSimilarity(workspaceId) {
  console.log("[StructuralSimilarity] Computing assistant-based similarity...");
  let edgesCreated = 0;
  const config = KG_SIMILARITY_CONFIG;

  try {
    // 1. 获取所有 assistant → doc 引用边
    const assistantEdges = await prisma.workspace_graph_edges.findMany({
      where: {
        workspaceId,
        relation: "reference",
        fromNodeId: { startsWith: "assistant:" },
      },
      select: {
        fromNodeId: true,
        toNodeId: true,
      },
    });

    if (assistantEdges.length === 0) {
      return 0;
    }

    // 2. 构建 assistant → docs 映射
    const assistantToDocsMap = new Map();
    for (const edge of assistantEdges) {
      const assistantNodeId = edge.fromNodeId;
      const docNodeId = edge.toNodeId;

      if (!docNodeId.startsWith("doc_")) continue;

      if (!assistantToDocsMap.has(assistantNodeId)) {
        assistantToDocsMap.set(assistantNodeId, new Set());
      }
      assistantToDocsMap.get(assistantNodeId).add(docNodeId);
    }

    // 3. 对于每个 assistant，找出其引用的文档对
    const docPairScores = new Map();

    for (const [assistantNodeId, docNodes] of assistantToDocsMap.entries()) {
      const docArray = Array.from(docNodes);
      if (docArray.length < 2) continue;

      // 生成所有文档对，但限制数量避免爆炸
      const maxPairs = 50;
      let pairCount = 0;

      for (let i = 0; i < docArray.length && pairCount < maxPairs; i++) {
        for (let j = i + 1; j < docArray.length && pairCount < maxPairs; j++) {
          const pairKey = [docArray[i], docArray[j]].sort().join(":");
          const currentScore = docPairScores.get(pairKey) || 0;
          docPairScores.set(pairKey, currentScore + 1);
          pairCount++;
        }
      }
    }

    // 4. 为被多个 assistant 共同引用的文档对创建边
    const pairs = Array.from(docPairScores.entries())
      .filter(([, score]) => score >= 1)
      .sort((a, b) => b[1] - a[1]);

    const nodeEdgeCount = new Map();

    for (const [pairKey, score] of pairs) {
      const [docA, docB] = pairKey.split(":");

      const countA = nodeEdgeCount.get(docA) || 0;
      const countB = nodeEdgeCount.get(docB) || 0;

      if (
        countA >= config.MAX_SIMILAR_EDGES_PER_NODE ||
        countB >= config.MAX_SIMILAR_EDGES_PER_NODE
      ) {
        continue;
      }

      const weight = Math.min(1.0, score * 0.1 + 0.3);

      if (weight < config.MIN_SIMILARITY_THRESHOLD) {
        continue;
      }

      try {
        await WorkspaceGraph.upsertEdge({
          workspaceId,
          fromNodeId: docA,
          toNodeId: docB,
          relation: "similar",
          weight,
          metadata: {
            type: "assistant_based",
            sharedAssistantCount: score,
            computedAt: new Date().toISOString(),
          },
        });

        nodeEdgeCount.set(docA, countA + 1);
        nodeEdgeCount.set(docB, countB + 1);
        edgesCreated++;

        if (edgesCreated % KG_THROTTLE_CONFIG.BUILD_BATCH_SIZE === 0) {
          await sleep(KG_THROTTLE_CONFIG.SLEEP_BETWEEN_BATCHES_MS);
        }
      } catch (error) {
        console.warn(
          `[StructuralSimilarity] Error creating assistant-based edge: ${error.message}`
        );
      }
    }

    console.log(
      `[StructuralSimilarity] Created ${edgesCreated} assistant-based similarity edges`
    );
    return edgesCreated;
  } catch (error) {
    console.error(
      "[StructuralSimilarity] Error in assistant-based similarity:",
      error
    );
    return edgesCreated;
  }
}

/**
 * 清理相似边
 * @param {number} workspaceId - Workspace ID
 * @param {Object} options - 选项
 * @returns {Promise<number>} 删除的边数量
 */
async function clearSimilarityEdges(workspaceId, options = {}) {
  try {
    const where = {
      workspaceId,
      relation: "similar",
    };

    // 可选：只清理特定类型的相似边
    if (options.type) {
      // 需要通过 metadata 过滤，这里简化处理
    }

    const result = await prisma.workspace_graph_edges.deleteMany({ where });
    graphCache.clearWorkspace(workspaceId);

    console.log(
      `[StructuralSimilarity] Cleared ${result.count} similarity edges for workspace ${workspaceId}`
    );
    return result.count;
  } catch (error) {
    console.error(
      "[StructuralSimilarity] Error clearing similarity edges:",
      error
    );
    return 0;
  }
}

module.exports = {
  computeStructuralSimilarityEdges,
  computeTagBasedSimilarity,
  computeReferenceBasedSimilarity,
  computeAssistantBasedSimilarity,
  clearSimilarityEdges,
};
