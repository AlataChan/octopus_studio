/**
 * 实体抽取模块
 * @module utils/graphBuilder/entityExtractor
 * @description 从文档内容中自动抽取概念实体和关系
 *
 * 注意：此功能默认关闭，需要显式启用
 * 使用前请确保：
 * 1. 设置 KG_ENTITY_EXTRACTION_ENABLED=true
 * 2. 配置 LLM Provider
 * 3. 了解成本影响（每文档一次 LLM 调用）
 */

const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { graphCache } = require("../chats/graphCache");
const {
  KG_FEATURE_FLAGS,
  KG_ENTITY_EXTRACTION_CONFIG,
  KG_THROTTLE_CONFIG,
  throttledBatchProcess,
  sleep,
} = require("./featureFlags");

/**
 * 生成字符串的哈希值
 * @param {string} str - 输入字符串
 * @returns {string} 哈希值（16进制）
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * 获取 LLM Provider
 * @returns {Object} LLM Provider 实例
 */
function getLLMConnector() {
  try {
    const { getLLMProvider } = require("../helpers");
    return getLLMProvider();
  } catch (error) {
    console.error("[EntityExtractor] Failed to get LLM provider:", error);
    return null;
  }
}

/**
 * 检查 Workspace 的实体数量是否超过限制
 * @param {number} workspaceId - Workspace ID
 * @returns {Promise<boolean>} 是否超过限制
 */
async function isEntityLimitExceeded(workspaceId) {
  const prisma = require("../prisma");
  const config = KG_ENTITY_EXTRACTION_CONFIG;

  const count = await prisma.workspace_graph_nodes.count({
    where: {
      workspaceId,
      type: "entity",
    },
  });

  return count >= config.MAX_ENTITIES_PER_WORKSPACE;
}

/**
 * 构建实体抽取的 Prompt
 * @param {string} text - 文档文本
 * @param {Object} config - 配置
 * @returns {string} Prompt 文本
 */
function buildExtractionPrompt(text, config) {
  return `你是一个知识图谱构建专家。请从以下文本中提取关键实体和它们之间的关系。

文本内容：
${text}

请严格按照以下 JSON 格式返回：
{
  "entities": [
    {
      "name": "实体名称",
      "type": "concept|technology|person|organization|product",
      "description": "简短描述（20字以内）",
      "confidence": 0.9
    }
  ],
  "relations": [
    {
      "from": "实体A名称",
      "to": "实体B名称",
      "relation": "关系类型（如：使用、包含、属于、依赖、创建）",
      "confidence": 0.8
    }
  ]
}

注意：
1. 只提取明确在文本中提到的实体和关系
2. 实体名称应该是标准化的术语
3. confidence 表示你对这个提取的确信程度（0-1）
4. 最多提取 ${config.MAX_ENTITIES_PER_DOC} 个实体
5. 实体类型必须是以下之一：${config.ENTITY_TYPES.join("、")}
6. 只返回 JSON，不要返回其他内容`;
}

/**
 * 解析 LLM 返回的 JSON
 * @param {string} response - LLM 响应
 * @returns {Object|null} 解析结果
 */
function parseExtractionResponse(response) {
  try {
    // 尝试直接解析
    return JSON.parse(response);
  } catch {
    // 尝试从 markdown 代码块中提取
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // 继续尝试其他方式
      }
    }

    // 尝试找到第一个 { 和最后一个 }
    const startIdx = response.indexOf("{");
    const endIdx = response.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      try {
        return JSON.parse(response.slice(startIdx, endIdx + 1));
      } catch {
        // 解析失败
      }
    }

    console.warn("[EntityExtractor] Failed to parse LLM response");
    return null;
  }
}

/**
 * 从文档内容中抽取实体和关系
 *
 * @param {string} documentText - 文档文本内容
 * @param {string} docId - 文档 ID
 * @param {number} workspaceId - 工作区 ID
 * @returns {Promise<{entities: Array, relations: Array}>}
 */
async function extractEntities(documentText, docId, workspaceId) {
  const config = KG_ENTITY_EXTRACTION_CONFIG;

  // 基本验证
  if (!documentText || documentText.length < 100) {
    return {
      entities: [],
      relations: [],
      skipped: true,
      reason: "text_too_short",
    };
  }

  // 功能开关检查
  if (!KG_FEATURE_FLAGS.ENTITY_EXTRACTION_ENABLED) {
    return {
      entities: [],
      relations: [],
      skipped: true,
      reason: "feature_disabled",
    };
  }

  // 检查配额
  if (await isEntityLimitExceeded(workspaceId)) {
    console.warn(
      `[EntityExtractor] Workspace ${workspaceId} has reached entity limit`
    );
    return {
      entities: [],
      relations: [],
      skipped: true,
      reason: "quota_exceeded",
    };
  }

  const LLMConnector = getLLMConnector();
  if (!LLMConnector) {
    return {
      entities: [],
      relations: [],
      skipped: true,
      reason: "no_llm_provider",
    };
  }

  // 截取文档前 N 字符进行抽取（控制成本）
  const textChunk = documentText.slice(0, config.MAX_CHUNK_SIZE);
  const prompt = buildExtractionPrompt(textChunk, config);

  try {
    const response = await LLMConnector.getChatCompletion(
      [{ role: "user", content: prompt }],
      { temperature: 0.1 }
    );

    const result = parseExtractionResponse(response);
    if (!result) {
      return {
        entities: [],
        relations: [],
        skipped: true,
        reason: "parse_failed",
      };
    }

    // 过滤低置信度结果
    const filteredEntities = (result.entities || [])
      .filter((e) => e.confidence >= config.MIN_CONFIDENCE)
      .filter((e) => config.ENTITY_TYPES.includes(e.type))
      .slice(0, config.MAX_ENTITIES_PER_DOC);

    const filteredRelations = (result.relations || []).filter(
      (r) => r.confidence >= config.MIN_CONFIDENCE
    );

    console.log(
      `[EntityExtractor] Extracted ${filteredEntities.length} entities, ` +
        `${filteredRelations.length} relations from doc ${docId}`
    );

    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  } catch (error) {
    console.error("[EntityExtractor] Error extracting entities:", error);
    return {
      entities: [],
      relations: [],
      skipped: true,
      reason: error.message,
    };
  }
}

/**
 * 将抽取的实体存入图谱
 *
 * @param {Array} entities - 实体数组
 * @param {Array} relations - 关系数组
 * @param {string} docId - 源文档 ID
 * @param {number} workspaceId - Workspace ID
 * @returns {Promise<Object>} 存储统计
 */
async function storeExtractedEntities(entities, relations, docId, workspaceId) {
  const config = KG_ENTITY_EXTRACTION_CONFIG;
  const stats = {
    nodesCreated: 0,
    edgesCreated: 0,
    errors: 0,
  };

  if (!entities || entities.length === 0) {
    return stats;
  }

  try {
    // 创建实体节点
    for (const entity of entities) {
      const nodeId = `entity_${hashString(entity.name.toLowerCase())}`;

      try {
        // 使用统一的 'entity' 类型，细分放 metadata
        await WorkspaceGraph.upsertNode({
          workspaceId,
          nodeId,
          type: "entity", // 统一类型，降低复杂度
          label: entity.name,
          metadata: {
            entityType: entity.type, // 细分类型放这里
            description: entity.description,
            confidence: entity.confidence,
            sourceDocId: docId,
            extractedAt: new Date().toISOString(),
          },
        });

        // 创建实体到源文档的边
        await WorkspaceGraph.upsertEdge({
          workspaceId,
          fromNodeId: nodeId,
          toNodeId: `doc_${docId}`,
          relation: "mentioned_in",
          metadata: { confidence: entity.confidence },
        });

        stats.nodesCreated++;

        // 节流
        if (stats.nodesCreated % KG_THROTTLE_CONFIG.BUILD_BATCH_SIZE === 0) {
          await sleep(KG_THROTTLE_CONFIG.SLEEP_BETWEEN_BATCHES_MS);
        }
      } catch (error) {
        console.warn(
          `[EntityExtractor] Error storing entity ${entity.name}: ${error.message}`
        );
        stats.errors++;
      }
    }

    // 创建实体间关系边
    const entityEdgeCount = new Map();

    for (const rel of relations) {
      const fromNodeId = `entity_${hashString(rel.from.toLowerCase())}`;
      const toNodeId = `entity_${hashString(rel.to.toLowerCase())}`;

      // 检查边数限制
      const countFrom = entityEdgeCount.get(fromNodeId) || 0;
      const countTo = entityEdgeCount.get(toNodeId) || 0;

      if (
        countFrom >= config.MAX_RELATIONS_PER_ENTITY ||
        countTo >= config.MAX_RELATIONS_PER_ENTITY
      ) {
        continue;
      }

      try {
        await WorkspaceGraph.upsertEdge({
          workspaceId,
          fromNodeId,
          toNodeId,
          relation: rel.relation || "related_to",
          weight: rel.confidence,
          metadata: {
            confidence: rel.confidence,
            sourceDocId: docId,
          },
        });

        entityEdgeCount.set(fromNodeId, countFrom + 1);
        entityEdgeCount.set(toNodeId, countTo + 1);
        stats.edgesCreated++;
      } catch (error) {
        console.warn(
          `[EntityExtractor] Error storing relation: ${error.message}`
        );
        stats.errors++;
      }
    }

    // 清理缓存
    graphCache.clearWorkspace(workspaceId);

    return stats;
  } catch (error) {
    console.error("[EntityExtractor] Error in storeExtractedEntities:", error);
    stats.errors++;
    return stats;
  }
}

/**
 * 批量处理多个文档的实体抽取
 *
 * @param {Array} documents - 文档数组 [{docId, text, workspaceId}]
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 处理统计
 */
async function batchExtractEntities(documents, options = {}) {
  if (!KG_FEATURE_FLAGS.ENTITY_EXTRACTION_ENABLED) {
    console.log("[EntityExtractor] Feature is disabled");
    return { processed: 0, skipped: documents.length };
  }

  const stats = {
    processed: 0,
    skipped: 0,
    totalEntities: 0,
    totalRelations: 0,
    errors: 0,
  };

  const processor = async (doc) => {
    try {
      const { entities, relations, skipped } = await extractEntities(
        doc.text,
        doc.docId,
        doc.workspaceId
      );

      if (skipped) {
        stats.skipped++;
        return null;
      }

      const storeResult = await storeExtractedEntities(
        entities,
        relations,
        doc.docId,
        doc.workspaceId
      );

      stats.processed++;
      stats.totalEntities += storeResult.nodesCreated;
      stats.totalRelations += storeResult.edgesCreated;
      stats.errors += storeResult.errors;

      return storeResult;
    } catch (error) {
      console.error(
        `[EntityExtractor] Error processing doc ${doc.docId}:`,
        error
      );
      stats.errors++;
      return null;
    }
  };

  await throttledBatchProcess(documents, processor, {
    batchSize: options.batchSize || 5, // 实体抽取较重，降低并发
    sleepMs: options.sleepMs || 1000, // 增加间隔
    onProgress: options.onProgress,
  });

  console.log(
    `[EntityExtractor] Batch complete. Processed: ${stats.processed}, ` +
      `Entities: ${stats.totalEntities}, Relations: ${stats.totalRelations}`
  );

  return stats;
}

/**
 * 清理指定类型的实体节点
 *
 * @param {number} workspaceId - Workspace ID
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 清理统计
 */
async function clearEntities(workspaceId, options = {}) {
  const prisma = require("../prisma");

  try {
    const where = {
      workspaceId,
      type: "entity",
    };

    // 可选：只清理特定来源的实体
    if (options.sourceDocId) {
      // 需要通过 metadata 过滤
    }

    // 首先删除相关的边
    const edgesDeleted = await prisma.workspace_graph_edges.deleteMany({
      where: {
        workspaceId,
        OR: [
          { relation: "mentioned_in" },
          { relation: "related_to" },
          { fromNodeId: { startsWith: "entity_" } },
          { toNodeId: { startsWith: "entity_" } },
        ],
      },
    });

    // 然后删除实体节点
    const nodesDeleted = await prisma.workspace_graph_nodes.deleteMany({
      where,
    });

    graphCache.clearWorkspace(workspaceId);

    console.log(
      `[EntityExtractor] Cleared ${nodesDeleted.count} entity nodes, ` +
        `${edgesDeleted.count} edges for workspace ${workspaceId}`
    );

    return {
      nodesDeleted: nodesDeleted.count,
      edgesDeleted: edgesDeleted.count,
    };
  } catch (error) {
    console.error("[EntityExtractor] Error clearing entities:", error);
    return { nodesDeleted: 0, edgesDeleted: 0, error: error.message };
  }
}

/**
 * 获取实体抽取状态
 * @param {number} workspaceId - Workspace ID
 * @returns {Promise<Object>} 状态信息
 */
async function getEntityExtractionStatus(workspaceId) {
  const prisma = require("../prisma");
  const config = KG_ENTITY_EXTRACTION_CONFIG;

  const entityCount = await prisma.workspace_graph_nodes.count({
    where: { workspaceId, type: "entity" },
  });

  return {
    enabled: KG_FEATURE_FLAGS.ENTITY_EXTRACTION_ENABLED,
    entityCount,
    maxEntities: config.MAX_ENTITIES_PER_WORKSPACE,
    quotaUsed:
      ((entityCount / config.MAX_ENTITIES_PER_WORKSPACE) * 100).toFixed(1) +
      "%",
    config: {
      maxChunkSize: config.MAX_CHUNK_SIZE,
      minConfidence: config.MIN_CONFIDENCE,
      maxEntitiesPerDoc: config.MAX_ENTITIES_PER_DOC,
    },
  };
}

module.exports = {
  extractEntities,
  storeExtractedEntities,
  batchExtractEntities,
  clearEntities,
  getEntityExtractionStatus,
  hashString,
  KG_ENTITY_EXTRACTION_CONFIG,
};
