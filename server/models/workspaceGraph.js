const prisma = require("../utils/prisma");
const { safeJsonParse } = require("../utils/http");
const { graphCache } = require("../utils/chats/graphCache");

/**
 * WorkspaceGraph 模型
 * 用于管理 Workspace 级别的知识图谱
 */
const WorkspaceGraph = {
  /**
   * 创建或更新节点
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.nodeId - 节点 ID (业务侧唯一标识)
   * @param {string} params.type - 节点类型: doc | chat | tag | assistant | custom
   * @param {string} params.label - 显示名称
   * @param {string|null} params.externalId - 外部 ID (如 docId, chatId)
   * @param {Object|null} params.metadata - 元数据对象
   * @param {string|null} params.group - 分组标识
   * @param {number|null} params.rank - PageRank 值
   * @returns {Promise<Object>} 创建或更新的节点
   */
  upsertNode: async function (params) {
    try {
      const {
        workspaceId,
        nodeId,
        type,
        label,
        externalId = null,
        metadata = null,
      } = params;
      const metadataStr = metadata ? JSON.stringify(metadata) : null;
      const updateData = {
        type,
        label,
        externalId,
        metadata: metadataStr,
        updatedAt: new Date(),
      };
      if (Object.prototype.hasOwnProperty.call(params, "group")) {
        updateData.group = params.group ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(params, "rank")) {
        updateData.rank = params.rank ?? null;
      }

      const node = await prisma.workspace_graph_nodes.upsert({
        where: {
          workspaceId_nodeId: {
            workspaceId,
            nodeId,
          },
        },
        update: updateData,
        create: {
          workspaceId,
          nodeId,
          type,
          label,
          externalId,
          metadata: metadataStr,
          group: params.group ?? null,
          rank: params.rank ?? null,
        },
      });

      // 【新增】清空缓存
      graphCache.clearWorkspace(workspaceId);

      return node;
    } catch (error) {
      console.error("[WorkspaceGraph] Error upserting node:", error);
      throw error;
    }
  },

  /**
   * 创建或更新一条边
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.fromNodeId - 起始节点 ID
   * @param {string} params.toNodeId - 目标节点 ID
   * @param {string} params.relation - 关系类型: link | tag | similar | reference | assistant | custom
   * @param {number|null} params.weight - 权重 (如相似度分数)
   * @param {Object|null} params.metadata - 元数据对象
   * @param {string|null} params.group - 投影来源分组
   * @returns {Promise<Object>} 创建的边
   */
  upsertEdge: async function ({
    workspaceId,
    fromNodeId,
    toNodeId,
    relation,
    weight = null,
    metadata = null,
    group = null,
  }) {
    try {
      const metadataStr = metadata ? JSON.stringify(metadata) : null;

      // 检查是否已存在相同的边
      const existingEdge = await prisma.workspace_graph_edges.findFirst({
        where: {
          workspaceId,
          fromNodeId,
          toNodeId,
          relation,
        },
      });

      if (existingEdge) {
        // 更新现有边
        return await prisma.workspace_graph_edges.update({
          where: { id: existingEdge.id },
          data: {
            weight,
            metadata: metadataStr,
            group,
            updatedAt: new Date(),
          },
        });
      }

      // 创建新边
      return await prisma.workspace_graph_edges.create({
        data: {
          workspaceId,
          fromNodeId,
          toNodeId,
          relation,
          weight,
          metadata: metadataStr,
          group,
        },
      });
    } catch (error) {
      console.error("[WorkspaceGraph] Error upserting edge:", error);
      throw error;
    }
  },

  /**
   * 删除节点及其相关的边
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.nodeId - 节点 ID
   * @returns {Promise<boolean>} 是否成功删除
   */
  deleteNode: async function ({ workspaceId, nodeId }) {
    try {
      // 删除相关的边
      await prisma.workspace_graph_edges.deleteMany({
        where: {
          workspaceId,
          OR: [{ fromNodeId: nodeId }, { toNodeId: nodeId }],
        },
      });

      // 删除节点
      await prisma.workspace_graph_nodes.delete({
        where: {
          workspaceId_nodeId: {
            workspaceId,
            nodeId,
          },
        },
      });

      // 清空缓存
      graphCache.clearWorkspace(workspaceId);

      return true;
    } catch (error) {
      console.error("[WorkspaceGraph] Error deleting node:", error);
      return false;
    }
  },

  /**
   * 获取单个节点
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.nodeId - 节点 ID
   * @returns {Promise<Object|null>} 节点对象
   */
  getNode: async function ({ workspaceId, nodeId }) {
    try {
      const node = await prisma.workspace_graph_nodes.findUnique({
        where: {
          workspaceId_nodeId: {
            workspaceId,
            nodeId,
          },
        },
      });

      if (!node) return null;

      return {
        ...node,
        metadata: safeJsonParse(node.metadata, {}),
      };
    } catch (error) {
      console.error("[WorkspaceGraph] Error getting node:", error);
      return null;
    }
  },

  /**
   * 按类型获取节点
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.type - 节点类型
   * @param {number} params.limit - 最大返回数量
   * @returns {Promise<Object[]>} 节点数组
   */
  getNodesByType: async function ({ workspaceId, type, limit = 100 }) {
    try {
      const nodes = await prisma.workspace_graph_nodes.findMany({
        where: {
          workspaceId,
          type,
        },
        take: limit,
        orderBy: [{ rank: "desc" }, { updatedAt: "desc" }],
      });

      return nodes.map((node) => ({
        ...node,
        metadata: safeJsonParse(node.metadata, {}),
      }));
    } catch (error) {
      console.error("[WorkspaceGraph] Error getting nodes by type:", error);
      return [];
    }
  },

  /**
   * 删除边
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.fromNodeId - 起始节点 ID
   * @param {string} params.toNodeId - 目标节点 ID
   * @returns {Promise<boolean>} 是否成功
   */
  deleteEdge: async function ({ workspaceId, fromNodeId, toNodeId }) {
    try {
      await prisma.workspace_graph_edges.deleteMany({
        where: {
          workspaceId,
          fromNodeId,
          toNodeId,
        },
      });

      graphCache.clearWorkspace(workspaceId);
      return true;
    } catch (error) {
      console.error("[WorkspaceGraph] Error deleting edge:", error);
      return false;
    }
  },

  /**
   * 清空指定 Workspace 的图谱数据
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise<Object>} 删除统计
   */
  clearWorkspaceGraph: async function (workspaceId) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const edgeResult = await tx.workspace_graph_edges.deleteMany({
          where: { workspaceId },
        });
        const nodeResult = await tx.workspace_graph_nodes.deleteMany({
          where: { workspaceId },
        });

        return {
          edgesDeleted: edgeResult?.count,
          nodesDeleted: nodeResult?.count,
        };
      });

      graphCache.clearWorkspace(workspaceId);
      return result;
    } catch (error) {
      console.error("[WorkspaceGraph] Error clearing workspace graph:", error);
      throw error;
    }
  },

  /**
   * 批量写入节点和边 (用于重建)
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {Array} params.nodes - 节点数组
   * @param {Array} params.edges - 边数组
   * @returns {Promise<Object>} 写入结果统计
   */
  bulkUpsert: async function ({ workspaceId, nodes = [], edges = [] }) {
    try {
      let nodesCreated = 0;
      let edgesCreated = 0;

      // 批量创建节点
      for (const node of nodes) {
        await this.upsertNode({ workspaceId, ...node });
        nodesCreated++;
      }

      // 批量创建边
      for (const edge of edges) {
        await this.upsertEdge({ workspaceId, ...edge });
        edgesCreated++;
      }

      return { nodesCreated, edgesCreated };
    } catch (error) {
      console.error("[WorkspaceGraph] Error in bulk upsert:", error);
      throw error;
    }
  },

  /**
   * 事务性替换指定 Workspace 的图谱数据
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {Array} params.nodes - 节点数组
   * @param {Array} params.edges - 边数组
   * @returns {Promise<Object>} 写入结果统计
   */
  replaceWorkspaceGraph: async function ({
    workspaceId,
    nodes = [],
    edges = [],
  }) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.workspace_graph_edges.deleteMany({ where: { workspaceId } });
        await tx.workspace_graph_nodes.deleteMany({ where: { workspaceId } });

        let nodesCreated = 0;
        let edgesCreated = 0;

        for (const node of nodes) {
          await tx.workspace_graph_nodes.upsert({
            where: {
              workspaceId_nodeId: {
                workspaceId,
                nodeId: node.nodeId,
              },
            },
            update: {
              type: node.type,
              label: node.label,
              externalId: node.externalId || null,
              metadata: node.metadata ? JSON.stringify(node.metadata) : null,
              group: node.group || null,
              rank: node.rank || null,
              updatedAt: new Date(),
            },
            create: {
              workspaceId,
              nodeId: node.nodeId,
              type: node.type,
              label: node.label,
              externalId: node.externalId || null,
              metadata: node.metadata ? JSON.stringify(node.metadata) : null,
              group: node.group || null,
              rank: node.rank || null,
            },
          });
          nodesCreated++;
        }

        for (const edge of edges) {
          const metadataStr = edge.metadata
            ? JSON.stringify(edge.metadata)
            : null;
          const existingEdge = await tx.workspace_graph_edges.findFirst({
            where: {
              workspaceId,
              fromNodeId: edge.fromNodeId,
              toNodeId: edge.toNodeId,
              relation: edge.relation,
            },
          });

          if (existingEdge) {
            await tx.workspace_graph_edges.update({
              where: { id: existingEdge.id },
              data: {
                weight: edge.weight || null,
                metadata: metadataStr,
                group: edge.group || null,
                updatedAt: new Date(),
              },
            });
          } else {
            await tx.workspace_graph_edges.create({
              data: {
                workspaceId,
                fromNodeId: edge.fromNodeId,
                toNodeId: edge.toNodeId,
                relation: edge.relation,
                weight: edge.weight || null,
                metadata: metadataStr,
                group: edge.group || null,
              },
            });
          }
          edgesCreated++;
        }

        return { nodesCreated, edgesCreated };
      });

      graphCache.clearWorkspace(workspaceId);
      return result;
    } catch (error) {
      console.error("[WorkspaceGraph] Error replacing workspace graph:", error);
      throw error;
    }
  },

  /**
   * 事务性替换 octopus-kb 投影图谱，仅删除 group=kb 的节点/边。
   * 非 kb 的 episode/manual/chat 等图谱行必须保留。
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {Array} params.nodes - kb 节点数组
   * @param {Array} params.edges - kb 边数组
   * @returns {Promise<Object>} 写入结果统计
   */
  replaceKbProjectionGraph: async function ({
    workspaceId,
    nodes = [],
    edges = [],
  }) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const existingNodes = await tx.workspace_graph_nodes.findMany({
          where: { workspaceId },
          select: { nodeId: true, metadata: true },
        });
        const existingKbNodeIds = existingNodes
          .filter((node) => safeJsonParse(node.metadata, {}).source === "kb")
          .map((node) => node.nodeId);

        const edgeDeleteWhere = {
          workspaceId,
          OR: [{ group: "kb" }],
        };
        if (existingKbNodeIds.length) {
          edgeDeleteWhere.OR.push(
            { fromNodeId: { in: existingKbNodeIds } },
            { toNodeId: { in: existingKbNodeIds } }
          );
        }

        await tx.workspace_graph_edges.deleteMany({ where: edgeDeleteWhere });
        await tx.workspace_graph_nodes.deleteMany({
          where: {
            workspaceId,
            nodeId: { in: existingKbNodeIds },
          },
        });

        let nodesCreated = 0;
        let edgesCreated = 0;

        for (const node of nodes) {
          await tx.workspace_graph_nodes.upsert({
            where: {
              workspaceId_nodeId: {
                workspaceId,
                nodeId: node.nodeId,
              },
            },
            update: {
              type: node.type,
              label: node.label,
              externalId: node.externalId || null,
              metadata: node.metadata ? JSON.stringify(node.metadata) : null,
              group: null,
              rank: null,
              updatedAt: new Date(),
            },
            create: {
              workspaceId,
              nodeId: node.nodeId,
              type: node.type,
              label: node.label,
              externalId: node.externalId || null,
              metadata: node.metadata ? JSON.stringify(node.metadata) : null,
              group: null,
              rank: null,
            },
          });
          nodesCreated++;
        }

        for (const edge of edges) {
          await tx.workspace_graph_edges.create({
            data: {
              workspaceId,
              fromNodeId: edge.fromNodeId,
              toNodeId: edge.toNodeId,
              relation: edge.relation,
              weight: edge.weight || null,
              metadata: edge.metadata ? JSON.stringify(edge.metadata) : null,
              group: edge.group || "kb",
            },
          });
          edgesCreated++;
        }

        return { nodesCreated, edgesCreated };
      });

      graphCache.clearWorkspace(workspaceId);
      return result;
    } catch (error) {
      console.error(
        "[WorkspaceGraph] Error replacing kb projection graph:",
        error
      );
      throw error;
    }
  },

  /**
   * 原子写入由完整图计算出的节点分析值。
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {Map<string, {rank: number, group: string}>} params.analytics
   * @returns {Promise<{nodesUpdated: number}>}
   */
  applyAnalytics: async function ({ workspaceId, analytics }) {
    if (!(analytics instanceof Map)) {
      throw new TypeError("Workspace graph analytics must be a Map.");
    }
    if (analytics.size === 0) return { nodesUpdated: 0 };

    await prisma.$transaction(async (tx) => {
      for (const [nodeId, values] of analytics) {
        await tx.workspace_graph_nodes.update({
          where: {
            workspaceId_nodeId: { workspaceId, nodeId },
          },
          data: {
            rank: values.rank,
            group: values.group,
          },
        });
      }
    });

    graphCache.clearWorkspace(workspaceId);
    return { nodesUpdated: analytics.size };
  },

  /**
   * 按关键词搜索子图
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.keyword - 搜索关键词
   * @param {number} params.limit - 最大返回节点数
   * @returns {Promise<Object>} 子图数据 { nodes, edges }
   */
  searchSubgraph: async function ({ workspaceId, keyword, limit = 50 }) {
    try {
      // 【新增】检查缓存
      const cached = graphCache.get(workspaceId, keyword, limit);
      if (cached) {
        return cached;
      }

      // 1. 搜索匹配的节点 (在 label 中模糊搜索)
      const matchedNodes = await prisma.workspace_graph_nodes.findMany({
        where: {
          workspaceId,
          OR: [
            { label: { contains: keyword } },
            { nodeId: { contains: keyword } },
          ],
        },
        take: limit,
        orderBy: [
          { rank: "desc" }, // 优先返回高 rank 的节点
          { updatedAt: "desc" },
        ],
      });

      if (matchedNodes.length === 0) {
        return { nodes: [], edges: [] };
      }

      const nodeIds = matchedNodes.map((n) => n.nodeId);

      // 2. 获取这些节点之间的边 + 一阶邻居的边
      const edges = await prisma.workspace_graph_edges.findMany({
        where: {
          workspaceId,
          OR: [{ fromNodeId: { in: nodeIds } }, { toNodeId: { in: nodeIds } }],
        },
      });

      // 3. 获取一阶邻居节点
      const neighborNodeIds = new Set();
      edges.forEach((edge) => {
        if (!nodeIds.includes(edge.fromNodeId)) {
          neighborNodeIds.add(edge.fromNodeId);
        }
        if (!nodeIds.includes(edge.toNodeId)) {
          neighborNodeIds.add(edge.toNodeId);
        }
      });

      const neighborNodes = await prisma.workspace_graph_nodes.findMany({
        where: {
          workspaceId,
          nodeId: { in: Array.from(neighborNodeIds) },
        },
      });

      // 4. 合并所有节点
      const allNodes = [...matchedNodes, ...neighborNodes];

      // 5. 解析 metadata
      const nodesWithMetadata = allNodes.map((node) => ({
        ...node,
        metadata: safeJsonParse(node.metadata, {}),
      }));

      const edgesWithMetadata = edges.map((edge) => ({
        ...edge,
        metadata: safeJsonParse(edge.metadata, {}),
      }));

      const result = {
        nodes: nodesWithMetadata,
        edges: edgesWithMetadata,
      };

      // 【新增】缓存结果
      graphCache.set(workspaceId, keyword, limit, result);

      return result;
    } catch (error) {
      console.error("[WorkspaceGraph] Error searching subgraph:", error);
      return { nodes: [], edges: [] };
    }
  },

  /**
   * 获取完整图谱数据
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @returns {Promise<Object>} 完整图谱数据 { nodes, edges }
   */
  getFullGraph: async function ({ workspaceId }) {
    try {
      // 获取所有节点
      const nodes = await prisma.workspace_graph_nodes.findMany({
        where: { workspaceId },
        orderBy: [{ rank: "desc" }, { updatedAt: "desc" }],
      });

      // 获取所有边
      const edges = await prisma.workspace_graph_edges.findMany({
        where: { workspaceId },
      });

      // 解析 metadata
      const nodesWithMetadata = nodes.map((node) => ({
        ...node,
        metadata: safeJsonParse(node.metadata, {}),
      }));

      const edgesWithMetadata = edges.map((edge) => ({
        ...edge,
        metadata: safeJsonParse(edge.metadata, {}),
      }));

      return {
        nodes: nodesWithMetadata,
        edges: edgesWithMetadata,
      };
    } catch (error) {
      console.error("[WorkspaceGraph] Error getting full graph:", error);
      return { nodes: [], edges: [] };
    }
  },

  /**
   * 获取某个节点的局部子图
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.nodeId - 节点 ID
   * @param {number} params.depth - BFS 深度 (默认 1)
   * @param {Array|null} params.relationFilter - 关系类型过滤 (如 ['link', 'similar'])
   * @returns {Promise<Object>} 子图数据 { nodes, edges }
   */
  getSubgraphByNode: async function ({
    workspaceId,
    nodeId,
    depth = 1,
    relationFilter = null,
  }) {
    try {
      const visitedNodes = new Set([nodeId]);
      const allNodes = [];
      const allEdges = [];

      // BFS 遍历
      let currentLevel = [nodeId];

      for (let d = 0; d < depth; d++) {
        const nextLevel = [];

        for (const currentNodeId of currentLevel) {
          // 获取当前节点
          const node = await prisma.workspace_graph_nodes.findFirst({
            where: { workspaceId, nodeId: currentNodeId },
          });

          if (node && !allNodes.find((n) => n.nodeId === node.nodeId)) {
            allNodes.push(node);
          }

          // 获取相关的边
          const edgeWhere = {
            workspaceId,
            OR: [{ fromNodeId: currentNodeId }, { toNodeId: currentNodeId }],
          };

          if (relationFilter && relationFilter.length > 0) {
            edgeWhere.relation = { in: relationFilter };
          }

          const edges = await prisma.workspace_graph_edges.findMany({
            where: edgeWhere,
          });

          edges.forEach((edge) => {
            if (!allEdges.find((e) => e.id === edge.id)) {
              allEdges.push(edge);
            }

            // 添加邻居到下一层
            const neighborId =
              edge.fromNodeId === currentNodeId
                ? edge.toNodeId
                : edge.fromNodeId;

            if (!visitedNodes.has(neighborId)) {
              visitedNodes.add(neighborId);
              nextLevel.push(neighborId);
            }
          });
        }

        currentLevel = nextLevel;
      }

      // 解析 metadata
      const nodesWithMetadata = allNodes.map((node) => ({
        ...node,
        metadata: safeJsonParse(node.metadata, {}),
      }));

      const edgesWithMetadata = allEdges.map((edge) => ({
        ...edge,
        metadata: safeJsonParse(edge.metadata, {}),
      }));

      return {
        nodes: nodesWithMetadata,
        edges: edgesWithMetadata,
      };
    } catch (error) {
      console.error("[WorkspaceGraph] Error getting subgraph by node:", error);
      return { nodes: [], edges: [] };
    }
  },

  /**
   * 删除节点 (通过 externalId)
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.externalId - 外部 ID
   * @returns {Promise<boolean>} 是否成功删除
   */
  deleteNodeByExternalId: async function ({ workspaceId, externalId }) {
    try {
      const nodes = await prisma.workspace_graph_nodes.findMany({
        where: { workspaceId, externalId },
      });

      for (const node of nodes) {
        // 删除相关的边
        await prisma.workspace_graph_edges.deleteMany({
          where: {
            workspaceId,
            OR: [{ fromNodeId: node.nodeId }, { toNodeId: node.nodeId }],
          },
        });

        // 删除节点
        await prisma.workspace_graph_nodes.delete({
          where: { id: node.id },
        });
      }

      return true;
    } catch (error) {
      console.error("[WorkspaceGraph] Error deleting node:", error);
      return false;
    }
  },

  /**
   * 获取 Workspace 图谱统计信息
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise<Object>} 统计信息 { nodeCount, edgeCount, typeDistribution }
   */
  getStats: async function (workspaceId) {
    try {
      const nodeCount = await prisma.workspace_graph_nodes.count({
        where: { workspaceId },
      });

      const edgeCount = await prisma.workspace_graph_edges.count({
        where: { workspaceId },
      });

      // 按类型统计节点
      const nodes = await prisma.workspace_graph_nodes.findMany({
        where: { workspaceId },
        select: { type: true },
      });

      const typeDistribution = nodes.reduce((acc, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1;
        return acc;
      }, {});

      return {
        nodeCount,
        edgeCount,
        typeDistribution,
      };
    } catch (error) {
      console.error("[WorkspaceGraph] Error getting stats:", error);
      return { nodeCount: 0, edgeCount: 0, typeDistribution: {} };
    }
  },

  /**
   * 获取 Top N 节点 (按 rank 排序)
   * @param {number} workspaceId - Workspace ID
   * @param {number} limit - 最大节点数
   * @returns {Promise<Array>} 节点数组
   */
  getTopNodes: async function (workspaceId, limit = 50) {
    try {
      const nodes = await prisma.workspace_graph_nodes.findMany({
        where: { workspaceId },
        orderBy: [{ rank: "desc" }, { updatedAt: "desc" }],
        take: limit,
      });

      return nodes.map((node) => ({
        ...node,
        metadata: safeJsonParse(node.metadata, {}),
      }));
    } catch (error) {
      console.error("[WorkspaceGraph] Error getting top nodes:", error);
      return [];
    }
  },

  /**
   * 获取节点之间的边
   * @param {number} workspaceId - Workspace ID
   * @param {Array<string>} nodeIds - 节点 ID 数组
   * @returns {Promise<Array>} 边数组
   */
  getEdgesBetweenNodes: async function (workspaceId, nodeIds) {
    try {
      const edges = await prisma.workspace_graph_edges.findMany({
        where: {
          workspaceId,
          fromNodeId: { in: nodeIds },
          toNodeId: { in: nodeIds },
        },
      });

      return edges.map((edge) => ({
        ...edge,
        metadata: safeJsonParse(edge.metadata, {}),
      }));
    } catch (error) {
      console.error(
        "[WorkspaceGraph] Error getting edges between nodes:",
        error
      );
      return [];
    }
  },

  /**
   * 【M6】创建助手协作边
   * 分析同一个 chat 被多个 assistant 处理的情况，创建 assistant → assistant 的协作边
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise<Object>} { created: number, skipped: number }
   */
  createAssistantCollaborationEdges: async function (workspaceId) {
    try {
      let created = 0;
      let skipped = 0;

      // 1. 获取所有 assistant 节点
      const assistantNodes = await prisma.workspace_graph_nodes.findMany({
        where: {
          workspaceId,
          type: "assistant",
        },
      });

      if (assistantNodes.length < 2) {
        // 少于 2 个助手，无需创建协作边
        return { created: 0, skipped: 0 };
      }

      // 2. 获取所有 assistant → chat 的边
      const assistantChatEdges = await prisma.workspace_graph_edges.findMany({
        where: {
          workspaceId,
          relation: "assistant",
        },
      });

      // 3. 按 chat 分组，找出被多个 assistant 处理的 chat
      const chatToAssistants = new Map();
      assistantChatEdges.forEach((edge) => {
        const chatId = edge.toNodeId;
        if (!chatToAssistants.has(chatId)) {
          chatToAssistants.set(chatId, []);
        }
        chatToAssistants.get(chatId).push(edge.fromNodeId);
      });

      // 4. 为每个被多个 assistant 处理的 chat 创建协作边
      for (const [_chatId, assistantIds] of chatToAssistants.entries()) {
        if (assistantIds.length < 2) {
          continue; // 只有一个 assistant，跳过
        }

        // 创建所有 assistant 之间的协作边（双向）
        for (let i = 0; i < assistantIds.length; i++) {
          for (let j = i + 1; j < assistantIds.length; j++) {
            const fromId = assistantIds[i];
            const toId = assistantIds[j];

            // 检查边是否已存在
            const existingEdge = await prisma.workspace_graph_edges.findFirst({
              where: {
                workspaceId,
                fromNodeId: fromId,
                toNodeId: toId,
                relation: "collaborate",
              },
            });

            if (existingEdge) {
              // 边已存在，增加权重
              await prisma.workspace_graph_edges.update({
                where: { id: existingEdge.id },
                data: {
                  metadata: JSON.stringify({
                    ...safeJsonParse(existingEdge.metadata, {}),
                    weight:
                      (safeJsonParse(existingEdge.metadata, {}).weight || 1) +
                      1,
                  }),
                },
              });
              skipped++;
            } else {
              // 创建新边
              await prisma.workspace_graph_edges.create({
                data: {
                  workspaceId,
                  fromNodeId: fromId,
                  toNodeId: toId,
                  relation: "collaborate",
                  metadata: JSON.stringify({ weight: 1 }),
                },
              });
              created++;
            }
          }
        }
      }

      // 清空缓存
      graphCache.clearWorkspace(workspaceId);

      return { created, skipped };
    } catch (error) {
      console.error(
        "[WorkspaceGraph] Error creating collaboration edges:",
        error
      );
      return { created: 0, skipped: 0 };
    }
  },
};

module.exports = { WorkspaceGraph };
