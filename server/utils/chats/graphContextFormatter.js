/**
 * 图谱上下文格式化工具
 * 用于将图谱子图转换为 LLM 可理解的上下文文本
 */

const { TokenManager } = require("../helpers/tiktoken");

/**
 * 将图谱子图格式化为上下文文本
 * @param {Object} subgraph - 子图数据 { nodes, edges }
 * @param {Object} options - 选项
 * @param {number} options.maxTokens - 最大 token 数 (默认 3000)
 * @param {string} options.model - 模型名称 (用于 token 计算)
 * @returns {Object} { summaryText, graphSources, tokenCount }
 */
function formatGraphToContext(subgraph, options = {}) {
  const { maxTokens = 3000, model = "gpt-3.5-turbo" } = options;
  const { nodes = [], edges = [] } = subgraph;

  if (nodes.length === 0) {
    return {
      summaryText: "",
      graphSources: [],
      tokenCount: 0,
    };
  }

  // 1. 按类型和 rank 对节点排序
  const sortedNodes = [...nodes].sort((a, b) => {
    // 优先级: rank 高的 > 最近更新的
    if (a.rank && b.rank) {
      return b.rank - a.rank;
    }
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  // 2. 构建节点描述
  const nodeDescriptions = [];
  const graphSources = [];

  for (const node of sortedNodes) {
    let desc = `- **${node.label}** (${node.type})`;

    // 添加元数据信息
    if (node.metadata && Object.keys(node.metadata).length > 0) {
      const metaInfo = [];
      if (node.metadata.summary) {
        metaInfo.push(node.metadata.summary);
      }
      if (node.metadata.tags) {
        metaInfo.push(`标签: ${node.metadata.tags.join(", ")}`);
      }
      if (metaInfo.length > 0) {
        desc += `: ${metaInfo.join("; ")}`;
      }
    }

    nodeDescriptions.push(desc);

    // 构建 source 对象 (用于前端显示)
    if (node.externalId) {
      graphSources.push({
        id: node.nodeId,
        type: "graph_node",
        title: node.label,
        nodeType: node.type,
        externalId: node.externalId,
        metadata: node.metadata,
      });
    }
  }

  // 3. 构建关系描述
  const relationDescriptions = [];
  const relationGroups = {};

  edges.forEach((edge) => {
    const key = edge.relation;
    if (!relationGroups[key]) {
      relationGroups[key] = [];
    }

    const fromNode = nodes.find((n) => n.nodeId === edge.fromNodeId);
    const toNode = nodes.find((n) => n.nodeId === edge.toNodeId);

    if (fromNode && toNode) {
      let relationDesc = `${fromNode.label} → ${toNode.label}`;
      if (edge.weight) {
        relationDesc += ` (相似度: ${(edge.weight * 100).toFixed(0)}%)`;
      }
      relationGroups[key].push(relationDesc);
    }
  });

  // 按关系类型组织
  Object.entries(relationGroups).forEach(([relationType, relations]) => {
    const relationTypeLabel =
      {
        link: "链接关系",
        similar: "相似关系",
        reference: "引用关系",
        tag: "标签关系",
        assistant: "助手关系",
      }[relationType] || relationType;

    relationDescriptions.push(
      `**${relationTypeLabel}**:\n${relations.map((r) => `  - ${r}`).join("\n")}`
    );
  });

  // 4. 组装最终文本
  let summaryText = `## 知识图谱上下文\n\n`;
  summaryText += `### 相关知识节点 (${nodes.length} 个)\n`;
  summaryText += nodeDescriptions.join("\n") + "\n\n";

  if (relationDescriptions.length > 0) {
    summaryText += `### 知识关系 (${edges.length} 条)\n`;
    summaryText += relationDescriptions.join("\n\n") + "\n\n";
  }

  // 5. Token 计数与截断
  const tokenManager = new TokenManager(model);
  let tokenCount = tokenManager.countFromString(summaryText);

  // 如果超过限制,进行截断
  if (tokenCount > maxTokens) {
    console.log(
      `[GraphContext] Token count ${tokenCount} exceeds limit ${maxTokens}, truncating...`
    );

    // 简化策略: 只保留节点描述,移除关系描述
    summaryText = `## 知识图谱上下文\n\n`;
    summaryText += `### 相关知识节点 (${nodes.length} 个)\n`;

    // 逐个添加节点,直到达到 token 限制
    const truncatedDescriptions = [];
    let currentTokens = tokenManager.countFromString(summaryText);

    for (const desc of nodeDescriptions) {
      const descTokens = tokenManager.countFromString(desc + "\n");
      if (currentTokens + descTokens > maxTokens) {
        break;
      }
      truncatedDescriptions.push(desc);
      currentTokens += descTokens;
    }

    summaryText += truncatedDescriptions.join("\n") + "\n\n";
    summaryText += `_（注: 由于 token 限制,部分节点和关系已省略）_\n`;

    tokenCount = tokenManager.countFromString(summaryText);
  }

  console.log(
    `[GraphContext] Generated summary: ${nodes.length} nodes, ${edges.length} edges, ${tokenCount} tokens`
  );

  return {
    summaryText,
    graphSources,
    tokenCount,
  };
}

module.exports = {
  formatGraphToContext,
};
