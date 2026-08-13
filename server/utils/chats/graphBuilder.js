const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { safeJsonParse } = require("../http");

/**
 * 图谱构建器
 * 用于从文档、聊天记录等自动提取节点和边
 */
const GraphBuilder = {
  /**
   * 从文档创建图谱节点
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {Object} params.document - 文档对象 (workspace_documents)
   * @returns {Promise<Object|null>} 创建的节点
   */
  createDocumentNode: async function ({ workspaceId, document }) {
    try {
      const metadata = safeJsonParse(document.metadata, {});
      const nodeId = `doc_${document.docId}`;

      // 提取文档标题
      const label = metadata.title || document.filename || "未命名文档";

      // 提取标签
      const tags = this.extractTags(metadata);

      const node = await WorkspaceGraph.upsertNode({
        workspaceId,
        nodeId,
        type: "doc",
        label,
        externalId: document.docId,
        metadata: {
          filename: document.filename,
          docpath: document.docpath,
          title: metadata.title,
          description: metadata.description,
          tags,
          createdAt: document.createdAt,
        },
      });

      console.log(`[GraphBuilder] Created doc node: ${label} (${nodeId})`);

      // 自动创建标签节点和关系
      if (tags && tags.length > 0) {
        await this.createTagRelations({
          workspaceId,
          sourceNodeId: nodeId,
          tags,
        });
      }

      return node;
    } catch (error) {
      console.error("[GraphBuilder] Error creating document node:", error);
      return null;
    }
  },

  /**
   * 从聊天记录创建图谱节点
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {Object} params.chat - 聊天记录对象 (workspace_chats)
   * @param {Array} params.sources - 引用的文档来源
   * @returns {Promise<Object|null>} 创建的节点
   */
  createChatNode: async function ({ workspaceId, chat, sources = [] }) {
    try {
      const nodeId = `chat_${chat.id}`;
      const label = chat.prompt.substring(0, 50) + "..."; // 使用前 50 个字符作为标题

      // 解析 response 以获取 metadata
      const responseObj = safeJsonParse(chat.response, {});
      const metadata = responseObj.metadata || {};
      const assistantId = metadata.assistantId;

      const node = await WorkspaceGraph.upsertNode({
        workspaceId,
        nodeId,
        type: "chat",
        label,
        externalId: String(chat.id),
        metadata: {
          prompt: chat.prompt,
          response: chat.response,
          createdAt: chat.createdAt,
          assistantId: assistantId || null,
          knowledgeMode: metadata.knowledgeMode || null,
        },
      });

      console.log(`[GraphBuilder] Created chat node: ${label} (${nodeId})`);

      // 【M6】如果使用了助手，创建 assistant → chat 边
      if (assistantId) {
        try {
          await WorkspaceGraph.upsertEdge({
            workspaceId,
            fromNodeId: `assistant:${assistantId}`,
            toNodeId: nodeId,
            relation: "assistant",
            weight: 1.0,
            metadata: {
              createdAt: chat.createdAt,
            },
          });
          console.log(
            `[GraphBuilder] Created assistant → chat edge: assistant:${assistantId} → ${nodeId}`
          );
        } catch (edgeError) {
          console.error(
            "[GraphBuilder] Error creating assistant → chat edge:",
            edgeError
          );
        }
      }

      // 建立与引用文档的关系
      if (sources && sources.length > 0) {
        await this.createChatDocumentRelations({
          workspaceId,
          chatNodeId: nodeId,
          sources,
          assistantId, // 【M6】传递 assistantId
        });
      }

      return node;
    } catch (error) {
      console.error("[GraphBuilder] Error creating chat node:", error);
      return null;
    }
  },

  /**
   * 提取标签
   * @param {Object} metadata - 文档元数据
   * @returns {Array<string>} 标签数组
   */
  extractTags: function (metadata) {
    const tags = [];

    // 从 metadata.tags 提取
    if (metadata.tags && Array.isArray(metadata.tags)) {
      tags.push(...metadata.tags);
    }

    // 从 metadata.keywords 提取
    if (metadata.keywords && Array.isArray(metadata.keywords)) {
      tags.push(...metadata.keywords);
    }

    // 从 metadata.categories 提取
    if (metadata.categories && Array.isArray(metadata.categories)) {
      tags.push(...metadata.categories);
    }

    // 去重并过滤空值
    return [...new Set(tags)].filter((tag) => tag && tag.trim().length > 0);
  },

  /**
   * 创建标签节点和关系
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.sourceNodeId - 源节点 ID
   * @param {Array<string>} params.tags - 标签数组
   * @returns {Promise<void>}
   */
  createTagRelations: async function ({ workspaceId, sourceNodeId, tags }) {
    try {
      for (const tag of tags) {
        const tagNodeId = `tag_${tag.toLowerCase().replace(/\s+/g, "_")}`;

        // 创建或更新标签节点
        await WorkspaceGraph.upsertNode({
          workspaceId,
          nodeId: tagNodeId,
          type: "tag",
          label: tag,
          externalId: null,
          metadata: { tagName: tag },
        });

        // 创建标签关系
        await WorkspaceGraph.upsertEdge({
          workspaceId,
          fromNodeId: sourceNodeId,
          toNodeId: tagNodeId,
          relation: "tag",
          weight: null,
          metadata: null,
        });
      }

      console.log(
        `[GraphBuilder] Created ${tags.length} tag relations for ${sourceNodeId}`
      );
    } catch (error) {
      console.error("[GraphBuilder] Error creating tag relations:", error);
    }
  },

  /**
   * 创建聊天-文档引用关系
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.chatNodeId - 聊天节点 ID
   * @param {Array} params.sources - 文档来源数组
   * @param {string|null} params.assistantId - 助手 ID (可选)
   * @returns {Promise<void>}
   */
  createChatDocumentRelations: async function ({
    workspaceId,
    chatNodeId,
    sources,
    assistantId = null,
  }) {
    try {
      const processedDocs = new Set(); // 用于去重

      for (const source of sources) {
        // source 可能包含 docId 或 id
        const docId = source.docId || source.id;
        if (!docId) continue;

        const docNodeId = `doc_${docId}`;

        // 避免重复处理同一文档
        if (processedDocs.has(docNodeId)) continue;
        processedDocs.add(docNodeId);

        // 检查文档节点是否存在
        const docNodes = await WorkspaceGraph.searchSubgraph({
          workspaceId,
          keyword: docNodeId,
          limit: 1,
        });

        if (docNodes.nodes.length === 0) {
          console.log(
            `[GraphBuilder] Doc node ${docNodeId} not found, skipping relation`
          );
          continue;
        }

        // 创建 chat → document 引用关系
        await WorkspaceGraph.upsertEdge({
          workspaceId,
          fromNodeId: chatNodeId,
          toNodeId: docNodeId,
          relation: "reference",
          weight: null,
          metadata: {
            sourceType: "chat",
            createdAt: new Date().toISOString(),
          },
        });

        // 【M6】如果使用了助手，创建 assistant → document 边
        if (assistantId) {
          try {
            await WorkspaceGraph.upsertEdge({
              workspaceId,
              fromNodeId: `assistant:${assistantId}`,
              toNodeId: docNodeId,
              relation: "reference",
              weight: null,
              metadata: {
                sourceType: "assistant",
                createdAt: new Date().toISOString(),
              },
            });
            console.log(
              `[GraphBuilder] Created assistant → document edge: assistant:${assistantId} → ${docNodeId}`
            );
          } catch (edgeError) {
            console.error(
              "[GraphBuilder] Error creating assistant → document edge:",
              edgeError
            );
          }
        }
      }

      console.log(
        `[GraphBuilder] Created ${sources.length} reference relations for ${chatNodeId}`
      );
    } catch (error) {
      console.error(
        "[GraphBuilder] Error creating chat-document relations:",
        error
      );
    }
  },

  /**
   * 删除文档节点及其关系
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.docId - 文档 ID
   * @returns {Promise<boolean>} 是否成功删除
   */
  deleteDocumentNode: async function ({ workspaceId, docId }) {
    try {
      const success = await WorkspaceGraph.deleteNodeByExternalId({
        workspaceId,
        externalId: docId,
      });

      if (success) {
        console.log(`[GraphBuilder] Deleted doc node for docId: ${docId}`);
      }

      return success;
    } catch (error) {
      console.error("[GraphBuilder] Error deleting document node:", error);
      return false;
    }
  },
};

module.exports = { GraphBuilder };
