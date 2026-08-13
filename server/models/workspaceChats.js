const prisma = require("../utils/prisma");
const { safeJSONStringify } = require("../utils/helpers/chat/responses");
const { GraphBuilder } = require("../utils/chats/graphBuilder");
const { safeJsonParse } = require("../utils/http");

const WorkspaceChats = {
  new: async function ({
    workspaceId,
    prompt,
    response = {},
    user = null,
    threadId = null,
    include = true,
    apiSessionId = null,
    assistantId = null,
  }) {
    try {
      const chat = await prisma.workspace_chats.create({
        data: {
          workspaceId,
          prompt,
          response: safeJSONStringify(response),
          user_id: user?.id || null,
          thread_id: threadId,
          api_session_id: apiSessionId,
          ...(assistantId ? { assistant_id: String(assistantId) } : {}),
          include,
        },
      });

      // 【新增】自动创建图谱节点 (异步执行,不阻塞返回)
      setImmediate(async () => {
        try {
          const responseObj = safeJsonParse(chat.response, {});
          const sources = responseObj.sources || [];

          await GraphBuilder.createChatNode({
            workspaceId,
            chat,
            sources,
          });
        } catch (error) {
          console.error("[WorkspaceChats] Error creating graph node:", error);
        }
      });

      // 【新增】触发对话摘要检查 (异步执行,不阻塞返回)
      // 仅在有 threadId 时触发，因为摘要是基于 Thread 的
      if (threadId) {
        setImmediate(async () => {
          try {
            const {
              ConversationSummarizer,
              WorkingMemory,
              EpisodeDetector,
            } = require("../utils/memory");
            const { WorkspaceThread } = require("./workspaceThread");
            const { Workspace } = require("./workspace");
            const { getLLMProvider } = require("../utils/helpers");

            const thread = await WorkspaceThread.get({ id: threadId });
            const workspace = await Workspace.get({ id: workspaceId });

            if (thread && workspace) {
              // 获取 LLM provider 用于摘要生成
              const provider =
                workspace?.chatProvider ?? process.env.LLM_PROVIDER;
              const llmProvider = provider
                ? getLLMProvider({
                    provider,
                    model: workspace?.chatModel,
                  })
                : null;

              // 传入实际的 LLM provider 以启用摘要生成
              const updatedSummary =
                await ConversationSummarizer.checkAndUpdateSummary(
                thread,
                workspace,
                llmProvider
              );

              if (updatedSummary) {
                try {
                  const { writeConsolidatedMemory } = require("../utils/octopusKb/memoryWriter");
                  const refreshedThread = await WorkspaceThread.get({ id: threadId });
                  const refreshedMeta = safeJsonParse(refreshedThread?.metadata, {});
                  const conversationSummary = refreshedMeta.conversation_summary;
                  if (conversationSummary?.anchored) {
                    await writeConsolidatedMemory({
                      slug: workspace.slug,
                      threadId,
                      anchored: conversationSummary.anchored,
                      summaryUpdatedAt: conversationSummary.updatedAt,
                    });
                  }
                } catch (error) {
                  console.warn(
                    "[WorkspaceChats] octopus-kb memory write skipped:",
                    error.message
                  );
                }
              }

              // 【Phase 2】提取工作记忆（活跃主题、任务、决策）
              const responseObj = safeJsonParse(chat.response, {});
              const aiResponse = responseObj.text || "";
              await WorkingMemory.extractFromChat(
                prompt,
                aiResponse,
                threadId,
                chat.id
              );

              // 【Phase 2】Episode 自动检测
              const messageCount = await this.count({ thread_id: threadId });
              const detection = await EpisodeDetector.detectEpisode({
                workspaceId,
                userMessage: prompt,
                aiResponse,
                threadId,
                messageCount,
              });

              // 如果检测到建议，存储到 thread.metadata 供前端显示
              if (detection.suggestNew || detection.belongsTo) {
                const meta = safeJsonParse(thread.metadata, {});
                meta.episode_suggestion = {
                  belongsTo: detection.belongsTo,
                  suggestNew: detection.suggestNew,
                  confidence: detection.confidence,
                  reason: detection.reason,
                  suggestedAt: new Date().toISOString(),
                };
                await prisma.workspace_threads.update({
                  where: { id: threadId },
                  data: { metadata: JSON.stringify(meta) },
                });
                console.log(
                  "[WorkspaceChats] Episode suggestion stored:",
                  detection
                );
              }
            }
          } catch (error) {
            console.warn(
              "[WorkspaceChats] Error in post-chat processing:",
              error.message
            );
          }
        });
      }

      return { chat, message: null };
    } catch (error) {
      console.error(error.message);
      return { chat: null, message: error.message };
    }
  },

  forWorkspaceByUser: async function (
    workspaceId = null,
    userId = null,
    limit = null,
    orderBy = null,
    // undefined = no assistant filter (all, backward compat); null = no-assistant
    // (plain workspace chats); a value = that specific AI employee's chats only.
    assistantId = undefined
  ) {
    if (!workspaceId || !userId) return [];
    try {
      const chats = await prisma.workspace_chats.findMany({
        where: {
          workspaceId,
          // 包含用户自己的消息 + 系统消息（如定时任务，user_id 为 null）
          OR: [{ user_id: userId }, { user_id: null }],
          thread_id: null, // this function is now only used for the default thread on workspaces and users
          api_session_id: null, // do not include api-session chats in the frontend for anyone.
          include: true,
          ...(assistantId !== undefined
            ? { assistant_id: assistantId ? String(assistantId) : null }
            : {}),
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : { orderBy: { id: "asc" } }),
      });
      return chats;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  forWorkspaceByApiSessionId: async function (
    workspaceId = null,
    apiSessionId = null,
    limit = null,
    orderBy = null
  ) {
    if (!workspaceId || !apiSessionId) return [];
    try {
      const chats = await prisma.workspace_chats.findMany({
        where: {
          workspaceId,
          user_id: null,
          api_session_id: String(apiSessionId),
          thread_id: null,
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : { orderBy: { id: "asc" } }),
      });
      return chats;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  forWorkspace: async function (
    workspaceId = null,
    limit = null,
    orderBy = null,
    // undefined = no assistant filter (all, backward compat); null = no-assistant
    // (plain workspace chats); a value = that specific AI employee's chats only.
    assistantId = undefined
  ) {
    if (!workspaceId) return [];
    try {
      const chats = await prisma.workspace_chats.findMany({
        where: {
          workspaceId,
          thread_id: null, // this function is now only used for the default thread on workspaces
          api_session_id: null, // do not include api-session chats in the frontend for anyone.
          include: true,
          ...(assistantId !== undefined
            ? { assistant_id: assistantId ? String(assistantId) : null }
            : {}),
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : { orderBy: { id: "asc" } }),
      });
      return chats;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  /**
   * @deprecated Use markThreadHistoryInvalidV2 instead.
   */
  markHistoryInvalid: async function (workspaceId = null, user = null) {
    if (!workspaceId) return;
    try {
      await prisma.workspace_chats.updateMany({
        where: {
          workspaceId,
          user_id: user?.id,
          thread_id: null, // this function is now only used for the default thread on workspaces
        },
        data: {
          include: false,
        },
      });
      return;
    } catch (error) {
      console.error(error.message);
    }
  },

  /**
   * @deprecated Use markThreadHistoryInvalidV2 instead.
   */
  markThreadHistoryInvalid: async function (
    workspaceId = null,
    user = null,
    threadId = null
  ) {
    if (!workspaceId || !threadId) return;
    try {
      await prisma.workspace_chats.updateMany({
        where: {
          workspaceId,
          thread_id: threadId,
          user_id: user?.id,
        },
        data: {
          include: false,
        },
      });
      return;
    } catch (error) {
      console.error(error.message);
    }
  },

  /**
   * @description This function is used to mark a thread's history as invalid.
   * and works with an arbitrary where clause.
   * @param {Object} whereClause - The where clause to update the chats.
   * @param {Object} data - The data to update the chats with.
   * @returns {Promise<void>}
   */
  markThreadHistoryInvalidV2: async function (whereClause = {}) {
    if (!whereClause) return;
    try {
      await prisma.workspace_chats.updateMany({
        where: whereClause,
        data: {
          include: false,
        },
      });
      return;
    } catch (error) {
      console.error(error.message);
    }
  },

  get: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const chat = await prisma.workspace_chats.findFirst({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return chat || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  delete: async function (clause = {}) {
    try {
      await this._deleteOctopusKbMemoryPages(clause);
      await prisma.workspace_chats.deleteMany({
        where: clause,
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  _deleteOctopusKbMemoryPages: async function (clause = {}) {
    try {
      const chats = await prisma.workspace_chats.findMany({
        where: clause,
        select: { workspaceId: true, thread_id: true },
      });
      if (!chats.length || !prisma.workspaces?.findMany) return;

      const workspaceIds = Array.from(
        new Set(chats.map((chat) => chat.workspaceId).filter(Boolean))
      );
      const workspaces = await prisma.workspaces.findMany({
        where: { id: { in: workspaceIds } },
        select: { id: true, slug: true },
      });
      const slugsById = new Map(workspaces.map((workspace) => [workspace.id, workspace.slug]));
      const { deleteWorkspaceMemoryPages } = require("../utils/octopusKb/retention");

      const targets = new Set();
      for (const chat of chats) {
        if (!chat.thread_id) continue;
        const slug = slugsById.get(chat.workspaceId);
        if (!slug) continue;
        const key = `${slug}:${chat.thread_id}`;
        if (targets.has(key)) continue;
        targets.add(key);
        await deleteWorkspaceMemoryPages(slug, chat.thread_id);
      }
    } catch (error) {
      console.warn("[WorkspaceChats] octopus-kb memory cleanup skipped:", error.message);
    }
  },

  where: async function (
    clause = {},
    limit = null,
    orderBy = null,
    offset = null
  ) {
    try {
      const chats = await prisma.workspace_chats.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(offset !== null ? { skip: offset } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return chats;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  count: async function (clause = {}) {
    try {
      const count = await prisma.workspace_chats.count({
        where: clause,
      });
      return count;
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  /**
   * 获取对话列表并关联工作区和用户信息
   * [性能优化] 使用批量查询替代循环中逐个查询，将 O(n) 降为 O(1) 数据库查询
   * @param {Object} clause - 查询条件
   * @param {number} limit - 限制条数
   * @param {number} offset - 偏移量
   * @param {Object} orderBy - 排序条件
   * @returns {Promise<Array>}
   */
  whereWithData: async function (
    clause = {},
    limit = null,
    offset = null,
    orderBy = null
  ) {
    const { Workspace } = require("./workspace");
    const { User } = require("./user");

    try {
      const results = await this.where(clause, limit, orderBy, offset);
      if (results.length === 0) return results;

      // 批量获取所有相关工作区 - 只需 2 次数据库查询而非 N+1 次
      const workspaceIds = [
        ...new Set(results.map((r) => r.workspaceId).filter(Boolean)),
      ];
      const workspaceMap = {};
      if (workspaceIds.length > 0) {
        const workspaces = await Workspace.where({ id: { in: workspaceIds } });
        workspaces.forEach((ws) => {
          workspaceMap[ws.id] = ws;
        });
      }

      // 批量获取所有相关用户
      const userIds = [
        ...new Set(results.map((r) => r.user_id).filter(Boolean)),
      ];
      const userMap = {};
      if (userIds.length > 0) {
        const users = await User.where({ id: { in: userIds } });
        users.forEach((u) => {
          userMap[u.id] = u;
        });
      }

      for (const res of results) {
        const workspace = res.workspaceId
          ? workspaceMap[res.workspaceId]
          : null;
        res.workspace = workspace
          ? { name: workspace.name, slug: workspace.slug }
          : { name: "deleted workspace", slug: null };

        const user = res.user_id ? userMap[res.user_id] : null;
        res.user = user
          ? { username: user.username }
          : { username: res.api_session_id !== null ? "API" : "unknown user" };
      }

      return results;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },
  updateFeedbackScore: async function (chatId = null, feedbackScore = null) {
    if (!chatId) return;
    try {
      await prisma.workspace_chats.update({
        where: {
          id: Number(chatId),
        },
        data: {
          feedbackScore:
            feedbackScore === null ? null : Number(feedbackScore) === 1,
        },
      });
      return;
    } catch (error) {
      console.error(error.message);
    }
  },

  /**
   * 更新用户评分（1-5 星）
   * 评分存储在 response JSON 的 metadata.user_rating 字段中
   * @param {number} chatId - 聊天消息 ID
   * @param {number|null} rating - 评分（1-5）或 null 取消评分
   * @returns {Promise<boolean>}
   */
  updateUserRating: async function (chatId = null, rating = null) {
    if (!chatId) return false;
    try {
      // 获取当前消息的 response
      const chat = await prisma.workspace_chats.findUnique({
        where: { id: Number(chatId) },
        select: { response: true },
      });

      if (!chat) return false;

      // 解析现有 response
      let responseObj = {};
      try {
        responseObj =
          typeof chat.response === "string"
            ? JSON.parse(chat.response)
            : chat.response;
      } catch {
        responseObj = { text: chat.response };
      }

      // 确保 metadata 对象存在
      if (!responseObj.metadata) {
        responseObj.metadata = {};
      }

      // 更新 user_rating 字段
      responseObj.metadata.user_rating = rating;
      responseObj.metadata.user_rating_at = rating
        ? new Date().toISOString()
        : null;

      await prisma.workspace_chats.update({
        where: { id: Number(chatId) },
        data: {
          response: JSON.stringify(responseObj),
        },
      });
      return true;
    } catch (error) {
      console.error("updateUserRating error:", error.message);
      return false;
    }
  },

  // Explicit update of settings + key validations.
  // Only use this method when directly setting a key value
  // that takes no user input for the keys being modified.
  _update: async function (id = null, data = {}) {
    if (!id) throw new Error("No workspace chat id provided for update");

    try {
      await prisma.workspace_chats.update({
        where: { id },
        data,
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },
  bulkCreate: async function (chatsData) {
    // TODO: Replace with createMany when we update prisma to latest version
    // The version of prisma that we are currently using does not support createMany with SQLite
    try {
      const createdChats = [];
      for (const chatData of chatsData) {
        const chat = await prisma.workspace_chats.create({
          data: chatData,
        });
        createdChats.push(chat);
      }
      return { chats: createdChats, message: null };
    } catch (error) {
      console.error(error.message);
      return { chats: null, message: error.message };
    }
  },
};

module.exports = { WorkspaceChats };
