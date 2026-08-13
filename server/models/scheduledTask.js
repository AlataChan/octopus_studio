/**
 * @fileoverview 定时任务数据模型
 * 管理用户级定时任务的 CRUD 操作
 */

const prisma = require("../utils/prisma");
const cron = require("node-cron");

const ScheduledTask = {
  /**
   * 创建定时任务
   * @param {Object} data - 任务数据
   * @returns {Promise<Object>}
   */
  async create(data) {
    // 验证 cron 表达式
    if (data.scheduleType === "cron" && data.cronExpression) {
      if (!cron.validate(data.cronExpression)) {
        throw new Error(`无效的 cron 表达式: ${data.cronExpression}`);
      }
    }

    // 计算下次执行时间
    const nextRunAt = this._calculateNextRunAt(data);

    const task = await prisma.scheduled_tasks.create({
      data: {
        ...data,
        actionConfig:
          typeof data.actionConfig === "string"
            ? data.actionConfig
            : JSON.stringify(data.actionConfig),
        nextRunAt,
      },
    });

    return this._formatTask(task);
  },

  /**
   * 获取任务详情
   * @param {string} id - 任务 ID
   * @returns {Promise<Object|null>}
   */
  async get(id) {
    const task = await prisma.scheduled_tasks.findUnique({
      where: { id },
      include: { workspace: true },
    });
    return task ? this._formatTask(task) : null;
  },

  /**
   * 获取 Workspace 的所有任务
   * @param {number} workspaceId - Workspace ID
   * @param {Object} options - 过滤选项
   * @returns {Promise<Object[]>}
   */
  async getByWorkspace(workspaceId, options = {}) {
    const { enabledOnly = false, limit = 50 } = options;

    const tasks = await prisma.scheduled_tasks.findMany({
      where: {
        workspaceId,
        ...(enabledOnly ? { enabled: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return tasks.map(this._formatTask);
  },

  /**
   * 获取所有启用的任务（用于调度器加载）
   * @returns {Promise<Object[]>}
   */
  async getAllEnabled() {
    const tasks = await prisma.scheduled_tasks.findMany({
      where: {
        enabled: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { workspace: true },
    });
    return tasks.map(this._formatTask);
  },

  /**
   * 更新任务
   * @param {string} id - 任务 ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>}
   */
  async update(id, data) {
    // 如果更新了调度配置，重新计算下次执行时间
    let nextRunAt = undefined;
    if (data.scheduleType || data.cronExpression || data.executeAt) {
      const existing = await this.get(id);
      nextRunAt = this._calculateNextRunAt({ ...existing, ...data });
    }

    const task = await prisma.scheduled_tasks.update({
      where: { id },
      data: {
        ...data,
        ...(data.actionConfig && typeof data.actionConfig !== "string"
          ? { actionConfig: JSON.stringify(data.actionConfig) }
          : {}),
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });

    return this._formatTask(task);
  },

  /**
   * 删除任务
   * @param {string} id - 任务 ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    await prisma.scheduled_tasks.delete({ where: { id } });
    return true;
  },

  /**
   * 记录执行结果
   * @param {string} taskId - 任务 ID
   * @param {Object} result - 执行结果
   * @returns {Promise<void>}
   */
  async logExecution(taskId, result) {
    const { status, output, error, reason, startedAt, finishedAt } = result;
    const durationMs =
      finishedAt && startedAt
        ? finishedAt.getTime() - startedAt.getTime()
        : null;
    const outputWithReason = reason
      ? {
          ...(output && typeof output === "object" ? output : { output }),
          reason,
        }
      : output;

    // 创建执行日志
    await prisma.scheduled_task_logs.create({
      data: {
        taskId,
        status,
        startedAt: startedAt || new Date(),
        finishedAt,
        durationMs,
        output: outputWithReason ? JSON.stringify(outputWithReason) : null,
        error,
      },
    });

    // 更新任务状态
    const task = await prisma.scheduled_tasks.findUnique({
      where: { id: taskId },
    });
    if (task) {
      const nextRunAt = this._calculateNextRunAt(task);
      await prisma.scheduled_tasks.update({
        where: { id: taskId },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: status,
          lastRunError: error || null,
          runCount: { increment: 1 },
          nextRunAt,
        },
      });
    }
  },

  /**
   * 获取任务执行日志
   * @param {string} taskId - 任务 ID
   * @param {number} limit - 限制条数
   * @returns {Promise<Object[]>}
   */
  async getLogs(taskId, limit = 20) {
    const logs = await prisma.scheduled_task_logs.findMany({
      where: { taskId },
      orderBy: { startedAt: "desc" },
      take: limit,
    });
    return logs.map((log) => ({
      ...log,
      output: log.output ? JSON.parse(log.output) : null,
    }));
  },

  /**
   * 统计 Workspace 的任务数量
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise<Object>}
   */
  async countByWorkspace(workspaceId) {
    const [total, enabled] = await Promise.all([
      prisma.scheduled_tasks.count({ where: { workspaceId } }),
      prisma.scheduled_tasks.count({ where: { workspaceId, enabled: true } }),
    ]);
    return { total, enabled };
  },

  /**
   * 计算下次执行时间
   * @private
   */
  _calculateNextRunAt(task) {
    if (task.scheduleType === "once") {
      return task.executeAt;
    }
    if (task.scheduleType === "cron" && task.cronExpression) {
      // 简单计算：返回当前时间（实际执行时由 node-cron 处理）
      return new Date();
    }
    if (task.scheduleType === "interval" && task.intervalMinutes) {
      return new Date(Date.now() + task.intervalMinutes * 60 * 1000);
    }
    return null;
  },

  /**
   * 格式化任务对象
   * @private
   */
  _formatTask(task) {
    return {
      ...task,
      actionConfig:
        typeof task.actionConfig === "string"
          ? JSON.parse(task.actionConfig)
          : task.actionConfig,
    };
  },
};

module.exports = { ScheduledTask };
