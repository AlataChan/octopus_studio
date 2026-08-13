/**
 * 上下文增强模块
 *
 * Phase 2: 提供统一的上下文增强功能
 * Phase 3: Context Engineering 锚定上下文集成
 *
 * 功能：
 * 1. 锚定上下文注入（会话意图、决策、任务、产物）
 * 2. 对话摘要注入
 * 3. 图谱上下文检索
 * 4. 用户偏好注入
 *
 * @module contextEnhancer
 */

const { ConversationSummarizer } = require("../memory/conversationSummarizer");
const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { summarizeGraphContext } = require("./graphSummarization");
const { safeJsonParse } = require("../http");
const { UserPreferences } = require("../memory/userPreferences");
const { WorkingMemory } = require("../memory/workingMemory");

/**
 * 摘要注入配置
 */
const SUMMARY_INJECTION_CONFIG = {
  /** 最小对话轮数（低于此值不注入摘要） */
  minMessageCount: 10,
  /** 最小对话时长（毫秒），1天 = 86400000 */
  minDurationMs: 24 * 60 * 60 * 1000,
  /** 是否启用摘要注入 */
  enabled: true,
};

/**
 * 检查是否应该注入对话摘要
 *
 * 条件：
 * 1. Thread 存在且有摘要
 * 2. 对话轮数 >= 10 或 对话时长 >= 1天
 *
 * @param {Object} thread - Thread 对象
 * @returns {boolean}
 */
function shouldInjectSummary(thread) {
  if (!SUMMARY_INJECTION_CONFIG.enabled) return false;
  if (!thread?.metadata) return false;

  const metadata = safeJsonParse(thread.metadata, {});
  const summary = metadata?.conversation_summary;

  if (!summary?.content) return false;

  // 条件 1: 对话轮数 >= 10
  const messageCount = summary.messageCount || 0;
  if (messageCount >= SUMMARY_INJECTION_CONFIG.minMessageCount) {
    return true;
  }

  // 条件 2: 对话时长 >= 1天
  const createdAt = thread.createdAt
    ? new Date(thread.createdAt).getTime()
    : Date.now();
  const duration = Date.now() - createdAt;
  if (duration >= SUMMARY_INJECTION_CONFIG.minDurationMs) {
    return true;
  }

  return false;
}

/**
 * 获取对话摘要上下文
 *
 * @param {Object} thread - Thread 对象
 * @returns {string|null} 格式化的摘要上下文
 */
function getConversationSummaryContext(thread) {
  if (!shouldInjectSummary(thread)) {
    return null;
  }
  return ConversationSummarizer.formatSummaryForContext(thread);
}

/**
 * 获取统一的锚定上下文
 * 合并 WorkingMemory 和 ConversationSummarizer 的输出，避免重复
 *
 * @param {Object} thread - Thread 对象
 * @returns {string|null} 统一格式化的锚定上下文
 */
function getUnifiedAnchoredContext(thread) {
  if (!thread?.metadata) return null;

  const ctx = WorkingMemory.getWorkingContext(thread);
  const parts = [];

  // 会话意图（最重要，放在最前）
  if (ctx.session_intent) {
    parts.push(`[会话意图]: ${ctx.session_intent}`);
  }

  // 当前讨论主题
  if (ctx.topics && ctx.topics.length > 0) {
    parts.push(`[当前主题]: ${ctx.topics.join(", ")}`);
  }

  // 待办任务
  if (ctx.tasks && ctx.tasks.length > 0) {
    const taskList = ctx.tasks
      .map((t) =>
        typeof t === "string"
          ? `- ${t}`
          : `- ${t.task} (${t.status === "in_progress" ? "进行中" : "待处理"})`
      )
      .join("\n");
    parts.push(`[待办任务]:\n${taskList}`);
  }

  // 关键决策（取最近3条）
  if (ctx.decisions && ctx.decisions.length > 0) {
    const decisionList = ctx.decisions
      .slice(-3)
      .map((d) =>
        typeof d === "string"
          ? `- ${d}`
          : `- ${d.decision}${d.reason ? `: ${d.reason}` : ""}`
      )
      .join("\n");
    parts.push(`[关键决策]:\n${decisionList}`);
  }

  // 生成的产物
  if (ctx.artifacts_generated && ctx.artifacts_generated.length > 0) {
    const artifactList = ctx.artifacts_generated
      .slice(-5)
      .map((a) =>
        typeof a === "string"
          ? `- ${a}`
          : `- ${a.name || a.type || "未命名产物"}`
      )
      .join("\n");
    parts.push(`[生成产物]:\n${artifactList}`);
  }

  // 对话摘要（如果满足注入条件）
  if (shouldInjectSummary(thread) && ctx.summary) {
    parts.push(`[对话摘要]: ${ctx.summary}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * 获取图谱上下文
 *
 * 统一接口，供各 handler 调用（stream.js、apiChatHandler.js 等）
 *
 * @param {Object} options - 选项
 * @param {number} options.workspaceId - 工作区 ID
 * @param {string} options.query - 用户查询
 * @param {number} [options.tokenBudget=3000] - Token 预算
 * @param {number} [options.limit=50] - 最大节点数
 * @returns {Promise<{summary: string, nodeCount: number, edgeCount: number, tokenCount: number}|null>}
 */
async function getGraphContextForChat({
  workspaceId,
  query,
  tokenBudget = 3000,
  limit = 50,
}) {
  try {
    const graphStartTime = Date.now();
    const subgraph = await WorkspaceGraph.searchSubgraph({
      workspaceId,
      keyword: query,
      limit,
    });

    if (!subgraph.nodes || subgraph.nodes.length === 0) {
      console.log(
        "[GraphContext] No graph nodes found for query:",
        query.substring(0, 50)
      );
      return null;
    }

    const result = summarizeGraphContext(subgraph, query, tokenBudget);

    console.log("[GraphContext]", {
      searchTime: Date.now() - graphStartTime,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
      tokenCount: result.tokenCount,
      tokenBudget,
    });

    return result;
  } catch (error) {
    console.error("[GraphContext] Error searching graph:", error);
    return null;
  }
}

/**
 * 获取用户偏好提示词
 *
 * @param {number|null} userId - 用户 ID
 * @returns {Promise<string>} 偏好提示词
 */
async function getUserPreferencePrompt(userId) {
  if (!userId) return "";
  return UserPreferences.generatePreferencePrompt(userId);
}

/**
 * 增强上下文（统一入口）
 *
 * Phase 3: 使用统一的锚定上下文格式，避免重复注入
 *
 * @param {Object} options - 选项
 * @param {Object} options.thread - Thread 对象
 * @param {number} options.workspaceId - 工作区 ID
 * @param {string} options.query - 用户查询
 * @param {number|null} [options.userId=null] - 用户 ID（用于获取偏好）
 * @param {boolean} [options.includeGraphContext=true] - 是否包含图谱上下文
 * @param {boolean} [options.includeSummary=true] - 是否包含对话摘要
 * @param {boolean} [options.includeUserPreferences=true] - 是否包含用户偏好
 * @param {boolean} [options.includeWorkingMemory=true] - 是否包含工作记忆
 * @param {boolean} [options.useUnifiedContext=true] - 是否使用统一锚定上下文（推荐）
 * @param {number} [options.graphTokenBudget=3000] - 图谱 Token 预算
 * @returns {Promise<{contextTexts: string[], sources: Object[], metadata: Object, preferencePrompt: string}>}
 */
async function enhanceContext({
  thread,
  workspaceId,
  query,
  userId = null,
  includeGraphContext = true,
  includeSummary = true,
  includeUserPreferences = true,
  includeWorkingMemory = true,
  useUnifiedContext = true,
  graphTokenBudget = 3000,
}) {
  const contextTexts = [];
  const sources = [];
  const metadata = {
    summaryInjected: false,
    graphContextUsed: false,
    userPreferencesApplied: false,
    workingMemoryInjected: false,
    unifiedContextUsed: false,
  };
  let preferencePrompt = "";

  // Phase 3: 使用统一锚定上下文（推荐方式）
  if (useUnifiedContext && thread && (includeSummary || includeWorkingMemory)) {
    const unifiedContext = getUnifiedAnchoredContext(thread);
    if (unifiedContext) {
      contextTexts.unshift(unifiedContext); // 锚定上下文放在最前面
      metadata.unifiedContextUsed = true;
      metadata.summaryInjected = shouldInjectSummary(thread);
      metadata.workingMemoryInjected = true;
      console.log(
        "[ContextEnhancer] Unified anchored context injected for thread:",
        thread?.id
      );
    }
  } else {
    // 旧模式：分别注入摘要和工作记忆（向后兼容）
    // 1. 注入对话摘要
    if (includeSummary) {
      const summaryContext = getConversationSummaryContext(thread);
      if (summaryContext) {
        contextTexts.unshift(summaryContext); // 摘要放在最前面
        metadata.summaryInjected = true;
        console.log(
          "[ContextEnhancer] Summary injected for thread:",
          thread?.id
        );
      }
    }

    // 2. 注入工作记忆（活跃主题、待办任务、关键决策）
    if (includeWorkingMemory && thread) {
      const workingContext = WorkingMemory.formatWorkingContext(thread);
      if (workingContext) {
        contextTexts.push(workingContext);
        metadata.workingMemoryInjected = true;
        console.log(
          "[ContextEnhancer] Working memory injected for thread:",
          thread?.id
        );
      }
    }
  }

  // 3. 获取图谱上下文
  if (includeGraphContext && workspaceId) {
    const graphResult = await getGraphContextForChat({
      workspaceId,
      query,
      tokenBudget: graphTokenBudget,
    });

    if (graphResult?.summary) {
      contextTexts.push(graphResult.summary);
      sources.push({
        text: `知识图谱上下文 (${graphResult.nodeCount} 个节点, ${graphResult.edgeCount} 条关系)`,
        title: "知识图谱",
        type: "graph",
        metadata: {
          nodeCount: graphResult.nodeCount,
          edgeCount: graphResult.edgeCount,
          tokenCount: graphResult.tokenCount,
        },
      });
      metadata.graphContextUsed = true;
      metadata.graphNodeCount = graphResult.nodeCount;
      metadata.graphEdgeCount = graphResult.edgeCount;
    }
  }

  // 4. 获取用户偏好提示词
  if (includeUserPreferences && userId) {
    preferencePrompt = await getUserPreferencePrompt(userId);
    if (preferencePrompt) {
      metadata.userPreferencesApplied = true;
      console.log(
        "[ContextEnhancer] User preferences applied for user:",
        userId
      );
    }
  }

  return { contextTexts, sources, metadata, preferencePrompt };
}

module.exports = {
  shouldInjectSummary,
  getConversationSummaryContext,
  getUnifiedAnchoredContext,
  getGraphContextForChat,
  getUserPreferencePrompt,
  enhanceContext,
  SUMMARY_INJECTION_CONFIG,
};
