/**
 * 工作记忆管理器
 *
 * Phase 2: 用好 thread.metadata 存储活跃主题、待办任务和关键决策
 * Phase 3: Context Engineering 锚定字段支持
 *
 * 不新建表，复用现有的 workspace_threads.metadata 字段
 *
 * @module utils/memory/workingMemory
 */

const prisma = require("../prisma");

/**
 * Schema 版本号
 * 用于数据结构升级和向后兼容
 */
const SCHEMA_VERSION = "1.0";

/**
 * 默认的锚定上下文结构
 */
const DEFAULT_ANCHORED_CONTEXT = {
  schema_version: SCHEMA_VERSION,
  session_intent: null, // 会话意图
  artifacts_generated: [], // 生成的产物（文件、代码等）
  active_topics: [], // 活跃讨论主题
  pending_tasks: [], // 待办任务
  key_decisions: [], // 关键决策
};

const WorkingMemory = {
  /**
   * 解析 metadata 并确保兼容性
   * @param {Object|string} metadata - 原始 metadata
   * @returns {Object} 解析后的 metadata
   */
  parseMetadata: function (metadata) {
    if (!metadata) return { ...DEFAULT_ANCHORED_CONTEXT };

    const meta =
      typeof metadata === "string" ? JSON.parse(metadata || "{}") : metadata;

    // 如果没有 schema_version，进行迁移
    if (!meta.schema_version) {
      return this.migrateToV1(meta);
    }

    return meta;
  },

  /**
   * 将旧数据迁移到 v1.0 schema
   * @param {Object} meta - 旧版 metadata
   * @returns {Object} 迁移后的 metadata
   */
  migrateToV1: function (meta) {
    return {
      ...meta,
      schema_version: SCHEMA_VERSION,
      session_intent: meta.session_intent || null,
      artifacts_generated: meta.artifacts_generated || [],
      active_topics: meta.active_topics || [],
      pending_tasks: meta.pending_tasks || [],
      key_decisions: meta.key_decisions || [],
    };
  },

  /**
   * 获取线程的锚定工作记忆上下文
   * @param {Object} thread - 线程对象
   * @returns {Object} 锚定工作记忆上下文
   */
  getWorkingContext: function (thread) {
    if (!thread?.metadata) {
      return {
        schema_version: SCHEMA_VERSION,
        session_intent: null,
        artifacts_generated: [],
        summary: null,
        topics: [],
        tasks: [],
        decisions: [],
      };
    }

    const meta = this.parseMetadata(thread.metadata);

    return {
      schema_version: meta.schema_version || SCHEMA_VERSION,
      session_intent: meta.session_intent || null,
      artifacts_generated: meta.artifacts_generated || [],
      summary: meta.conversation_summary?.content || null,
      topics: meta.active_topics || [],
      tasks: (meta.pending_tasks || []).filter((t) => t.status !== "completed"),
      decisions: meta.key_decisions || [],
    };
  },

  /**
   * 格式化工作记忆为 LLM 锚定上下文
   * 使用结构化格式确保关键信息不丢失
   * @param {Object} thread - 线程对象
   * @returns {string|null} 格式化的锚定上下文字符串
   */
  formatWorkingContext: function (thread) {
    const ctx = this.getWorkingContext(thread);
    const parts = [];

    // 会话意图（最重要，放在最前）
    if (ctx.session_intent) {
      parts.push(`[会话意图]: ${ctx.session_intent}`);
    }

    // 当前讨论主题
    if (ctx.topics.length > 0) {
      parts.push(`[当前主题]: ${ctx.topics.join(", ")}`);
    }

    // 待办任务
    if (ctx.tasks.length > 0) {
      const taskList = ctx.tasks
        .map(
          (t) =>
            `- ${t.task} (${t.status === "in_progress" ? "进行中" : "待处理"})`
        )
        .join("\n");
      parts.push(`[待办任务]:\n${taskList}`);
    }

    // 关键决策（取最近3条）
    if (ctx.decisions.length > 0) {
      const decisionList = ctx.decisions
        .slice(-3)
        .map((d) => `- ${d.decision}${d.reason ? `: ${d.reason}` : ""}`)
        .join("\n");
      parts.push(`[关键决策]:\n${decisionList}`);
    }

    // 生成的产物
    if (ctx.artifacts_generated.length > 0) {
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

    return parts.length > 0 ? parts.join("\n\n") : null;
  },

  /**
   * 更新会话意图
   * @param {number} threadId - 线程 ID
   * @param {string} intent - 会话意图描述
   */
  updateSessionIntent: async function (threadId, intent) {
    const thread = await prisma.workspace_threads.findUnique({
      where: { id: threadId },
      select: { metadata: true },
    });

    const meta = this.parseMetadata(thread?.metadata);
    meta.session_intent = intent;
    meta.session_intent_updated_at = new Date().toISOString();

    await prisma.workspace_threads.update({
      where: { id: threadId },
      data: { metadata: JSON.stringify(meta), lastUpdatedAt: new Date() },
    });
  },

  /**
   * 添加生成的产物
   * @param {number} threadId - 线程 ID
   * @param {Object|string} artifact - 产物信息 { name, type, path, chatId } 或简单字符串
   */
  addArtifact: async function (threadId, artifact) {
    const thread = await prisma.workspace_threads.findUnique({
      where: { id: threadId },
      select: { metadata: true },
    });

    const meta = this.parseMetadata(thread?.metadata);
    meta.artifacts_generated = meta.artifacts_generated || [];

    const artifactObj =
      typeof artifact === "string"
        ? { name: artifact, createdAt: new Date().toISOString() }
        : { ...artifact, createdAt: new Date().toISOString() };

    meta.artifacts_generated.push(artifactObj);

    // 限制最多保留 20 个产物记录
    if (meta.artifacts_generated.length > 20) {
      meta.artifacts_generated = meta.artifacts_generated.slice(-20);
    }

    await prisma.workspace_threads.update({
      where: { id: threadId },
      data: { metadata: JSON.stringify(meta), lastUpdatedAt: new Date() },
    });
  },

  /**
   * 更新活跃主题
   * @param {number} threadId - 线程 ID
   * @param {string[]} topics - 主题列表
   */
  updateTopics: async function (threadId, topics) {
    const thread = await prisma.workspace_threads.findUnique({
      where: { id: threadId },
      select: { metadata: true },
    });

    const meta = this.parseMetadata(thread?.metadata);
    meta.active_topics = topics.slice(0, 5); // 最多保留5个活跃主题
    meta.topics_updated_at = new Date().toISOString();

    await prisma.workspace_threads.update({
      where: { id: threadId },
      data: { metadata: JSON.stringify(meta), lastUpdatedAt: new Date() },
    });
  },

  /**
   * 添加待办任务
   * @param {number} threadId - 线程 ID
   * @param {Object} task - 任务对象 { task, status, chatId }
   */
  addTask: async function (threadId, task) {
    const thread = await prisma.workspace_threads.findUnique({
      where: { id: threadId },
      select: { metadata: true },
    });

    const meta = this.parseMetadata(thread?.metadata);
    meta.pending_tasks = meta.pending_tasks || [];
    meta.pending_tasks.push({
      id: `task-${Date.now()}`,
      task: task.task,
      status: task.status || "pending",
      chatId: task.chatId,
      createdAt: new Date().toISOString(),
    });

    // 限制最多保留 10 个任务
    if (meta.pending_tasks.length > 10) {
      meta.pending_tasks = meta.pending_tasks.slice(-10);
    }

    await prisma.workspace_threads.update({
      where: { id: threadId },
      data: { metadata: JSON.stringify(meta), lastUpdatedAt: new Date() },
    });
  },

  /**
   * 更新任务状态
   * @param {number} threadId - 线程 ID
   * @param {string} taskId - 任务 ID
   * @param {string} status - 新状态: pending/in_progress/completed
   */
  updateTaskStatus: async function (threadId, taskId, status) {
    const thread = await prisma.workspace_threads.findUnique({
      where: { id: threadId },
      select: { metadata: true },
    });

    const meta = this.parseMetadata(thread?.metadata);

    if (meta.pending_tasks) {
      const task = meta.pending_tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = status;
        task.updatedAt = new Date().toISOString();
      }
    }

    await prisma.workspace_threads.update({
      where: { id: threadId },
      data: { metadata: JSON.stringify(meta), lastUpdatedAt: new Date() },
    });
  },

  /**
   * 记录关键决策
   * @param {number} threadId - 线程 ID
   * @param {Object} decision - 决策对象 { decision, reason, chatId }
   */
  addDecision: async function (threadId, decision) {
    const thread = await prisma.workspace_threads.findUnique({
      where: { id: threadId },
      select: { metadata: true },
    });

    const meta = this.parseMetadata(thread?.metadata);
    meta.key_decisions = meta.key_decisions || [];
    meta.key_decisions.push({
      id: `decision-${Date.now()}`,
      decision: decision.decision,
      reason: decision.reason || null,
      chatId: decision.chatId,
      createdAt: new Date().toISOString(),
    });

    // 限制最多保留 10 个决策
    if (meta.key_decisions.length > 10) {
      meta.key_decisions = meta.key_decisions.slice(-10);
    }

    await prisma.workspace_threads.update({
      where: { id: threadId },
      data: { metadata: JSON.stringify(meta), lastUpdatedAt: new Date() },
    });
  },

  /**
   * 从对话内容自动提取工作记忆（轻量级规则，无 LLM）
   * @param {string} userMessage - 用户消息
   * @param {string} aiResponse - AI 响应
   * @param {number} threadId - 线程 ID
   * @param {number} chatId - 对话 ID
   */
  extractFromChat: async function (userMessage, aiResponse, threadId, chatId) {
    // 任务检测模式
    const taskPatterns = [
      /(?:请|帮我|需要|要|必须)(.{5,50}?)(?:吗|呢|。|$)/g,
      /TODO[:\s]*(.{5,50})/gi,
      /待办[:\s]*(.{5,50})/g,
    ];

    // 决策检测模式
    const decisionPatterns = [
      /(?:决定|选择|采用|使用|确定)(.{5,50}?)(?:方案|方式|框架|库|工具)?/g,
      /最终[:\s]*(.{5,50})/g,
    ];

    // 产物检测模式（从 AI 回复中检测生成的文件/代码）
    const artifactPatterns = [
      /已(?:生成|创建|写入)(?:文件)?[:\s]*[`"]?([^`"\n]+)[`"]?/g,
      /(?:文件|代码)[:\s]*[`"]?([^\s`"]+\.[a-z]+)[`"]?\s*(?:已|创建|生成)/g,
    ];

    // 主题检测 (从用户消息中提取关键词)
    const topicKeywords = userMessage.match(
      /(?:关于|针对|讨论|处理)\s*(\S{2,10})/g
    );

    // 提取任务
    for (const pattern of taskPatterns) {
      const matches = [...userMessage.matchAll(pattern)];
      for (const match of matches.slice(0, 2)) {
        if (match[1] && match[1].length > 5) {
          await this.addTask(threadId, {
            task: match[1].trim(),
            status: "pending",
            chatId,
          });
        }
      }
    }

    // 提取决策（从 AI 回复中）
    for (const pattern of decisionPatterns) {
      const matches = [...aiResponse.matchAll(pattern)];
      for (const match of matches.slice(0, 1)) {
        if (match[1] && match[1].length > 5) {
          await this.addDecision(threadId, {
            decision: match[1].trim(),
            chatId,
          });
        }
      }
    }

    // 提取产物（从 AI 回复中）
    for (const pattern of artifactPatterns) {
      const matches = [...aiResponse.matchAll(pattern)];
      for (const match of matches.slice(0, 3)) {
        if (match[1] && match[1].length > 2) {
          await this.addArtifact(threadId, {
            name: match[1].trim(),
            type: "file",
            chatId,
          });
        }
      }
    }

    // 更新主题（如果检测到新主题）
    if (topicKeywords && topicKeywords.length > 0) {
      const thread = await prisma.workspace_threads.findUnique({
        where: { id: threadId },
        select: { metadata: true },
      });

      const meta = this.parseMetadata(thread?.metadata);
      const existingTopics = meta.active_topics || [];
      const newTopics = topicKeywords
        .map((t) => t.replace(/^(?:关于|针对|讨论|处理)\s*/, ""))
        .filter((t) => !existingTopics.includes(t));

      if (newTopics.length > 0) {
        await this.updateTopics(
          threadId,
          [...existingTopics, ...newTopics].slice(-5)
        );
      }
    }
  },

  /**
   * 获取当前 Schema 版本
   * @returns {string} Schema 版本号
   */
  getSchemaVersion: function () {
    return SCHEMA_VERSION;
  },
};

module.exports = { WorkingMemory, SCHEMA_VERSION, DEFAULT_ANCHORED_CONTEXT };
