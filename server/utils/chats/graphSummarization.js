/**
 * 图谱上下文总结算法
 *
 * 核心功能:
 * 1. 将图谱子图压缩为高密度摘要
 * 2. 严格控制在 3000 tokens 以内
 * 3. 保留最重要的节点和关系
 * 4. 基于节点重要性评分排序
 *
 * @module graphSummarization
 */

const { TokenManager } = require("../helpers/tiktoken");

// 创建 TokenManager 实例
const tokenManager = new TokenManager("gpt-3.5-turbo");

/**
 * 计算文本的 Token 数量
 * @param {string} text - 文本
 * @returns {number} Token 数量
 */
function countTokens(text) {
  return tokenManager.tokensFromString(text).length;
}

/**
 * 节点类型权重
 *
 * 不同类型的节点在图谱中的重要性不同
 */
const NODE_TYPE_WEIGHTS = {
  doc: 1.0, // 文档节点最重要
  chat: 0.8, // 聊天节点次之
  tag: 0.6, // 标签节点
  assistant: 0.7, // 助手节点
  custom: 0.5, // 自定义节点
};

/**
 * 关系类型权重
 *
 * 不同类型的关系在图谱中的重要性不同
 */
const RELATION_TYPE_WEIGHTS = {
  reference: 1.0, // 引用关系最重要
  similar: 0.9, // 相似关系
  tag: 0.7, // 标签关系
  link: 0.8, // 链接关系
  assistant: 0.6, // 助手关系
  custom: 0.5, // 自定义关系
};

/**
 * 计算节点重要性评分
 *
 * 评分公式:
 * score = degreeCentrality * 0.3 + queryRelevance * 0.5 + typeWeight * 0.2
 *
 * @param {Object} node - 节点对象
 * @param {Array} edges - 所有边
 * @param {string} keyword - 搜索关键词
 * @returns {number} 重要性评分 (0-1)
 */
function calculateNodeScore(node, edges, keyword) {
  // 1. 度中心性 (连接数)
  const degree = edges.filter(
    (e) => e.fromNodeId === node.nodeId || e.toNodeId === node.nodeId
  ).length;
  const maxDegree = 20; // 假设最大度数为 20
  const degreeCentrality = Math.min(degree / maxDegree, 1.0);

  // 2. 查询相关性 (关键词匹配)
  const label = (node.label || "").toLowerCase();
  const nodeId = (node.nodeId || "").toLowerCase();
  const keywordLower = (keyword || "").toLowerCase();

  let queryRelevance = 0;
  if (label.includes(keywordLower) || nodeId.includes(keywordLower)) {
    queryRelevance = 1.0;
  } else if (
    node.metadata &&
    JSON.stringify(node.metadata).toLowerCase().includes(keywordLower)
  ) {
    queryRelevance = 0.5;
  }

  // 3. 节点类型权重
  const typeWeight = NODE_TYPE_WEIGHTS[node.type] || 0.5;

  // 4. 综合评分
  const score =
    degreeCentrality * 0.3 + queryRelevance * 0.5 + typeWeight * 0.2;

  return score;
}

/**
 * 压缩节点描述
 *
 * @param {Object} node - 节点对象
 * @param {number} maxLength - 最大长度 (字符数)
 * @returns {string} 压缩后的描述
 */
function compressNodeDescription(node, maxLength = 100) {
  const label = node.label || node.nodeId;
  const type = node.type;

  // 基础描述
  let desc = `**${label}** (${type})`;

  // 添加关键元数据
  if (node.metadata) {
    const meta = node.metadata;

    // 文档节点: 添加标签
    if (type === "doc" && meta.tags && meta.tags.length > 0) {
      const tags = meta.tags.slice(0, 3).join(", ");
      desc += `: 标签: ${tags}`;
    }

    // 聊天节点: 添加时间
    if (type === "chat" && meta.createdAt) {
      const date = new Date(meta.createdAt).toLocaleDateString("zh-CN");
      desc += `: ${date}`;
    }

    // 助手节点: 添加描述
    if (type === "assistant" && meta.description) {
      const shortDesc = meta.description.slice(0, 50);
      desc += `: ${shortDesc}${meta.description.length > 50 ? "..." : ""}`;
    }
  }

  // 截断
  if (desc.length > maxLength) {
    desc = desc.slice(0, maxLength - 3) + "...";
  }

  return desc;
}

/**
 * 总结图谱上下文
 *
 * @param {Object} subgraph - 子图对象 { nodes, edges }
 * @param {string} keyword - 搜索关键词
 * @param {number} maxTokens - 最大 Token 数 (默认 3000)
 * @returns {Object} 总结结果 { summary, tokenCount, nodeCount, edgeCount }
 */
function summarizeGraphContext(subgraph, keyword, maxTokens = 3000) {
  const { nodes, edges } = subgraph;

  if (!nodes || nodes.length === 0) {
    return {
      summary: "",
      tokenCount: 0,
      nodeCount: 0,
      edgeCount: 0,
    };
  }

  // 1. 计算节点重要性评分
  const nodesWithScores = nodes.map((node) => ({
    ...node,
    score: calculateNodeScore(node, edges, keyword),
  }));

  // 2. 按评分排序
  nodesWithScores.sort((a, b) => b.score - a.score);

  // 3. 逐步构建总结,直到达到 Token 限制
  let summary = "## 知识图谱上下文\n\n";
  let currentTokens = countTokens(summary);
  let includedNodes = [];
  let includedEdges = [];

  // 3.1 添加节点
  summary += "### 相关知识节点\n\n";
  currentTokens = countTokens(summary);

  for (const node of nodesWithScores) {
    const nodeDesc = `- ${compressNodeDescription(node, 100)}\n`;
    const nodeTokens = countTokens(nodeDesc);

    if (currentTokens + nodeTokens > maxTokens * 0.7) {
      // 预留 30% 给边
      break;
    }

    summary += nodeDesc;
    currentTokens += nodeTokens;
    includedNodes.push(node);
  }

  // 3.2 添加关键关系
  summary += "\n### 知识关系\n\n";
  currentTokens = countTokens(summary);

  const includedNodeIds = new Set(includedNodes.map((n) => n.nodeId));
  const relevantEdges = edges.filter(
    (e) => includedNodeIds.has(e.fromNodeId) && includedNodeIds.has(e.toNodeId)
  );

  // 按关系类型权重排序
  relevantEdges.sort((a, b) => {
    const weightA = RELATION_TYPE_WEIGHTS[a.relation] || 0.5;
    const weightB = RELATION_TYPE_WEIGHTS[b.relation] || 0.5;
    return weightB - weightA;
  });

  for (const edge of relevantEdges) {
    const fromNode = includedNodes.find((n) => n.nodeId === edge.fromNodeId);
    const toNode = includedNodes.find((n) => n.nodeId === edge.toNodeId);

    if (!fromNode || !toNode) continue;

    const edgeDesc = `- ${fromNode.label} → ${toNode.label} (${edge.relation})\n`;
    const edgeTokens = countTokens(edgeDesc);

    if (currentTokens + edgeTokens > maxTokens) {
      break;
    }

    summary += edgeDesc;
    currentTokens += edgeTokens;
    includedEdges.push(edge);
  }

  // 4. 添加统计信息
  summary += `\n---\n\n*图谱统计: ${includedNodes.length} 个节点, ${includedEdges.length} 条关系*\n`;
  currentTokens = countTokens(summary);

  return {
    summary,
    tokenCount: currentTokens,
    nodeCount: includedNodes.length,
    edgeCount: includedEdges.length,
  };
}

module.exports = {
  summarizeGraphContext,
  calculateNodeScore,
  compressNodeDescription,
  NODE_TYPE_WEIGHTS,
  RELATION_TYPE_WEIGHTS,
};
