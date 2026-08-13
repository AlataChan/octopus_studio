/**
 * @fileoverview Workspace 定时任务 API
 * 管理用户级定时任务的创建、查看、更新、删除
 */

const { ScheduledTask } = require("../models/scheduledTask");
const { Workspace } = require("../models/workspace");
const { userScheduler } = require("../utils/scheduler/userTaskScheduler");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { flexUserRoleValid } = require("../utils/middleware/multiUserProtected");

/**
 * 注册定时任务相关路由
 * @param {Express.Application} app - Express 应用实例
 */
function workspaceScheduledTasksEndpoints(app) {
  if (!app) return;

  // 获取 Workspace 的所有定时任务
  app.get(
    "/workspace/:slug/scheduled-tasks",
    [validatedRequest, flexUserRoleValid(["admin", "manager"])],
    async (req, res) => {
      try {
        const { slug } = req.params;
        const workspace = await Workspace.get({ slug });

        if (!workspace) {
          return res
            .status(404)
            .json({ success: false, error: "Workspace 不存在" });
        }

        const tasks = await ScheduledTask.getByWorkspace(workspace.id);
        const stats = await ScheduledTask.countByWorkspace(workspace.id);

        // 为每个任务添加 AI 员工信息
        const { WorkspaceAssistant } = require("../models/workspaceAssistant");
        const tasksWithAssistant = await Promise.all(
          tasks.map(async (task) => {
            if (task.assistantId) {
              try {
                const assistant = await WorkspaceAssistant.get(
                  task.assistantId
                );
                return {
                  ...task,
                  assistantName:
                    assistant?.instanceName ||
                    assistant?.template?.name ||
                    null,
                };
              } catch {
                return { ...task, assistantName: null };
              }
            }
            return { ...task, assistantName: null };
          })
        );

        return res.json({
          success: true,
          data: { tasks: tasksWithAssistant, stats },
        });
      } catch (error) {
        console.error("[ScheduledTasks] 获取任务列表失败:", error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // 创建定时任务
  app.post(
    "/workspace/:slug/scheduled-tasks",
    [validatedRequest, flexUserRoleValid(["admin", "manager"])],
    async (req, res) => {
      try {
        const { slug } = req.params;
        const workspace = await Workspace.get({ slug });

        if (!workspace) {
          return res
            .status(404)
            .json({ success: false, error: "Workspace 不存在" });
        }

        // 检查任务数量限制（每个 Workspace 最多 50 个）
        const stats = await ScheduledTask.countByWorkspace(workspace.id);
        if (stats.total >= 50) {
          return res.status(400).json({
            success: false,
            error: "已达到任务数量上限（50个）",
          });
        }

        const {
          name,
          description,
          scheduleType,
          cronExpression,
          executeAt,
          intervalMinutes,
          timezone,
          actionType,
          actionConfig,
          maxRuns,
          expiresAt,
          assistantId, // 执行任务的 AI 员工 ID
        } = req.body;

        // 验证必填字段
        if (!name || !scheduleType || !actionType || !actionConfig) {
          return res.status(400).json({
            success: false,
            error: "缺少必填字段: name, scheduleType, actionType, actionConfig",
          });
        }

        // 验证 AI 员工
        if (!assistantId) {
          return res.status(400).json({
            success: false,
            error: "缺少必填字段: assistantId（执行任务的 AI 员工）",
          });
        }

        // 验证调度类型
        if (!["cron", "once", "interval"].includes(scheduleType)) {
          return res.status(400).json({
            success: false,
            error: "无效的 scheduleType，可选值: cron, once, interval",
          });
        }

        // 验证动作类型
        if (!["send_message", "agent_flow", "webhook"].includes(actionType)) {
          return res.status(400).json({
            success: false,
            error:
              "无效的 actionType，可选值: send_message, agent_flow, webhook",
          });
        }

        const task = await ScheduledTask.create({
          workspaceId: workspace.id,
          createdByUserId: req.user?.id || null,
          assistantId, // AI 员工 ID
          name,
          description,
          scheduleType,
          cronExpression,
          executeAt: executeAt ? new Date(executeAt) : null,
          intervalMinutes,
          timezone: timezone || "Asia/Shanghai",
          actionType,
          actionConfig,
          maxRuns,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        });

        // 注册到调度器
        if (task.enabled) {
          userScheduler.registerTask(task);
        }

        return res.json({ success: true, data: task });
      } catch (error) {
        console.error("[ScheduledTasks] 创建任务失败:", error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // 获取任务详情
  app.get(
    "/workspace/:slug/scheduled-tasks/:taskId",
    [validatedRequest, flexUserRoleValid(["admin", "manager"])],
    async (req, res) => {
      try {
        const { taskId } = req.params;
        const task = await ScheduledTask.get(taskId);

        if (!task) {
          return res.status(404).json({ success: false, error: "任务不存在" });
        }

        const logs = await ScheduledTask.getLogs(taskId, 10);
        return res.json({ success: true, data: { task, logs } });
      } catch (error) {
        console.error("[ScheduledTasks] 获取任务详情失败:", error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // 更新任务
  app.patch(
    "/workspace/:slug/scheduled-tasks/:taskId",
    [validatedRequest, flexUserRoleValid(["admin", "manager"])],
    async (req, res) => {
      try {
        const { taskId } = req.params;
        const existing = await ScheduledTask.get(taskId);

        if (!existing) {
          return res.status(404).json({ success: false, error: "任务不存在" });
        }

        const task = await ScheduledTask.update(taskId, req.body);

        // 更新调度器中的任务
        userScheduler.unregisterTask(taskId);
        if (task.enabled) {
          userScheduler.registerTask(task);
        }

        return res.json({ success: true, data: task });
      } catch (error) {
        console.error("[ScheduledTasks] 更新任务失败:", error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // 删除任务
  app.delete(
    "/workspace/:slug/scheduled-tasks/:taskId",
    [validatedRequest, flexUserRoleValid(["admin", "manager"])],
    async (req, res) => {
      try {
        const { taskId } = req.params;

        // 从调度器移除
        userScheduler.unregisterTask(taskId);

        // 从数据库删除
        await ScheduledTask.delete(taskId);

        return res.json({ success: true, message: "任务已删除" });
      } catch (error) {
        console.error("[ScheduledTasks] 删除任务失败:", error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // 立即执行任务（测试用）
  app.post(
    "/workspace/:slug/scheduled-tasks/:taskId/run",
    [validatedRequest, flexUserRoleValid(["admin", "manager"])],
    async (req, res) => {
      try {
        const { taskId } = req.params;
        const task = await ScheduledTask.get(taskId);

        if (!task) {
          return res.status(404).json({ success: false, error: "任务不存在" });
        }

        // 立即执行
        const result = await userScheduler.executeTaskNow(task);
        return res.json({ success: true, data: result });
      } catch (error) {
        console.error("[ScheduledTasks] 执行任务失败:", error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // 获取任务执行日志
  app.get(
    "/workspace/:slug/scheduled-tasks/:taskId/logs",
    [validatedRequest, flexUserRoleValid(["admin", "manager"])],
    async (req, res) => {
      try {
        const { taskId } = req.params;
        const limit = parseInt(req.query.limit) || 20;

        const logs = await ScheduledTask.getLogs(taskId, limit);
        return res.json({ success: true, data: logs });
      } catch (error) {
        console.error("[ScheduledTasks] 获取日志失败:", error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  );
}

module.exports = { workspaceScheduledTasksEndpoints };
