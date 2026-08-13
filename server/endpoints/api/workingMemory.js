/**
 * 工作记忆 API 端点
 *
 * Phase 2: 提供工作记忆的查询和管理接口
 *
 * @module endpoints/api/workingMemory
 */

const { validApiKey } = require("../../utils/middleware/validApiKey");
const { WorkingMemory } = require("../../utils/memory/workingMemory");
const { Workspace } = require("../../models/workspace");
const { WorkspaceThread } = require("../../models/workspaceThread");

/**
 * 工作记忆 API 端点
 * @param {Express} app - Express 应用实例
 */
function workingMemoryEndpoints(app) {
  if (!app) return;

  /**
   * 获取线程的工作记忆
   * GET /api/v1/workspace/:slug/thread/:threadSlug/working-memory
   */
  app.get(
    "/api/v1/workspace/:slug/thread/:threadSlug/working-memory",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug, threadSlug } = request.params;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const thread = await WorkspaceThread.get({
          slug: threadSlug,
          workspace_id: workspace.id,
        });

        if (!thread) {
          return response.status(404).json({
            success: false,
            error: "Thread not found",
          });
        }

        const workingContext = WorkingMemory.getWorkingContext(thread);

        return response.status(200).json({
          success: true,
          data: workingContext,
        });
      } catch (error) {
        console.error("[WorkingMemory API] Error:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * 添加待办任务
   * POST /api/v1/workspace/:slug/thread/:threadSlug/working-memory/tasks
   */
  app.post(
    "/api/v1/workspace/:slug/thread/:threadSlug/working-memory/tasks",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug, threadSlug } = request.params;
        const { task, status = "pending" } = request.body;

        if (!task) {
          return response.status(400).json({
            success: false,
            error: "Task content is required",
          });
        }

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const thread = await WorkspaceThread.get({
          slug: threadSlug,
          workspace_id: workspace.id,
        });

        if (!thread) {
          return response.status(404).json({
            success: false,
            error: "Thread not found",
          });
        }

        await WorkingMemory.addTask(thread.id, { task, status });

        return response.status(201).json({
          success: true,
          message: "Task added successfully",
        });
      } catch (error) {
        console.error("[WorkingMemory API] Error adding task:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * 更新任务状态
   * PATCH /api/v1/workspace/:slug/thread/:threadSlug/working-memory/tasks/:taskId
   */
  app.patch(
    "/api/v1/workspace/:slug/thread/:threadSlug/working-memory/tasks/:taskId",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug, threadSlug, taskId } = request.params;
        const { status } = request.body;

        if (
          !status ||
          !["pending", "in_progress", "completed"].includes(status)
        ) {
          return response.status(400).json({
            success: false,
            error: "Valid status is required (pending/in_progress/completed)",
          });
        }

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response
            .status(404)
            .json({ success: false, error: "Workspace not found" });
        }

        const thread = await WorkspaceThread.get({
          slug: threadSlug,
          workspace_id: workspace.id,
        });

        if (!thread) {
          return response
            .status(404)
            .json({ success: false, error: "Thread not found" });
        }

        await WorkingMemory.updateTaskStatus(thread.id, taskId, status);

        return response.status(200).json({
          success: true,
          message: "Task status updated",
        });
      } catch (error) {
        console.error("[WorkingMemory API] Error updating task:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 添加关键决策
   * POST /api/v1/workspace/:slug/thread/:threadSlug/working-memory/decisions
   */
  app.post(
    "/api/v1/workspace/:slug/thread/:threadSlug/working-memory/decisions",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug, threadSlug } = request.params;
        const { decision, reason } = request.body;

        if (!decision) {
          return response.status(400).json({
            success: false,
            error: "Decision content is required",
          });
        }

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response
            .status(404)
            .json({ success: false, error: "Workspace not found" });
        }

        const thread = await WorkspaceThread.get({
          slug: threadSlug,
          workspace_id: workspace.id,
        });

        if (!thread) {
          return response
            .status(404)
            .json({ success: false, error: "Thread not found" });
        }

        await WorkingMemory.addDecision(thread.id, { decision, reason });

        return response.status(201).json({
          success: true,
          message: "Decision recorded successfully",
        });
      } catch (error) {
        console.error("[WorkingMemory API] Error adding decision:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 更新活跃主题
   * PUT /api/v1/workspace/:slug/thread/:threadSlug/working-memory/topics
   */
  app.put(
    "/api/v1/workspace/:slug/thread/:threadSlug/working-memory/topics",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug, threadSlug } = request.params;
        const { topics } = request.body;

        if (!Array.isArray(topics)) {
          return response.status(400).json({
            success: false,
            error: "Topics must be an array",
          });
        }

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response
            .status(404)
            .json({ success: false, error: "Workspace not found" });
        }

        const thread = await WorkspaceThread.get({
          slug: threadSlug,
          workspace_id: workspace.id,
        });

        if (!thread) {
          return response
            .status(404)
            .json({ success: false, error: "Thread not found" });
        }

        await WorkingMemory.updateTopics(thread.id, topics);

        return response.status(200).json({
          success: true,
          message: "Topics updated successfully",
        });
      } catch (error) {
        console.error("[WorkingMemory API] Error updating topics:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );
}

module.exports = { workingMemoryEndpoints };
