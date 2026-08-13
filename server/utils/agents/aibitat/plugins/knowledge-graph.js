/**
 * 知识图谱工具 - Agent 模式专用
 *
 * @description
 * 提供图谱搜索和总结能力，让 Agent 模式也能使用知识图谱。
 * 适用于需要理解文档关联、引用关系、知识体系的场景。
 *
 * 主要功能：
 * 1. 搜索企业知识图谱，获取结构化的知识关系
 * 2. 返回 3000 token 智能总结
 * 3. 提供使用建议（基于覆盖度）
 */

const WorkspaceGraph = require("../../../../models/workspaceGraph");
const { summarizeGraphContext } = require("../../../chats/graphSummarization");
const { Deduplicator } = require("../utils/dedupe");

const knowledgeGraph = {
  name: "knowledge-graph",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          tracker: new Deduplicator(),
          name: this.name,
          description:
            "搜索企业知识图谱，获取结构化的知识关系。适用于需要理解文档关联、引用关系、知识体系的场景。返回智能总结，包含节点内容和关系描述。建议在需要了解知识之间的关联时使用此工具，而非仅搜索文档内容。",
          examples: [
            {
              prompt: "AI Agent 相关的知识有哪些？",
              call: JSON.stringify({
                query: "AI Agent",
                maxTokens: 3000,
              }),
            },
            {
              prompt: "查找与大语言模型相关的知识体系",
              call: JSON.stringify({
                query: "大语言模型 LLM",
                maxTokens: 3000,
              }),
            },
            {
              prompt: "了解向量数据库和嵌入的关系",
              call: JSON.stringify({
                query: "向量数据库 Embeddings",
                maxTokens: 2000,
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "搜索关键词或问题，用于匹配图谱节点",
              },
              maxTokens: {
                type: "number",
                description: "最大返回 token 数（默认 3000，最大 5000）",
                default: 3000,
              },
            },
            required: ["query"],
            additionalProperties: false,
          },
          handler: async function ({ query, maxTokens = 3000 }) {
            try {
              if (this.tracker.isDuplicate(this.name, { query })) {
                return `此查询已执行过，结果被忽略以避免重复。`;
              }

              const { workspace } = this.super.introspect;
              if (!workspace?.id) {
                return "知识图谱不可用（无 workspace 上下文）。请改用 rag-memory 工具搜索文档。";
              }

              // 限制 maxTokens 范围
              const tokenLimit = Math.min(Math.max(maxTokens, 500), 5000);

              // 搜索子图
              const subgraph = await WorkspaceGraph.searchSubgraph({
                workspaceId: workspace.id,
                keyword: query,
                limit: 50,
              });

              if (!subgraph || subgraph.nodes.length === 0) {
                this.tracker.trackRun(this.name, { query });
                return `知识图谱中未找到与"${query}"相关的内容。

建议：
1. 使用 rag-memory 工具搜索文档内容
2. 尝试使用不同的关键词
3. 使用互联网搜索工具查找外部信息`;
              }

              // 智能总结
              const summary = await summarizeGraphContext(
                subgraph,
                query,
                tokenLimit
              );

              this.tracker.trackRun(this.name, { query });

              // 【修复】将知识图谱来源存储到 aibitat 实例，供 chat-history 插件保存
              if (subgraph.nodes.length > 0) {
                if (!this.super._knowledgeSources) {
                  this.super._knowledgeSources = [];
                }
                // 添加知识图谱来源（每个节点作为一个来源）
                const graphSources = subgraph.nodes.slice(0, 5).map((node) => ({
                  id: node.nodeId || node.id,
                  title: node.label || node.type || "知识图谱节点",
                  text: node.metadata?.description || node.label || "",
                  chunkSource: `graph://${workspace.slug}/${node.nodeId}`,
                  score: node.rank || 1,
                  type: "graph",
                }));
                this.super._knowledgeSources.push(...graphSources);
              }

              // 根据节点数量生成使用建议
              const suggestions = [];
              if (summary.nodeCount >= 20) {
                suggestions.push(
                  "知识图谱覆盖充分，可直接基于此信息回答用户问题"
                );
              }
              if (summary.nodeCount < 10) {
                suggestions.push(
                  "知识图谱覆盖有限，建议结合 rag-memory 工具补充文档内容"
                );
              }
              if (summary.edgeCount > 0) {
                suggestions.push("发现知识关联关系，可帮助理解概念之间的联系");
              }

              return `# 知识图谱搜索结果

${summary.summary}

---
**统计信息**:
- 匹配节点数: ${summary.nodeCount}
- 关系数量: ${summary.edgeCount}
- Token 使用: ${summary.tokenCount} / ${tokenLimit}

**使用建议**:
${suggestions.map((s) => `- ${s}`).join("\n")}`;
            } catch (error) {
              console.error("[knowledge-graph] Error:", error);
              return `知识图谱搜索失败: ${error.message}。请改用 rag-memory 工具。`;
            }
          },
        });
      },
    };
  },
};

module.exports = { knowledgeGraph };
