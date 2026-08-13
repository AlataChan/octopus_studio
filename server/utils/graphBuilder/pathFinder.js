/**
 * 多跳推理路径查找模块
 * @module utils/graphBuilder/pathFinder
 * @description 在知识图谱中查找两个实体之间的最短路径
 *
 * 注意：此功能适用于 Admin/Debug 场景，不建议进入聊天主链路
 * 原因：在图谱规模稍大时可能产生延迟
 */

const { WorkspaceGraph } = require("../../models/workspaceGraph");
const {
  KG_FEATURE_FLAGS,
  KG_PATH_FINDER_CONFIG,
  withTimeout,
} = require("./featureFlags");

/**
 * 在图谱中查找两个实体之间的最短路径
 *
 * 实现策略：
 * 1. 先用 searchSubgraph 获取包含两个实体的小子图
 * 2. 在内存中对小子图进行 BFS 查找
 * 3. 严格设置超时和节点访问上限
 *
 * @param {Object} options
 * @param {number} options.workspaceId - 工作区 ID
 * @param {string} options.fromEntity - 起始实体名称
 * @param {string} options.toEntity - 目标实体名称
 * @param {number} options.maxDepth - 最大搜索深度
 * @returns {Promise<{path: Array, found: boolean, message?: string}>}
 */
async function findReasoningPath({
  workspaceId,
  fromEntity,
  toEntity,
  maxDepth = KG_PATH_FINDER_CONFIG.MAX_DEPTH,
}) {
  // 功能开关检查
  if (!KG_FEATURE_FLAGS.PATH_FINDER_ENABLED) {
    return { path: [], found: false, message: "Path finder is disabled" };
  }

  const config = KG_PATH_FINDER_CONFIG;
  const startTime = Date.now();

  try {
    // 使用超时包装整个查找过程
    return await withTimeout(
      findPathInternal({ workspaceId, fromEntity, toEntity, maxDepth, config }),
      config.TIMEOUT_MS,
      "Path finding"
    );
  } catch (error) {
    if (error.message.includes("timed out")) {
      return {
        path: [],
        found: false,
        message: "Search timed out",
        durationMs: Date.now() - startTime,
      };
    }
    throw error;
  }
}

/**
 * 内部路径查找实现
 * @private
 */
async function findPathInternal({
  workspaceId,
  fromEntity,
  toEntity,
  maxDepth,
  config,
}) {
  const startTime = Date.now();

  // 1. 查找起始和目标节点
  const [startNodes, endNodes] = await Promise.all([
    WorkspaceGraph.searchSubgraph({
      workspaceId,
      keyword: fromEntity,
      limit: 3,
    }),
    WorkspaceGraph.searchSubgraph({
      workspaceId,
      keyword: toEntity,
      limit: 3,
    }),
  ]);

  if (!startNodes.nodes.length) {
    return {
      path: [],
      found: false,
      message: `Start entity "${fromEntity}" not found`,
    };
  }

  if (!endNodes.nodes.length) {
    return {
      path: [],
      found: false,
      message: `End entity "${toEntity}" not found`,
    };
  }

  const startNodeId = startNodes.nodes[0].nodeId;
  const endNodeId = endNodes.nodes[0].nodeId;

  // 如果起点和终点相同
  if (startNodeId === endNodeId) {
    const node = startNodes.nodes[0];
    return {
      path: [
        {
          nodeId: node.nodeId,
          label: node.label,
          type: node.type,
        },
      ],
      found: true,
      message: "Start and end are the same node",
      durationMs: Date.now() - startTime,
    };
  }

  // 2. 获取包含两个实体的子图（限制规模）
  // 使用两个节点的联合子图
  const subgraphLimit = Math.min(config.MAX_NODES_VISITED, 200);

  // 获取起点和终点的局部子图
  const [startSubgraph, endSubgraph] = await Promise.all([
    WorkspaceGraph.getSubgraphByNode({
      workspaceId,
      nodeId: startNodeId,
      depth: Math.ceil(maxDepth / 2),
    }),
    WorkspaceGraph.getSubgraphByNode({
      workspaceId,
      nodeId: endNodeId,
      depth: Math.ceil(maxDepth / 2),
    }),
  ]);

  // 合并子图
  const allNodes = new Map();
  const allEdges = [];

  for (const node of [...startSubgraph.nodes, ...endSubgraph.nodes]) {
    if (!allNodes.has(node.nodeId)) {
      allNodes.set(node.nodeId, node);
    }
  }

  const edgeSet = new Set();
  for (const edge of [...startSubgraph.edges, ...endSubgraph.edges]) {
    const key = `${edge.fromNodeId}:${edge.toNodeId}:${edge.relation}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      allEdges.push(edge);
    }
  }

  // 检查终点是否在子图中
  if (!allNodes.has(endNodeId)) {
    return {
      path: [],
      found: false,
      message: `No path found within depth ${maxDepth}`,
      durationMs: Date.now() - startTime,
    };
  }

  // 3. 在内存中进行 BFS
  const adjacency = buildAdjacencyList(allEdges);
  const path = bfsShortestPath(
    startNodeId,
    endNodeId,
    adjacency,
    maxDepth,
    config.MAX_NODES_VISITED
  );

  if (!path) {
    return {
      path: [],
      found: false,
      message: `No path found within depth ${maxDepth}`,
      durationMs: Date.now() - startTime,
    };
  }

  // 4. 构建详细路径信息
  const detailedPath = buildDetailedPath(path, allNodes, allEdges);

  return {
    path: detailedPath,
    found: true,
    depth: path.length - 1,
    durationMs: Date.now() - startTime,
  };
}

/**
 * 构建邻接表
 * @param {Array} edges - 边数组
 * @returns {Map} 邻接表
 */
function buildAdjacencyList(edges) {
  const adjacency = new Map();

  for (const edge of edges) {
    // 双向添加（无向图处理）
    if (!adjacency.has(edge.fromNodeId)) {
      adjacency.set(edge.fromNodeId, []);
    }
    adjacency.get(edge.fromNodeId).push({
      nodeId: edge.toNodeId,
      relation: edge.relation,
      weight: edge.weight,
    });

    if (!adjacency.has(edge.toNodeId)) {
      adjacency.set(edge.toNodeId, []);
    }
    adjacency.get(edge.toNodeId).push({
      nodeId: edge.fromNodeId,
      relation: edge.relation,
      weight: edge.weight,
    });
  }

  return adjacency;
}

/**
 * BFS 最短路径查找
 * @param {string} startId - 起始节点 ID
 * @param {string} endId - 目标节点 ID
 * @param {Map} adjacency - 邻接表
 * @param {number} maxDepth - 最大深度
 * @param {number} maxNodes - 最大访问节点数
 * @returns {Array|null} 路径节点 ID 数组
 */
function bfsShortestPath(startId, endId, adjacency, maxDepth, maxNodes) {
  const visited = new Set([startId]);
  const queue = [[startId]]; // 队列中存储路径
  let nodesVisited = 0;

  while (queue.length > 0) {
    const path = queue.shift();
    const currentNode = path[path.length - 1];

    // 检查是否超过深度限制
    if (path.length > maxDepth + 1) {
      continue;
    }

    // 检查是否超过节点访问限制
    if (nodesVisited++ > maxNodes) {
      console.warn("[PathFinder] Exceeded max nodes visited limit");
      return null;
    }

    // 找到目标
    if (currentNode === endId) {
      return path;
    }

    // 扩展邻居
    const neighbors = adjacency.get(currentNode) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.nodeId)) {
        visited.add(neighbor.nodeId);
        queue.push([...path, neighbor.nodeId]);
      }
    }
  }

  return null;
}

/**
 * 构建详细的路径信息
 * @param {Array} nodeIds - 节点 ID 数组
 * @param {Map} nodesMap - 节点 Map
 * @param {Array} edges - 边数组
 * @returns {Array} 详细路径
 */
function buildDetailedPath(nodeIds, nodesMap, edges) {
  const path = [];

  for (let i = 0; i < nodeIds.length; i++) {
    const nodeId = nodeIds[i];
    const node = nodesMap.get(nodeId);

    const step = {
      nodeId,
      label: node?.label || nodeId,
      type: node?.type || "unknown",
    };

    // 添加到下一节点的关系
    if (i < nodeIds.length - 1) {
      const nextNodeId = nodeIds[i + 1];
      const edge = edges.find(
        (e) =>
          (e.fromNodeId === nodeId && e.toNodeId === nextNodeId) ||
          (e.fromNodeId === nextNodeId && e.toNodeId === nodeId)
      );
      step.relationToNext = edge?.relation || "connected";
      step.weight = edge?.weight;
    }

    path.push(step);
  }

  return path;
}

/**
 * 格式化推理路径为自然语言
 * @param {Array} path - 路径数组
 * @returns {string} 格式化的路径描述
 */
function formatPathAsText(path) {
  if (!path || path.length === 0) return "";

  const segments = [];
  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    if (i === 0) {
      segments.push(step.label);
    } else {
      const prevStep = path[i - 1];
      segments.push(`-[${prevStep.relationToNext || "关联"}]→ ${step.label}`);
    }
  }

  return segments.join(" ");
}

/**
 * 格式化路径为 Markdown
 * @param {Array} path - 路径数组
 * @returns {string} Markdown 格式的路径
 */
function formatPathAsMarkdown(path) {
  if (!path || path.length === 0) return "_No path found_";

  const lines = ["**推理路径:**", ""];
  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const prefix = i === 0 ? "🔵" : i === path.length - 1 ? "🎯" : "⚪";
    const indent = "  ".repeat(i);

    if (i === 0) {
      lines.push(`${indent}${prefix} **${step.label}** _(${step.type})_`);
    } else {
      const prevStep = path[i - 1];
      lines.push(`${indent}↓ _${prevStep.relationToNext || "connected"}_`);
      lines.push(`${indent}${prefix} **${step.label}** _(${step.type})_`);
    }
  }

  return lines.join("\n");
}

/**
 * 查找多条可能的路径
 * @param {Object} options - 同 findReasoningPath
 * @param {number} options.maxPaths - 最大返回路径数
 * @returns {Promise<{paths: Array, found: boolean}>}
 */
async function findMultiplePaths({
  workspaceId,
  fromEntity,
  toEntity,
  maxDepth = KG_PATH_FINDER_CONFIG.MAX_DEPTH,
  maxPaths = 3,
}) {
  // 简化实现：先找最短路径，然后尝试找其他路径
  // 完整实现需要使用 Yen's K-Shortest Paths 算法

  const result = await findReasoningPath({
    workspaceId,
    fromEntity,
    toEntity,
    maxDepth,
  });

  if (!result.found) {
    return { paths: [], found: false, message: result.message };
  }

  return {
    paths: [result.path],
    found: true,
    message: "Found 1 path (multi-path search is simplified)",
  };
}

/**
 * 获取路径查找器状态
 * @returns {Object} 状态信息
 */
function getPathFinderStatus() {
  return {
    enabled: KG_FEATURE_FLAGS.PATH_FINDER_ENABLED,
    config: KG_PATH_FINDER_CONFIG,
  };
}

module.exports = {
  findReasoningPath,
  findMultiplePaths,
  formatPathAsText,
  formatPathAsMarkdown,
  getPathFinderStatus,
  // 内部函数导出用于测试
  buildAdjacencyList,
  bfsShortestPath,
  buildDetailedPath,
};
