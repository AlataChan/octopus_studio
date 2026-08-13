/**
 * Episode 管理器
 *
 * Phase 1 任务 1: Episode 作为 Graph Node
 * - 复用现有图谱，扩展节点类型支持 Episode
 * - Episode 用于组织跨会话的项目/任务记忆
 *
 * @module memory/episodeManager
 */

const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { v4: uuidv4 } = require("uuid");

/**
 * Episode 状态枚举
 */
const EPISODE_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  ARCHIVED: "archived",
};

/**
 * Episode 管理器
 */
const EpisodeManager = {
  /**
   * 创建新的 Episode
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.name - Episode 名称
   * @param {string} params.description - 描述
   * @param {string[]} params.tags - 标签数组
   * @param {number} params.userId - 创建者 ID
   * @returns {Promise<Object>} 创建的 Episode 节点
   */
  createEpisode: async function ({
    workspaceId,
    name,
    description = "",
    tags = [],
    userId = null,
  }) {
    try {
      const episodeId = `episode_${uuidv4()}`;

      const metadata = {
        description,
        tags,
        status: EPISODE_STATUS.ACTIVE,
        createdBy: userId,
        startDate: new Date().toISOString(),
        endDate: null,
        linkedChats: [],
        linkedDocs: [],
        summary: null,
        stats: {
          chatCount: 0,
          docCount: 0,
          lastActivityAt: new Date().toISOString(),
        },
      };

      await WorkspaceGraph.upsertNode({
        workspaceId,
        nodeId: episodeId,
        type: "episode",
        label: name,
        externalId: null,
        metadata,
      });

      console.log(`[EpisodeManager] Created episode: ${name} (${episodeId})`);

      // 创建标签关系
      if (tags.length > 0) {
        for (const tag of tags) {
          const tagNodeId = `tag_${tag.toLowerCase().replace(/\s+/g, "_")}`;

          // 确保标签节点存在
          await WorkspaceGraph.upsertNode({
            workspaceId,
            nodeId: tagNodeId,
            type: "tag",
            label: tag,
          });

          // 创建 Episode -> Tag 边
          await WorkspaceGraph.upsertEdge({
            workspaceId,
            fromNodeId: episodeId,
            toNodeId: tagNodeId,
            relation: "tag",
            weight: 1.0,
          });
        }
      }

      return {
        id: episodeId,
        name,
        ...metadata,
        workspaceId,
      };
    } catch (error) {
      console.error("[EpisodeManager] Error creating episode:", error);
      throw error;
    }
  },

  /**
   * 获取 Workspace 下的所有 Episode
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.status - 筛选状态 (可选)
   * @returns {Promise<Object[]>} Episode 列表
   */
  getEpisodes: async function ({ workspaceId, status = null }) {
    try {
      const nodes = await WorkspaceGraph.getNodesByType({
        workspaceId,
        type: "episode",
      });

      let episodes = nodes.map((node) => ({
        id: node.nodeId,
        name: node.label,
        ...node.metadata,
        workspaceId: node.workspaceId,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      }));

      // 按状态筛选
      if (status) {
        episodes = episodes.filter((e) => e.status === status);
      }

      // 按最后活动时间排序
      episodes.sort((a, b) => {
        const timeA = new Date(a.stats?.lastActivityAt || a.createdAt);
        const timeB = new Date(b.stats?.lastActivityAt || b.createdAt);
        return timeB - timeA;
      });

      return episodes;
    } catch (error) {
      console.error("[EpisodeManager] Error getting episodes:", error);
      return [];
    }
  },

  /**
   * 获取单个 Episode 详情
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.episodeId - Episode ID
   * @returns {Promise<Object|null>} Episode 详情
   */
  getEpisode: async function ({ workspaceId, episodeId }) {
    try {
      const node = await WorkspaceGraph.getNode({
        workspaceId,
        nodeId: episodeId,
      });
      if (!node || node.type !== "episode") return null;

      // 获取关联的节点
      const subgraph = await WorkspaceGraph.getSubgraphByNode({
        workspaceId,
        nodeId: episodeId,
        depth: 1,
      });

      const linkedChats = subgraph.nodes.filter((n) => n.type === "chat");
      const linkedDocs = subgraph.nodes.filter((n) => n.type === "doc");
      const linkedTags = subgraph.nodes.filter((n) => n.type === "tag");

      return {
        id: node.nodeId,
        name: node.label,
        ...node.metadata,
        linkedChats: linkedChats.map((c) => ({ id: c.nodeId, label: c.label })),
        linkedDocs: linkedDocs.map((d) => ({ id: d.nodeId, label: d.label })),
        tags: linkedTags.map((t) => t.label),
        workspaceId: node.workspaceId,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      };
    } catch (error) {
      console.error("[EpisodeManager] Error getting episode:", error);
      return null;
    }
  },

  /**
   * 更新 Episode
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.episodeId - Episode ID
   * @param {Object} params.updates - 更新字段
   * @returns {Promise<Object|null>} 更新后的 Episode
   */
  updateEpisode: async function ({ workspaceId, episodeId, updates }) {
    try {
      const existing = await this.getEpisode({ workspaceId, episodeId });
      if (!existing) return null;

      const newMetadata = {
        ...existing,
        ...updates,
        stats: {
          ...existing.stats,
          lastActivityAt: new Date().toISOString(),
        },
      };

      // 如果状态改为 completed，设置结束日期
      if (updates.status === EPISODE_STATUS.COMPLETED && !existing.endDate) {
        newMetadata.endDate = new Date().toISOString();
      }

      await WorkspaceGraph.upsertNode({
        workspaceId,
        nodeId: episodeId,
        type: "episode",
        label: updates.name || existing.name,
        metadata: newMetadata,
      });

      console.log(`[EpisodeManager] Updated episode: ${episodeId}`);
      return { id: episodeId, ...newMetadata };
    } catch (error) {
      console.error("[EpisodeManager] Error updating episode:", error);
      return null;
    }
  },

  /**
   * 将聊天/文档关联到 Episode
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.episodeId - Episode ID
   * @param {string} params.targetNodeId - 目标节点 ID (chat_xxx 或 doc_xxx)
   * @param {string} params.relation - 关系类型 (默认 'belongs_to')
   * @returns {Promise<boolean>} 是否成功
   */
  linkToEpisode: async function ({
    workspaceId,
    episodeId,
    targetNodeId,
    relation = "belongs_to",
  }) {
    try {
      await WorkspaceGraph.upsertEdge({
        workspaceId,
        fromNodeId: targetNodeId,
        toNodeId: episodeId,
        relation,
        weight: 1.0,
        metadata: {
          linkedAt: new Date().toISOString(),
        },
      });

      // 更新 Episode 统计
      const episode = await this.getEpisode({ workspaceId, episodeId });
      if (episode) {
        const isChat = targetNodeId.startsWith("chat_");
        const stats = {
          ...episode.stats,
          chatCount: isChat
            ? (episode.stats?.chatCount || 0) + 1
            : episode.stats?.chatCount || 0,
          docCount: !isChat
            ? (episode.stats?.docCount || 0) + 1
            : episode.stats?.docCount || 0,
          lastActivityAt: new Date().toISOString(),
        };

        await WorkspaceGraph.upsertNode({
          workspaceId,
          nodeId: episodeId,
          type: "episode",
          label: episode.name,
          metadata: { ...episode, stats },
        });
      }

      console.log(
        `[EpisodeManager] Linked ${targetNodeId} to episode ${episodeId}`
      );
      return true;
    } catch (error) {
      console.error("[EpisodeManager] Error linking to episode:", error);
      return false;
    }
  },

  /**
   * 从 Episode 取消关联
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.episodeId - Episode ID
   * @param {string} params.targetNodeId - 目标节点 ID
   * @returns {Promise<boolean>} 是否成功
   */
  unlinkFromEpisode: async function ({ workspaceId, episodeId, targetNodeId }) {
    try {
      await WorkspaceGraph.deleteEdge({
        workspaceId,
        fromNodeId: targetNodeId,
        toNodeId: episodeId,
      });

      console.log(
        `[EpisodeManager] Unlinked ${targetNodeId} from episode ${episodeId}`
      );
      return true;
    } catch (error) {
      console.error("[EpisodeManager] Error unlinking from episode:", error);
      return false;
    }
  },

  /**
   * 删除 Episode
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.episodeId - Episode ID
   * @returns {Promise<boolean>} 是否成功
   */
  deleteEpisode: async function ({ workspaceId, episodeId }) {
    try {
      await WorkspaceGraph.deleteNode({ workspaceId, nodeId: episodeId });
      console.log(`[EpisodeManager] Deleted episode: ${episodeId}`);
      return true;
    } catch (error) {
      console.error("[EpisodeManager] Error deleting episode:", error);
      return false;
    }
  },

  /**
   * 获取活跃的 Episode (用于自动关联)
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @returns {Promise<Object[]>} 活跃的 Episode 列表
   */
  getActiveEpisodes: async function ({ workspaceId }) {
    return this.getEpisodes({ workspaceId, status: EPISODE_STATUS.ACTIVE });
  },

  /**
   * 搜索 Episode
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.keyword - 搜索关键词
   * @returns {Promise<Object[]>} 匹配的 Episode 列表
   */
  searchEpisodes: async function ({ workspaceId, keyword }) {
    try {
      const subgraph = await WorkspaceGraph.searchSubgraph({
        workspaceId,
        keyword,
        limit: 20,
      });

      const episodes = subgraph.nodes
        .filter((n) => n.type === "episode")
        .map((node) => ({
          id: node.nodeId,
          name: node.label,
          ...node.metadata,
        }));

      return episodes;
    } catch (error) {
      console.error("[EpisodeManager] Error searching episodes:", error);
      return [];
    }
  },
};

module.exports = { EpisodeManager, EPISODE_STATUS };
