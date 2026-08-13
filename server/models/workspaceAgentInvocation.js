const prisma = require("../utils/prisma");
const { v4: uuidv4 } = require("uuid");
const { safeJsonParse } = require("../utils/http");

// 内存缓存：存储 invocation 的附件（因为附件不存储在数据库中）
// key: invocation uuid, value: attachments array
const attachmentsCache = new Map();

const WorkspaceAgentInvocation = {
  // returns array of strings with their @ handle.
  // must start with @agent for now.
  parseAgents: function (promptString) {
    if (!promptString.startsWith("@agent")) return [];
    return promptString.split(/\s+/).filter((v) => v.startsWith("@"));
  },

  close: async function (uuid) {
    if (!uuid) return;
    try {
      await prisma.workspace_agent_invocations.update({
        where: { uuid: String(uuid) },
        data: {
          closed: true,
          lastUpdatedAt: new Date(), // 更新时间戳以计算响应时间
        },
      });
      // 清理附件缓存
      if (attachmentsCache.has(uuid)) {
        attachmentsCache.delete(uuid);
        console.log(
          `[AgentInvocation] Cleared attachments cache for invocation ${uuid}`
        );
      }
    } catch {}
  },

  new: async function ({
    prompt,
    workspace,
    user = null,
    thread = null,
    assistantId = null,
    attachments = [],
    metadata = {},
  }) {
    try {
      const newUuid = uuidv4();
      const invocation = await prisma.workspace_agent_invocations.create({
        data: {
          uuid: newUuid,
          workspace_id: workspace.id,
          prompt: String(prompt),
          metadata: JSON.stringify(metadata || {}),
          user_id: user?.id,
          thread_id: thread?.id,
          assistant_id: assistantId, // 保存AI员工ID
        },
      });

      // 附件存储在内存缓存中，通过 UUID 关联
      // 这样可以避免修改数据库 schema
      if (attachments && attachments.length > 0) {
        attachmentsCache.set(newUuid, attachments);
        console.log(
          `[AgentInvocation] Cached ${attachments.length} attachments for invocation ${newUuid}`
        );
      }

      return { invocation, message: null };
    } catch (error) {
      console.error(error.message);
      return { invocation: null, message: error.message };
    }
  },

  get: async function (clause = {}) {
    try {
      const invocation = await prisma.workspace_agent_invocations.findFirst({
        where: clause,
      });

      return invocation || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  getWithWorkspace: async function (clause = {}) {
    try {
      const invocation = await prisma.workspace_agent_invocations.findFirst({
        where: clause,
        include: {
          workspace: true,
        },
      });

      if (invocation) {
        // 从缓存中获取附件
        invocation.attachments = attachmentsCache.get(invocation.uuid) || [];
      }

      return invocation || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.workspace_agent_invocations.delete({
        where: clause,
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  where: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const results = await prisma.workspace_agent_invocations.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return results;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  /**
   * 更新调用的成功状态
   * @param {string} uuid - Invocation UUID
   * @param {boolean} success - 是否成功
   * @returns {Promise<boolean>} 是否更新成功
   */
  updateSuccess: async function (uuid, success) {
    if (!uuid) return false;
    try {
      await prisma.workspace_agent_invocations.update({
        where: { uuid: String(uuid) },
        data: { success: Boolean(success) },
      });
      return true;
    } catch (error) {
      console.error(
        "[WorkspaceAgentInvocation] updateSuccess failed:",
        error.message
      );
      return false;
    }
  },

  /**
   * 关闭调用并设置成功状态
   * @param {string} uuid - Invocation UUID
   * @param {boolean} [success=true] - 是否成功
   * @returns {Promise<boolean>} 是否更新成功
   */
  closeWithStatus: async function (uuid, success = true) {
    if (!uuid) return false;
    try {
      await prisma.workspace_agent_invocations.update({
        where: { uuid: String(uuid) },
        data: {
          closed: true,
          success: Boolean(success),
          lastUpdatedAt: new Date(), // 更新时间戳以计算响应时间
        },
      });
      // 清理附件缓存
      if (attachmentsCache.has(uuid)) {
        attachmentsCache.delete(uuid);
        console.log(
          `[AgentInvocation] Cleared attachments cache for invocation ${uuid}`
        );
      }
      return true;
    } catch (error) {
      console.error(
        "[WorkspaceAgentInvocation] closeWithStatus failed:",
        error.message
      );
      return false;
    }
  },

  /**
   * 更新知识指标
   * @param {string} uuid - Invocation UUID
   * @param {Object} metrics - 知识指标
   * @param {string} [metrics.knowledgeCoverage] - 知识覆盖度: "low" | "medium" | "high"
   * @param {number} [metrics.graphNodesUsed] - 使用的图谱节点数
   * @param {number} [metrics.vectorSourcesUsed] - 使用的向量文档来源数
   * @param {number} [metrics.planningDurationMs] - Planning 阶段耗时 (毫秒)
   * @returns {Promise<boolean>} 是否更新成功
   */
  updateKnowledgeMetrics: async function (uuid, metrics = {}) {
    if (!uuid) return false;
    try {
      const updateData = {};

      if (metrics.knowledgeCoverage) {
        updateData.knowledge_coverage = String(metrics.knowledgeCoverage);
      }
      if (typeof metrics.graphNodesUsed === "number") {
        updateData.graph_nodes_used = metrics.graphNodesUsed;
      }
      if (typeof metrics.vectorSourcesUsed === "number") {
        updateData.vector_sources_used = metrics.vectorSourcesUsed;
      }
      if (typeof metrics.planningDurationMs === "number") {
        updateData.planning_duration_ms = metrics.planningDurationMs;
      }

      if (Object.keys(updateData).length === 0) {
        return true; // 没有需要更新的字段
      }

      await prisma.workspace_agent_invocations.update({
        where: { uuid: String(uuid) },
        data: updateData,
      });

      console.log(
        `[AgentInvocation] Updated knowledge metrics for ${uuid}:`,
        updateData
      );
      return true;
    } catch (error) {
      console.error(
        "[WorkspaceAgentInvocation] updateKnowledgeMetrics failed:",
        error.message
      );
      return false;
    }
  },

  /**
   * 更新 Invocation 的元数据（合并到现有 metadata）
   * @param {string} uuid - Invocation UUID
   * @param {Object} newMetadata - 要合并的新元数据
   * @returns {Promise<boolean>} 是否更新成功
   */
  updateMetadata: async function (uuid, newMetadata = {}) {
    if (!uuid || Object.keys(newMetadata).length === 0) return false;
    try {
      const invocation = await prisma.workspace_agent_invocations.findUnique({
        where: { uuid: String(uuid) },
        select: { metadata: true },
      });

      if (!invocation) return false;

      const existingMetadata = safeJsonParse(invocation.metadata, {}) || {};
      const mergedMetadata = { ...existingMetadata, ...newMetadata };

      await prisma.workspace_agent_invocations.update({
        where: { uuid: String(uuid) },
        data: { metadata: JSON.stringify(mergedMetadata) },
      });

      console.log(`[AgentInvocation] Updated metadata for ${uuid}`);
      return true;
    } catch (error) {
      console.error(
        "[WorkspaceAgentInvocation] updateMetadata failed:",
        error.message
      );
      return false;
    }
  },

  /**
   * 获取知识覆盖度统计
   * @param {Object} options - 查询选项
   * @param {number} [options.workspaceId] - Workspace ID
   * @param {Date} options.startDate - 开始时间
   * @param {Date} [options.endDate] - 结束时间
   * @returns {Promise<Object>} 覆盖度分布统计
   */
  getKnowledgeCoverageStats: async function ({
    workspaceId,
    startDate,
    endDate = new Date(),
  }) {
    try {
      const whereClause = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        closed: true,
        knowledge_coverage: { not: null },
      };

      if (workspaceId) whereClause.workspace_id = workspaceId;

      const [
        lowCount,
        mediumCount,
        highCount,
        avgGraphNodes,
        avgVectorSources,
        avgPlanningTime,
      ] = await Promise.all([
        prisma.workspace_agent_invocations.count({
          where: { ...whereClause, knowledge_coverage: "low" },
        }),
        prisma.workspace_agent_invocations.count({
          where: { ...whereClause, knowledge_coverage: "medium" },
        }),
        prisma.workspace_agent_invocations.count({
          where: { ...whereClause, knowledge_coverage: "high" },
        }),
        prisma.workspace_agent_invocations.aggregate({
          where: whereClause,
          _avg: { graph_nodes_used: true },
        }),
        prisma.workspace_agent_invocations.aggregate({
          where: whereClause,
          _avg: { vector_sources_used: true },
        }),
        prisma.workspace_agent_invocations.aggregate({
          where: whereClause,
          _avg: { planning_duration_ms: true },
        }),
      ]);

      const total = lowCount + mediumCount + highCount;

      return {
        total,
        distribution: {
          low: lowCount,
          medium: mediumCount,
          high: highCount,
        },
        percentages: {
          low: total > 0 ? Number(((lowCount / total) * 100).toFixed(1)) : 0,
          medium:
            total > 0 ? Number(((mediumCount / total) * 100).toFixed(1)) : 0,
          high: total > 0 ? Number(((highCount / total) * 100).toFixed(1)) : 0,
        },
        averages: {
          graphNodesUsed: Math.round(avgGraphNodes._avg?.graph_nodes_used || 0),
          vectorSourcesUsed: Math.round(
            avgVectorSources._avg?.vector_sources_used || 0
          ),
          planningDurationMs: Math.round(
            avgPlanningTime._avg?.planning_duration_ms || 0
          ),
        },
      };
    } catch (error) {
      console.error(
        "[WorkspaceAgentInvocation] getKnowledgeCoverageStats failed:",
        error.message
      );
      return {
        total: 0,
        distribution: { low: 0, medium: 0, high: 0 },
        percentages: { low: 0, medium: 0, high: 0 },
        averages: {
          graphNodesUsed: 0,
          vectorSourcesUsed: 0,
          planningDurationMs: 0,
        },
      };
    }
  },

  /**
   * 获取指定时间范围内的调用统计
   * @param {Object} options - 查询选项
   * @param {number} [options.workspaceId] - Workspace ID
   * @param {string} [options.assistantId] - 助手 ID
   * @param {Date} options.startDate - 开始时间
   * @param {Date} [options.endDate] - 结束时间
   * @returns {Promise<Object>} 统计数据
   */
  getStats: async function ({
    workspaceId,
    assistantId,
    startDate,
    endDate = new Date(),
  }) {
    try {
      const whereClause = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        closed: true, // 只统计已完成的调用
      };

      if (workspaceId) whereClause.workspace_id = workspaceId;
      if (assistantId) whereClause.assistant_id = assistantId;

      const [total, successful, failed] = await Promise.all([
        prisma.workspace_agent_invocations.count({ where: whereClause }),
        prisma.workspace_agent_invocations.count({
          where: { ...whereClause, success: true },
        }),
        prisma.workspace_agent_invocations.count({
          where: { ...whereClause, success: false },
        }),
      ]);

      return {
        total,
        successful,
        failed,
        successRate: total > 0 ? Number((successful / total).toFixed(2)) : 0,
      };
    } catch (error) {
      console.error(
        "[WorkspaceAgentInvocation] getStats failed:",
        error.message
      );
      return { total: 0, successful: 0, failed: 0, successRate: 0 };
    }
  },

  /**
   * 获取指定助手的调用历史
   * @param {Object} options - 查询选项
   * @param {number} options.workspaceId - Workspace ID
   * @param {string} options.assistantId - 助手 ID
   * @param {number} [options.limit=20] - 返回数量
   * @param {number} [options.offset=0] - 偏移量
   * @returns {Promise<{invocations: Array, total: number}>} 调用历史和总数
   */
  getByAssistant: async function ({
    workspaceId,
    assistantId,
    limit = 20,
    offset = 0,
  }) {
    try {
      const whereClause = {
        workspace_id: workspaceId,
        assistant_id: assistantId,
      };

      const [invocations, total] = await Promise.all([
        prisma.workspace_agent_invocations.findMany({
          where: whereClause,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
          include: {
            _count: {
              select: { steps: true },
            },
          },
        }),
        prisma.workspace_agent_invocations.count({ where: whereClause }),
      ]);

      return {
        invocations: invocations.map((inv) => ({
          id: inv.id,
          uuid: inv.uuid,
          prompt:
            inv.prompt.substring(0, 200) +
            (inv.prompt.length > 200 ? "..." : ""),
          success: inv.success,
          closed: inv.closed,
          stepCount: inv._count.steps,
          createdAt: inv.createdAt.toISOString(),
          lastUpdatedAt: inv.lastUpdatedAt.toISOString(),
        })),
        total,
      };
    } catch (error) {
      console.error(
        "[WorkspaceAgentInvocation] getByAssistant failed:",
        error.message
      );
      return { invocations: [], total: 0 };
    }
  },

  /**
   * 根据 ID 获取调用详情（包含步骤）
   * @param {number} id - Invocation ID
   * @returns {Promise<Object|null>} 调用详情
   */
  getWithSteps: async function (id) {
    try {
      const invocation = await prisma.workspace_agent_invocations.findUnique({
        where: { id: parseInt(id) },
        include: {
          steps: {
            orderBy: { step_index: "asc" },
          },
          workspace: {
            select: { id: true, slug: true, name: true },
          },
        },
      });

      if (!invocation) return null;

      return {
        id: invocation.id,
        uuid: invocation.uuid,
        prompt: invocation.prompt,
        success: invocation.success,
        closed: invocation.closed,
        assistantId: invocation.assistant_id,
        workspace: invocation.workspace,
        createdAt: invocation.createdAt.toISOString(),
        lastUpdatedAt: invocation.lastUpdatedAt.toISOString(),
        steps: invocation.steps.map((step) => ({
          id: step.id,
          stepIndex: step.step_index,
          stepType: step.step_type,
          toolName: step.tool_name,
          inputSummary: step.input_summary,
          outputSummary: step.output_summary,
          success: step.success,
          errorMessage: step.error_message,
          durationMs: step.duration_ms,
          createdAt: step.created_at.toISOString(),
        })),
      };
    } catch (error) {
      console.error(
        "[WorkspaceAgentInvocation] getWithSteps failed:",
        error.message
      );
      return null;
    }
  },

  // ========================================
  // Phase A: Blackboard 异步持久化
  // ========================================

  /**
   * 更新 Blackboard 快照（异步持久化）
   * @param {number} invocationId - Invocation ID
   * @param {Object} snapshot - Blackboard 快照数据
   * @param {string} snapshot.timestamp - 快照时间戳
   * @param {Object} snapshot.data - 序列化的 Blackboard 数据
   * @param {Object} snapshot.metadata - 元数据
   * @returns {Promise<boolean>} 是否更新成功
   */
  updateBlackboardSnapshot: async function (invocationId, snapshot) {
    if (!invocationId) return false;
    try {
      await prisma.workspace_agent_invocations.update({
        where: { id: parseInt(invocationId) },
        data: {
          blackboard_snapshot: JSON.stringify(snapshot),
          blackboard_updated_at: new Date(),
        },
      });
      return true;
    } catch (error) {
      // 如果字段不存在（schema 未更新），静默失败
      if (error.code === "P2025" || error.message.includes("Unknown field")) {
        console.warn(
          "[WorkspaceAgentInvocation] Blackboard snapshot field not found in schema. " +
            "Run migration to add blackboard_snapshot column."
        );
        return false;
      }
      console.error(
        "[WorkspaceAgentInvocation] updateBlackboardSnapshot failed:",
        error.message
      );
      return false;
    }
  },

  /**
   * 获取 Blackboard 快照（用于恢复）
   * @param {number} invocationId - Invocation ID
   * @returns {Promise<Object|null>} Blackboard 快照数据
   */
  getBlackboardSnapshot: async function (invocationId) {
    if (!invocationId) return null;
    try {
      const invocation = await prisma.workspace_agent_invocations.findUnique({
        where: { id: parseInt(invocationId) },
        select: {
          blackboard_snapshot: true,
          blackboard_updated_at: true,
        },
      });

      if (!invocation?.blackboard_snapshot) return null;

      const snapshot =
        typeof invocation.blackboard_snapshot === "string"
          ? JSON.parse(invocation.blackboard_snapshot)
          : invocation.blackboard_snapshot;

      return {
        ...snapshot,
        retrievedAt: new Date().toISOString(),
        originalUpdatedAt: invocation.blackboard_updated_at,
      };
    } catch (error) {
      // 如果字段不存在（schema 未更新），静默失败
      if (error.message.includes("Unknown field")) {
        console.warn(
          "[WorkspaceAgentInvocation] Blackboard snapshot field not found in schema."
        );
        return null;
      }
      console.error(
        "[WorkspaceAgentInvocation] getBlackboardSnapshot failed:",
        error.message
      );
      return null;
    }
  },

  /**
   * 获取协作统计数据（用于图谱展示）
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {Date} params.startDate - 统计起始时间
   * @returns {Promise<Object>} 协作统计
   */
  getCollaborationStats: async function ({ workspaceId, startDate }) {
    try {
      // 1. 获取所有有 assistant_id 的调用
      const invocations = await prisma.workspace_agent_invocations.findMany({
        where: {
          workspace_id: workspaceId,
          assistant_id: { not: null },
          createdAt: { gte: startDate },
        },
        select: {
          id: true,
          assistant_id: true,
          thread_id: true,
          success: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // 2. 统计每个助手的调用情况
      const assistantStats = {};
      invocations.forEach((inv) => {
        const aid = inv.assistant_id;
        if (!assistantStats[aid]) {
          assistantStats[aid] = {
            totalInvocations: 0,
            successCount: 0,
            lastUsedAt: null,
          };
        }
        assistantStats[aid].totalInvocations++;
        if (inv.success === true) {
          assistantStats[aid].successCount++;
        }
        if (
          !assistantStats[aid].lastUsedAt ||
          inv.createdAt > assistantStats[aid].lastUsedAt
        ) {
          assistantStats[aid].lastUsedAt = inv.createdAt;
        }
      });

      // 3. 计算共用会话（同一 thread_id 中不同 assistant 的调用）
      const threadAssistantMap = new Map(); // thread_id -> Set<assistant_id>
      const threadLastTime = new Map(); // thread_id -> lastTime

      invocations.forEach((inv) => {
        if (!inv.thread_id) return; // 跳过没有 thread 的调用

        if (!threadAssistantMap.has(inv.thread_id)) {
          threadAssistantMap.set(inv.thread_id, new Set());
          threadLastTime.set(inv.thread_id, inv.createdAt);
        }
        threadAssistantMap.get(inv.thread_id).add(inv.assistant_id);

        // 更新最后时间
        if (inv.createdAt > threadLastTime.get(inv.thread_id)) {
          threadLastTime.set(inv.thread_id, inv.createdAt);
        }
      });

      // 4. 生成协作边
      const collaborationMap = new Map(); // "aid1:aid2" -> { count, threads, lastTime }

      threadAssistantMap.forEach((assistantSet, threadId) => {
        const assistants = Array.from(assistantSet);
        if (assistants.length < 2) return; // 需要至少2个助手才算协作

        // 生成所有助手对的组合
        for (let i = 0; i < assistants.length; i++) {
          for (let j = i + 1; j < assistants.length; j++) {
            const [a1, a2] = [assistants[i], assistants[j]].sort();
            const key = `${a1}:${a2}`;

            if (!collaborationMap.has(key)) {
              collaborationMap.set(key, {
                assistant1: a1,
                assistant2: a2,
                sharedThreads: 0,
                coOccurrenceCount: 0,
                lastCoOccurrence: null,
              });
            }

            const collab = collaborationMap.get(key);
            collab.sharedThreads++;
            collab.coOccurrenceCount++;

            const threadTime = threadLastTime.get(threadId);
            if (
              !collab.lastCoOccurrence ||
              threadTime > collab.lastCoOccurrence
            ) {
              collab.lastCoOccurrence = threadTime;
            }
          }
        }
      });

      const collaborations = Array.from(collaborationMap.values());

      return {
        assistantStats,
        collaborations,
      };
    } catch (error) {
      console.error(
        "[WorkspaceAgentInvocation] getCollaborationStats failed:",
        error.message
      );
      return { assistantStats: {}, collaborations: [] };
    }
  },
};

module.exports = { WorkspaceAgentInvocation };
