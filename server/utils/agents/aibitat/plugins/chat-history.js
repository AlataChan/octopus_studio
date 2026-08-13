const { WorkspaceChats } = require("../../../../models/workspaceChats");

/**
 * Plugin to save chat history to AnythingLLM DB.
 * 支持 Agent Flow 执行时的角色元数据保存。
 */
const chatHistory = {
  name: "chat-history",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup: function (aibitat) {
        aibitat.onMessage(async () => {
          try {
            const lastResponses = aibitat.chats.slice(-2);
            if (lastResponses.length !== 2) return;
            const [prev, last] = lastResponses;

            // We need a full conversation reply with prev being from
            // the USER and the last being from anyone other than the user.
            if (prev.from !== "USER" || last.from === "USER") return;

            // If we have a post-reply flow we should save the chat using this special flow
            // so that post save cleanup and other unique properties can be run as opposed to regular chat.
            if (aibitat.hasOwnProperty("_replySpecialAttributes")) {
              await this._storeSpecial(aibitat, {
                prompt: prev.content,
                response: last.content,
                options: aibitat._replySpecialAttributes,
              });
              delete aibitat._replySpecialAttributes;
              return;
            }

            await this._store(aibitat, {
              prompt: prev.content,
              response: last.content,
            });
          } catch {}
        });
      },

      /**
       * 构建消息元数据
       * @param {Object} aibitat - AIbitat 实例
       * @param {Object} flowMetadata - Flow 执行的元数据（可选）
       * @returns {Object} 元数据对象
       */
      _buildMetadata: function (aibitat, flowMetadata = null) {
        const metadata = {
          type: "agent",
        };

        // 如果有 Flow 执行的角色元数据，添加到 metadata 中
        if (flowMetadata?.agentRoles && flowMetadata.agentRoles.length > 0) {
          metadata.agentRoles = flowMetadata.agentRoles;
          metadata.hasMultiAgentCollaboration = true;
        }

        // 如果有 blackboard 数据摘要，添加到 metadata 中
        if (flowMetadata?.blackboard) {
          metadata.blackboardKeys = Object.keys(flowMetadata.blackboard);
        }

        return metadata;
      },

      /**
       * 从 blackboard 或 aibitat 状态中提取知识来源信息
       * @param {Object} aibitat - AIbitat 实例
       * @returns {Array} 引用来源数组
       */
      _extractSourcesFromBlackboard: function (aibitat) {
        const sources = [];

        try {
          // 方法1: 从 orchestrator blackboard 提取知识上下文（详细来源）
          const orchestrator = aibitat._orchestrator;
          if (orchestrator?.blackboard) {
            const knowledgeContext =
              orchestrator.blackboard.get("knowledge_context");
            if (knowledgeContext) {
              // 【修复】提取向量数据库的详细来源（而非仅数量）
              const vectorContext = knowledgeContext.vectorContext;
              if (
                vectorContext?.sources &&
                Array.isArray(vectorContext.sources)
              ) {
                const vectorSources = vectorContext.sources.map(
                  (source, idx) => ({
                    id: source.id || source.vectorId || `vector-${idx}`,
                    title:
                      source.title || source.metadata?.title || "知识库文档",
                    text: source.text || source.pageContent || "",
                    chunkSource:
                      source.chunkSource || source.metadata?.chunkSource || "",
                    score: source.score || source._distance || null,
                    type: "vector",
                  })
                );
                sources.push(...vectorSources);
              }

              // 【修复】提取知识图谱的详细来源（而非仅数量）
              const graphContext = knowledgeContext.graphContext;
              if (
                graphContext?.rawSubgraph?.nodes &&
                Array.isArray(graphContext.rawSubgraph.nodes)
              ) {
                const graphSources = graphContext.rawSubgraph.nodes
                  .slice(0, 5)
                  .map((node) => ({
                    id: node.nodeId || node.id,
                    title: node.label || node.type || "知识图谱节点",
                    text: node.metadata?.description || node.label || "",
                    chunkSource: `graph://${node.nodeId || node.id}`,
                    score: node.rank || 1,
                    type: "graph",
                  }));
                sources.push(...graphSources);
              }
            }
          }

          // 方法2: 从 aibitat 的 _knowledgeSources 提取（如果 rag-memory/knowledge-graph 工具存储了）
          // 这些来源可能与上面的重复，需要去重
          if (
            aibitat._knowledgeSources &&
            Array.isArray(aibitat._knowledgeSources)
          ) {
            for (const source of aibitat._knowledgeSources) {
              // 简单去重：检查是否已存在相同 id 的来源
              const exists = sources.some((s) => s.id === source.id);
              if (!exists) {
                sources.push(source);
              }
            }
          }

          // 如果都没有，返回空数组（保持向后兼容）
          return sources;
        } catch (error) {
          console.error(
            "[ChatHistory] Error extracting sources from blackboard:",
            error
          );
          return [];
        }
      },

      _store: async function (aibitat, { prompt, response } = {}) {
        const invocation = aibitat.handlerProps.invocation;

        // 检查是否有 Flow 执行的元数据
        const flowMetadata = aibitat._lastFlowMetadata || null;
        const metadata = this._buildMetadata(aibitat, flowMetadata);

        // 清除临时存储的 Flow 元数据
        if (aibitat._lastFlowMetadata) {
          delete aibitat._lastFlowMetadata;
        }

        // 从 blackboard 提取知识来源信息（如果存在）
        const sources = this._extractSourcesFromBlackboard(aibitat);

        await WorkspaceChats.new({
          workspaceId: Number(invocation.workspace_id),
          prompt,
          response: {
            text: response,
            sources,
            type: "chat",
            metadata,
          },
          user: { id: invocation?.user_id || null },
          threadId: invocation?.thread_id || null,
          assistantId: invocation?.assistant_id || null,
        });
      },

      _storeSpecial: async function (
        aibitat,
        { prompt, response, options = {} } = {}
      ) {
        const invocation = aibitat.handlerProps.invocation;

        // 检查是否有 Flow 执行的元数据
        const flowMetadata =
          aibitat._lastFlowMetadata || options?.flowMetadata || null;
        const metadata = this._buildMetadata(aibitat, flowMetadata);

        // 合并 options 中的额外 metadata
        if (options?.metadata) {
          Object.assign(metadata, options.metadata);
        }

        // 清除临时存储的 Flow 元数据
        if (aibitat._lastFlowMetadata) {
          delete aibitat._lastFlowMetadata;
        }

        await WorkspaceChats.new({
          workspaceId: Number(invocation.workspace_id),
          prompt,
          response: {
            sources: options?.sources ?? [],
            // when we have a _storeSpecial called the options param can include a storedResponse() function
            // that will override the text property to store extra information in, depending on the special type of chat.
            text: options.hasOwnProperty("storedResponse")
              ? options.storedResponse(response)
              : response,
            type: options?.saveAsType ?? "chat",
            metadata,
          },
          user: { id: invocation?.user_id || null },
          threadId: invocation?.thread_id || null,
          assistantId: invocation?.assistant_id || null,
        });
        options?.postSave();
      },
    };
  },
};

module.exports = { chatHistory };
