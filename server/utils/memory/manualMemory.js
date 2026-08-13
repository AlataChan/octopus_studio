/**
 * 手动记忆管理器
 *
 * Phase 1 任务 3: 用户触发「记住」功能
 * 允许用户手动保存重要信息到知识图谱
 *
 * @module utils/memory/manualMemory
 */

const { v4: uuidv4 } = require("uuid");
const { WorkspaceGraph } = require("../../models/workspaceGraph");

/**
 * 记忆类型枚举
 */
const MEMORY_TYPES = {
  /** 用户偏好 */
  PREFERENCE: "preference",
  /** 重要事实 */
  FACT: "fact",
  /** 项目信息 */
  PROJECT: "project",
  /** 联系人信息 */
  CONTACT: "contact",
  /** 自定义 */
  CUSTOM: "custom",
};

/**
 * 手动记忆管理器
 */
const ManualMemory = {
  /**
   * 保存记忆到知识图谱
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.content - 记忆内容
   * @param {string} [params.type='custom'] - 记忆类型
   * @param {string[]} [params.tags=[]] - 标签
   * @param {number|null} [params.userId=null] - 创建者用户 ID
   * @param {string|null} [params.sourceMessageId=null] - 来源消息 ID
   * @returns {Promise<Object>} 创建的记忆节点
   */
  saveMemory: async function ({
    workspaceId,
    content,
    type = MEMORY_TYPES.CUSTOM,
    tags = [],
    userId = null,
    sourceMessageId = null,
  }) {
    try {
      if (!workspaceId || !content) {
        throw new Error("workspaceId and content are required");
      }

      const memoryId = `memory_${uuidv4()}`;
      const now = new Date().toISOString();

      const metadata = {
        content,
        type,
        tags,
        createdBy: userId,
        sourceMessageId,
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
        lastAccessedAt: null,
      };

      // 创建记忆节点
      await WorkspaceGraph.upsertNode({
        workspaceId,
        nodeId: memoryId,
        type: "memory",
        label: content.substring(0, 100), // 截取前 100 字符作为标签
        externalId: sourceMessageId,
        metadata,
      });

      // 如果有标签，创建标签节点和关联边
      for (const tag of tags) {
        const tagNodeId = `tag_${tag.toLowerCase().replace(/\s+/g, "_")}`;

        // 确保标签节点存在
        await WorkspaceGraph.upsertNode({
          workspaceId,
          nodeId: tagNodeId,
          type: "tag",
          label: tag,
        });

        // 创建记忆到标签的边
        await WorkspaceGraph.upsertEdge({
          workspaceId,
          fromNodeId: memoryId,
          toNodeId: tagNodeId,
          relation: "tagged",
          weight: 1.0,
        });
      }

      console.log(`[ManualMemory] Saved memory: ${memoryId} (${type})`);

      return {
        id: memoryId,
        content,
        type,
        tags,
        createdAt: now,
      };
    } catch (error) {
      console.error("[ManualMemory] Error saving memory:", error);
      throw error;
    }
  },

  /**
   * 获取 Workspace 的所有手动记忆
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} [params.type] - 按类型筛选
   * @param {number} [params.limit=50] - 最大返回数量
   * @returns {Promise<Object[]>} 记忆列表
   */
  getMemories: async function ({ workspaceId, type, limit = 50 }) {
    try {
      const nodes = await WorkspaceGraph.getNodesByType({
        workspaceId,
        type: "memory",
        limit,
      });

      let memories = nodes.map((node) => ({
        id: node.nodeId,
        content: node.metadata?.content || node.label,
        type: node.metadata?.type || MEMORY_TYPES.CUSTOM,
        tags: node.metadata?.tags || [],
        createdAt: node.metadata?.createdAt || node.createdAt,
        createdBy: node.metadata?.createdBy,
      }));

      // 按类型筛选
      if (type) {
        memories = memories.filter((m) => m.type === type);
      }

      return memories;
    } catch (error) {
      console.error("[ManualMemory] Error getting memories:", error);
      return [];
    }
  },

  /**
   * 删除记忆
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.memoryId - 记忆 ID
   * @returns {Promise<boolean>} 是否成功
   */
  deleteMemory: async function ({ workspaceId, memoryId }) {
    try {
      const success = await WorkspaceGraph.deleteNode({
        workspaceId,
        nodeId: memoryId,
      });

      if (success) {
        console.log(`[ManualMemory] Deleted memory: ${memoryId}`);
      }

      return success;
    } catch (error) {
      console.error("[ManualMemory] Error deleting memory:", error);
      return false;
    }
  },

  /**
   * 搜索记忆
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.query - 搜索关键词
   * @param {number} [params.limit=20] - 最大返回数量
   * @returns {Promise<Object[]>} 匹配的记忆列表
   */
  searchMemories: async function ({ workspaceId, query, limit = 20 }) {
    try {
      const subgraph = await WorkspaceGraph.searchSubgraph({
        workspaceId,
        keyword: query,
        limit,
      });

      // 过滤出记忆类型的节点
      const memoryNodes = subgraph.nodes.filter(
        (node) => node.type === "memory"
      );

      return memoryNodes.map((node) => ({
        id: node.nodeId,
        content: node.metadata?.content || node.label,
        type: node.metadata?.type || MEMORY_TYPES.CUSTOM,
        tags: node.metadata?.tags || [],
        createdAt: node.metadata?.createdAt,
        score: node.rank || 0,
      }));
    } catch (error) {
      console.error("[ManualMemory] Error searching memories:", error);
      return [];
    }
  },

  /**
   * 记录记忆访问（用于排序优化）
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.memoryId - 记忆 ID
   * @returns {Promise<void>}
   */
  recordAccess: async function ({ workspaceId, memoryId }) {
    try {
      const node = await WorkspaceGraph.getNode({
        workspaceId,
        nodeId: memoryId,
      });
      if (!node) return;

      const metadata = node.metadata || {};
      metadata.accessCount = (metadata.accessCount || 0) + 1;
      metadata.lastAccessedAt = new Date().toISOString();

      await WorkspaceGraph.upsertNode({
        workspaceId,
        nodeId: memoryId,
        type: "memory",
        label: node.label,
        metadata,
      });
    } catch (error) {
      console.error("[ManualMemory] Error recording access:", error);
    }
  },
};

module.exports = {
  ManualMemory,
  MEMORY_TYPES,
};
