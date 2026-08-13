/**
 * 知识图谱构建器
 * @module utils/graphBuilder/workspaceGraphBuilder
 * @description 负责 Workspace 知识图谱的构建与更新
 */

const fs = require("fs");
const path = require("path");
const prisma = require("../prisma");
const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { Document } = require("../../models/documents");
const { KbClient, buildLlmProfile } = require("../octopusKb/KbClient");
const { kbGraphToModel } = require("../octopusKb/transform");
const { appendAuditEvent } = require("../octopusKb/audit");
const { analyzeWorkspaceGraph } = require("./graphAnalytics");
const {
  getOctopusKbCurationLimits,
  isOctopusKbCurationEnabled,
} = require("../octopusKb/settings");

const curationLocks = new Set();

/**
 * 更新构建任务状态
 * @param {string} taskId - 任务 ID
 * @param {string} status - 状态
 * @param {number} progress - 进度 (0-100)
 * @param {Object} stats - 统计信息
 * @param {string} errorMessage - 错误信息
 */
async function updateTaskStatus(
  taskId,
  status,
  progress,
  stats = null,
  errorMessage = null
) {
  const updateData = {
    status,
    progress,
    updatedAt: new Date(),
  };

  if (stats) {
    updateData.nodeCount = stats.nodeCount || 0;
    updateData.edgeCount = stats.edgeCount || 0;
    updateData.stats = JSON.stringify(stats);
  }

  if (errorMessage) {
    updateData.error = JSON.stringify({
      message: errorMessage,
      timestamp: new Date().toISOString(),
    });
    updateData.retryable = true;
  }

  if (status === "completed" || status === "failed") {
    updateData.finishedAt = new Date();
  }

  // 更新进度消息
  const progressMessages = {
    0: "任务已创建，等待执行",
    10: "正在扫描文档...",
    30: "正在创建文档节点...",
    50: "正在扫描聊天记录...",
    60: "正在创建聊天节点...",
    70: "正在处理 Episode 数据...",
    80: "正在建立节点关联...",
    90: "正在计算统计信息...",
    100: "构建完成",
  };

  updateData.message = progressMessages[progress] || `进度: ${progress}%`;

  await prisma.workspace_graph_builds.update({
    where: { id: taskId },
    data: updateData,
  });
}

/**
 * 知识图谱构建器
 */
const WorkspaceGraphBuilder = {
  /**
   * 异步构建图谱（非阻塞）
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.taskId - 任务 ID
   * @param {string} params.mode - 构建模式 (full/incremental)
   * @param {Object} params.options - 构建选项
   */
  buildAsync: async function ({ workspaceId, taskId, mode, options }) {
    // 使用 setImmediate 确保非阻塞
    setImmediate(async () => {
      await this.build({ workspaceId, taskId, mode, options });
    });
  },

  /**
   * 执行图谱构建
   * @param {Object} params - 同 buildAsync
   */
  build: async function ({ workspaceId, taskId, mode, options }) {
    console.log(
      `[GraphBuild] Starting task ${taskId} for workspace ${workspaceId}`
    );

    try {
      // 1. 更新状态为 running
      await updateTaskStatus(taskId, "running", 10);

      const usedOctopusKb = await this._buildFromOctopusKbIfEnabled({
        workspaceId,
        taskId,
        options,
      });
      if (usedOctopusKb) return;

      // 2. 如果是全量构建，先清空现有数据
      if (mode === "full") {
        await this._clearExistingGraph(workspaceId);
      }

      // 3. 提取文档节点 (进度 10-30%)
      if (options.includeDocs) {
        await this._extractDocumentNodes(workspaceId, taskId);
      }
      await updateTaskStatus(taskId, "running", 30);

      // 4. 提取聊天节点 (进度 30-60%)
      if (options.includeChats) {
        await this._extractChatNodes(workspaceId, taskId);
      }
      await updateTaskStatus(taskId, "running", 60);

      // 5. 处理 Episode 节点 (进度 60-70%)
      if (options.includeEpisodes) {
        await this._processEpisodeNodes(workspaceId, taskId);
      }
      await updateTaskStatus(taskId, "running", 70);

      // 6. 建立节点关联 (进度 70-80%)
      await this._createRelationships(workspaceId, taskId);
      await updateTaskStatus(taskId, "running", 80);

      // 7. 计算相似度边 (进度 80-90%) - 可选
      if (options.computeSimilarity) {
        await this._computeSimilarityEdges(workspaceId, taskId);
      }
      await updateTaskStatus(taskId, "running", 90);

      // 8. 在节点和边完全物化后计算中心性与社区
      await this._computeGraphAnalytics(workspaceId);
      await updateTaskStatus(taskId, "running", 95);

      // 9. 更新统计信息并完成
      const stats = await WorkspaceGraph.getStats(workspaceId);
      await updateTaskStatus(taskId, "completed", 100, stats);

      console.log(
        `[GraphBuild] Task ${taskId} completed. Nodes: ${stats.nodeCount}, Edges: ${stats.edgeCount}`
      );
    } catch (error) {
      console.error(`[GraphBuild] Task ${taskId} failed:`, error);
      await updateTaskStatus(taskId, "failed", 0, null, error.message);
    }
  },

  /**
   * 清空现有图谱数据
   * @private
   */
  _clearExistingGraph: async function (workspaceId) {
    console.log(
      `[GraphBuild] Clearing existing graph for workspace ${workspaceId}`
    );
    await WorkspaceGraph.clearWorkspaceGraph(workspaceId);
  },

  /**
   * 使用 octopus-kb 导出的真实知识图谱替换 Workspace 图谱
   * @private
   */
  _buildFromOctopusKbIfEnabled: async function ({
    workspaceId,
    taskId,
    options,
  }) {
    const kbClient = new KbClient();
    let enabled = false;

    try {
      enabled = await kbClient.enabled();
    } catch (error) {
      console.warn(
        `[GraphBuild] octopus-kb flag check failed, falling back: ${error.message}`
      );
      return false;
    }

    if (!enabled) return false;

    const workspace = await prisma.workspaces.findUnique({
      where: { id: workspaceId },
      select: { slug: true },
    });
    const slug = workspace?.slug || String(workspaceId);

    const curation = await this._curateOctopusKbIfEnabled({
      workspaceId,
      taskId,
      slug,
      kbClient,
      options,
    });
    if (curation?.aborted) {
      const stats = await WorkspaceGraph.getStats(workspaceId);
      await updateTaskStatus(taskId, "completed", 100, stats);
      return true;
    }

    await updateTaskStatus(taskId, "running", 30);
    const kbGraph = await kbClient.exportGraph(slug);
    if (!kbGraph?.nodes?.length) {
      console.warn(
        `[GraphBuild] octopus-kb returned no graph nodes for ${slug}; preserving existing graph`
      );
      const stats = await WorkspaceGraph.getStats(workspaceId);
      await updateTaskStatus(taskId, "completed", 100, stats);
      return true;
    }

    const modelGraph = kbGraphToModel(kbGraph);
    if (!modelGraph.nodes.length) {
      console.warn(
        `[GraphBuild] octopus-kb graph transformed to zero nodes for ${slug}; preserving existing graph`
      );
      const stats = await WorkspaceGraph.getStats(workspaceId);
      await updateTaskStatus(taskId, "completed", 100, stats);
      return true;
    }

    await updateTaskStatus(taskId, "running", 90);
    await WorkspaceGraph.replaceKbProjectionGraph({
      workspaceId,
      nodes: modelGraph.nodes,
      edges: modelGraph.edges,
    });
    await this._computeGraphAnalytics(workspaceId);

    const stats = await WorkspaceGraph.getStats(workspaceId);
    await updateTaskStatus(taskId, "completed", 100, stats);
    console.log(
      `[GraphBuild] octopus-kb import completed. Nodes: ${stats.nodeCount}, Edges: ${stats.edgeCount}`
    );

    return true;
  },

  /**
   * 将 Workspace 文档摄入 octopus-kb raw/，并自动应用安全规则通过的策展提案。
   * @private
   */
  _curateOctopusKbIfEnabled: async function ({
    workspaceId,
    taskId,
    slug,
    kbClient,
    options,
  }) {
    if (options?.includeDocs === false) return { ran: false };
    if (!(await isOctopusKbCurationEnabled())) return { ran: false };

    if (curationLocks.has(workspaceId)) {
      await this._auditCuration({
        workspaceId,
        slug,
        stage: "curation",
        status: "locked",
      });
      return { ran: false, locked: true };
    }

    curationLocks.add(workspaceId);
    try {
      return await this._runOctopusKbCuration({
        workspaceId,
        taskId,
        slug,
        kbClient,
      });
    } finally {
      curationLocks.delete(workspaceId);
    }
  },

  _runOctopusKbCuration: async function ({
    workspaceId,
    taskId,
    slug,
    kbClient,
  }) {
    await updateTaskStatus(taskId, "running", 20);
    const profile = await buildLlmProfile();
    if (!profile) {
      await this._auditCuration({
        workspaceId,
        slug,
        stage: "curation",
        status: "missing_llm_profile",
      });
      return { ran: false, skipped: "missing_llm_profile" };
    }

    const documents = await this._workspaceDocumentsForCuration(workspaceId);
    const limits = await getOctopusKbCurationLimits();
    const totalBytes = documents.reduce((sum, doc) => sum + doc.bytes, 0);
    if (documents.length > limits.maxFiles || totalBytes > limits.maxBytes) {
      await this._auditCuration({
        workspaceId,
        slug,
        stage: "curation",
        status: "cap_exceeded",
        result: {
          documentCount: documents.length,
          totalBytes,
          limits,
        },
      });
      return { ran: true, aborted: true, reason: "cap_exceeded" };
    }

    const vaultRoot = await kbClient.vaultPath(slug);
    for (const document of documents) {
      const ingestResult = await kbClient.ingest(slug, {
        markdown: document.markdown,
        title: document.title,
        tags: [`workspace:${workspaceId}`],
      });
      await this._auditCuration({
        workspaceId,
        slug,
        stage: "ingest",
        status: ingestResult?.path ? "completed" : "failed",
        path: document.docpath,
        result: ingestResult,
      });
      if (!ingestResult?.path) continue;

      const proposal = await kbClient.propose(slug, ingestResult.path, profile);
      await this._auditCuration({
        workspaceId,
        slug,
        stage: "propose",
        status: proposal?.path ? "completed" : "failed",
        path: ingestResult.path,
        result: proposal,
      });
      if (!proposal?.path) continue;

      if (!this._proposalTargetsStayInWiki(vaultRoot, proposal.path)) {
        await this._auditCuration({
          workspaceId,
          slug,
          stage: "validate",
          status: "unsafe_target",
          path: proposal.path,
        });
        continue;
      }

      const validation = await kbClient.validate(slug, proposal.path, {
        apply: true,
        profile,
      });
      await this._auditCuration({
        workspaceId,
        slug,
        stage: "validate",
        status: validation?.status || "failed",
        path: proposal.path,
        result: validation,
      });
      await this._auditCuration({
        workspaceId,
        slug,
        stage: "apply",
        status: validation?.status || "failed",
        path: proposal.path,
        result: validation,
      });
    }

    return { ran: true };
  },

  _workspaceDocumentsForCuration: async function (workspaceId) {
    const documents = await Document.where({ workspaceId });
    const results = [];

    for (const document of documents) {
      try {
        const content = await Document.content(document.docId);
        const markdown = String(content?.content || "");
        if (!markdown.trim()) continue;
        results.push({
          docId: document.docId,
          docpath: document.docpath,
          title: content?.title || document.filename || document.docpath,
          markdown,
          bytes: Buffer.byteLength(markdown, "utf8"),
        });
      } catch (error) {
        await this._auditCuration({
          workspaceId,
          slug: String(workspaceId),
          stage: "ingest",
          status: "content_unavailable",
          path: document.docpath,
          error: error.message,
        });
      }
    }

    return results;
  },

  _proposalTargetsStayInWiki: function (vaultRoot, proposalPath) {
    const proposalFile = path.resolve(vaultRoot, proposalPath);
    if (!proposalFile.startsWith(path.resolve(vaultRoot) + path.sep)) {
      return false;
    }
    if (!fs.existsSync(proposalFile)) return false;

    try {
      const proposal = JSON.parse(fs.readFileSync(proposalFile, "utf8"));
      const targets = [];
      for (const operation of proposal.operations || []) {
        if (operation.path) targets.push(operation.path);
        if (operation.target_page) targets.push(operation.target_page);
      }

      return targets.every((target) => {
        const normalized = path.posix.normalize(String(target));
        return (
          !normalized.startsWith("../") &&
          normalized !== ".." &&
          normalized.startsWith("wiki/") &&
          !path.posix.isAbsolute(normalized)
        );
      });
    } catch {
      return false;
    }
  },

  _auditCuration: async function (event) {
    try {
      await appendAuditEvent(event);
    } catch (error) {
      console.warn("[GraphBuild] octopus-kb audit skipped:", error.message);
    }
  },

  /**
   * 提取文档节点
   * @private
   */
  _extractDocumentNodes: async function (workspaceId, taskId) {
    console.log(
      `[GraphBuild] Extracting document nodes for workspace ${workspaceId}`
    );

    const documents = await Document.where({ workspaceId });
    let processed = 0;

    for (const doc of documents) {
      // 【P0 修复】统一使用 docId 作为节点标识，与 graphBuilder.js 保持一致
      // doc.docId 是业务侧唯一标识（字符串），doc.id 是数据库主键（整数）
      await WorkspaceGraph.upsertNode({
        workspaceId,
        nodeId: `doc_${doc.docId}`,
        type: "doc",
        label: doc.filename || doc.docpath || `Document ${doc.docId}`,
        externalId: doc.docId,
        metadata: {
          docpath: doc.docpath,
          pinned: doc.pinned,
          createdAt: doc.createdAt,
          dbId: doc.id, // 保留数据库主键以便需要时查询
        },
      });

      processed++;
      if (processed % 50 === 0) {
        const progress = Math.min(
          30,
          10 + Math.floor((processed / documents.length) * 20)
        );
        await updateTaskStatus(taskId, "running", progress);
      }
    }

    console.log(`[GraphBuild] Created ${processed} document nodes`);
  },

  /**
   * 提取聊天节点
   * @private
   */
  _extractChatNodes: async function (workspaceId, taskId) {
    console.log(
      `[GraphBuild] Extracting chat nodes for workspace ${workspaceId}`
    );

    // 获取最近的聊天记录（限制数量避免过多）
    const chats = await prisma.workspace_chats.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    let processed = 0;

    for (const chat of chats) {
      // 解析 prompt 获取用户问题摘要
      let label = "Chat Message";
      try {
        const prompt = chat.prompt ? JSON.parse(chat.prompt) : null;
        if (prompt && prompt.content) {
          label =
            prompt.content.substring(0, 50) +
            (prompt.content.length > 50 ? "..." : "");
        }
      } catch {
        // 忽略解析错误
      }

      await WorkspaceGraph.upsertNode({
        workspaceId,
        nodeId: `chat_${chat.id}`,
        type: "chat",
        label,
        externalId: String(chat.id),
        metadata: {
          apiSessionId: chat.api_session_id,
          include: chat.include,
          createdAt: chat.createdAt,
        },
      });

      processed++;
      if (processed % 100 === 0) {
        const progress = Math.min(
          60,
          30 + Math.floor((processed / chats.length) * 30)
        );
        await updateTaskStatus(taskId, "running", progress);
      }
    }

    console.log(`[GraphBuild] Created ${processed} chat nodes`);
  },

  /**
   * 处理 Episode 节点（验证已有 + 创建缺失）
   * @private
   */
  _processEpisodeNodes: async function (workspaceId, _taskId) {
    console.log(
      `[GraphBuild] Processing episode nodes for workspace ${workspaceId}`
    );

    // Episode 节点可能已由 episodeManager 创建，这里只做验证
    const episodeNodes = await prisma.workspace_graph_nodes.count({
      where: { workspaceId, type: "episode" },
    });

    console.log(`[GraphBuild] Found ${episodeNodes} existing episode nodes`);
  },

  /**
   * 创建节点关联（文档引用、标签等）
   * @private
   */
  _createRelationships: async function (workspaceId, _taskId) {
    console.log(
      `[GraphBuild] Creating relationships for workspace ${workspaceId}`
    );

    // 创建助手协作边
    const collaborationResult =
      await WorkspaceGraph.createAssistantCollaborationEdges(workspaceId);
    console.log(
      `[GraphBuild] Created ${collaborationResult.created} collaboration edges`
    );
  },

  /**
   * 计算相似度边（使用结构性相似替代向量相似）
   * @private
   */
  _computeSimilarityEdges: async function (workspaceId, taskId) {
    console.log(
      `[GraphBuild] Computing structural similarity edges for workspace ${workspaceId}`
    );

    try {
      const {
        computeStructuralSimilarityEdges,
      } = require("./structuralSimilarity");

      const stats = await computeStructuralSimilarityEdges(workspaceId, {
        includeTagBased: true,
        includeReferenceBased: true,
        includeAssistantBased: true,
      });

      console.log(
        `[GraphBuild] Created ${stats.total} structural similarity edges`
      );

      if (taskId) {
        await updateTaskStatus(taskId, "running", 88);
      }
    } catch (error) {
      console.warn(
        `[GraphBuild] Error computing similarity edges: ${error.message}`
      );
      // 不抛出错误，相似边计算失败不应阻止整体构建
    }
  },

  /**
   * 对完整 Workspace 图计算 PageRank 和确定性 Louvain 社区，并原子持久化。
   * 分析错误必须向上传播，使构建任务失败而不是留下伪造的占位值。
   * @private
   */
  _computeGraphAnalytics: async function (workspaceId) {
    const [nodes, edges] = await Promise.all([
      prisma.workspace_graph_nodes.findMany({
        where: { workspaceId },
        select: { nodeId: true },
      }),
      prisma.workspace_graph_edges.findMany({
        where: { workspaceId },
        select: { fromNodeId: true, toNodeId: true, weight: true },
      }),
    ]);

    const result = await analyzeWorkspaceGraph({ nodes, edges });
    await WorkspaceGraph.applyAnalytics({
      workspaceId,
      analytics: result.nodes,
    });

    console.log(
      `[GraphBuild] Analytics completed. Nodes: ${result.nodes.size}, PageRank iterations: ${result.pageRank.iterations}, Louvain levels: ${result.louvain.levels}`
    );
    return result;
  },
};

module.exports = { WorkspaceGraphBuilder };
