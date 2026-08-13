const prisma = require("../utils/prisma");
const { v4: uuidv4 } = require("uuid");
const EventEmitter = require("events");

/**
 * Job 状态枚举
 */
const JobStatus = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

/**
 * Job 类型枚举
 */
const JobType = {
  GENERATE: "generate",
  ANALYZE: "analyze",
  INPAINT: "inpaint",
  OUTPAINT: "outpaint",
  RENDER: "render",
  REMOVE_BG: "remove_bg",
};

/**
 * Job 事件发射器（用于 SSE 推送）
 */
const jobEmitter = new EventEmitter();
jobEmitter.setMaxListeners(100);

/**
 * ImageJob 模型 - 图像任务队列
 *
 * 负责：
 * - 异步任务管理
 * - 状态机控制
 * - 重试机制
 * - 进度追踪
 */
const ImageJob = {
  // 导出常量
  Status: JobStatus,
  Type: JobType,
  emitter: jobEmitter,

  /**
   * 创建任务
   * @param {Object} params
   * @param {number} params.workspaceId
   * @param {string} [params.projectId]
   * @param {number} [params.userId]
   * @param {string} params.type - JobType
   * @param {Object} params.params - 任务参数
   * @param {number} [params.maxRetries=3]
   * @param {number} [params.timeoutMs=300000]
   * @returns {Promise<Object>}
   */
  create: async function ({
    workspaceId,
    projectId = null,
    userId = null,
    type,
    params,
    maxRetries = 3,
    timeoutMs = 300000,
  }) {
    try {
      const job = await prisma.image_jobs.create({
        data: {
          id: uuidv4(),
          workspaceId,
          projectId,
          userId,
          type,
          params: JSON.stringify(params),
          status: JobStatus.PENDING,
          maxRetries,
          timeoutMs,
        },
      });

      // 发出事件
      jobEmitter.emit("job:created", job);

      return { job: this._parseJob(job), error: null };
    } catch (error) {
      console.error("[ImageJob] Create error:", error);
      return { job: null, error: error.message };
    }
  },

  /**
   * 根据 ID 获取任务
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  get: async function (id) {
    try {
      const job = await prisma.image_jobs.findUnique({
        where: { id },
      });
      return job ? this._parseJob(job) : null;
    } catch (error) {
      console.error("[ImageJob] Get error:", error);
      return null;
    }
  },

  /**
   * 根据条件获取任务
   * @param {Object} clause
   * @returns {Promise<Object|null>}
   */
  where: async function (clause = {}) {
    try {
      const job = await prisma.image_jobs.findFirst({
        where: clause,
        orderBy: { createdAt: "desc" },
      });
      return job ? this._parseJob(job) : null;
    } catch (error) {
      console.error("[ImageJob] Where error:", error);
      return null;
    }
  },

  /**
   * 列出任务
   * @param {Object} [options]
   * @param {number} [options.workspaceId]
   * @param {string} [options.projectId]
   * @param {string} [options.status]
   * @param {number} [options.limit=20]
   * @param {number} [options.offset=0]
   * @returns {Promise<Array>}
   */
  list: async function (options = {}) {
    const { workspaceId, projectId, status, limit = 20, offset = 0 } = options;

    try {
      const where = {};
      if (workspaceId) where.workspaceId = workspaceId;
      if (projectId) where.projectId = projectId;
      if (status) where.status = status;

      const jobs = await prisma.image_jobs.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });

      return jobs.map((job) => this._parseJob(job));
    } catch (error) {
      console.error("[ImageJob] List error:", error);
      return [];
    }
  },

  /**
   * 获取待处理的任务
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  getPending: async function (limit = 10) {
    try {
      const jobs = await prisma.image_jobs.findMany({
        where: { status: JobStatus.PENDING },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      return jobs.map((job) => this._parseJob(job));
    } catch (error) {
      console.error("[ImageJob] GetPending error:", error);
      return [];
    }
  },

  /**
   * 开始执行任务
   * @param {string} id
   * @returns {Promise<Object>}
   */
  start: async function (id) {
    try {
      const job = await prisma.image_jobs.update({
        where: { id },
        data: {
          status: JobStatus.RUNNING,
          startedAt: new Date(),
        },
      });

      const parsed = this._parseJob(job);
      jobEmitter.emit("job:started", parsed);
      jobEmitter.emit(`job:${id}:update`, { status: JobStatus.RUNNING });

      return { job: parsed, error: null };
    } catch (error) {
      console.error("[ImageJob] Start error:", error);
      return { job: null, error: error.message };
    }
  },

  /**
   * 更新任务进度
   * @param {string} id
   * @param {number} progress - 0-100
   * @returns {Promise<Object>}
   */
  updateProgress: async function (id, progress) {
    try {
      const job = await prisma.image_jobs.update({
        where: { id },
        data: { progress },
      });

      const parsed = this._parseJob(job);
      jobEmitter.emit(`job:${id}:progress`, { progress });

      return { job: parsed, error: null };
    } catch (error) {
      console.error("[ImageJob] UpdateProgress error:", error);
      return { job: null, error: error.message };
    }
  },

  /**
   * 完成任务
   * @param {string} id
   * @param {Object} result
   * @param {string} result.outputAssetId
   * @param {string} [result.projectId]
   * @param {string} [result.providerUsed]
   * @param {number} [result.actualCost]
   * @returns {Promise<Object>}
   */
  complete: async function (id, result) {
    try {
      const projectPatch =
        result?.projectId && typeof result.projectId === "string"
          ? { projectId: result.projectId }
          : {};

      const job = await prisma.image_jobs.update({
        where: { id },
        data: {
          status: JobStatus.COMPLETED,
          progress: 100,
          outputAssetId: result.outputAssetId,
          ...projectPatch,
          providerUsed: result.providerUsed,
          actualCost: result.actualCost,
          completedAt: new Date(),
        },
      });

      const parsed = this._parseJob(job);
      jobEmitter.emit("job:completed", parsed);
      jobEmitter.emit(`job:${id}:complete`, {
        status: JobStatus.COMPLETED,
        outputAssetId: result.outputAssetId,
      });

      return { job: parsed, error: null };
    } catch (error) {
      console.error("[ImageJob] Complete error:", error);
      return { job: null, error: error.message };
    }
  },

  /**
   * 任务失败
   * @param {string} id
   * @param {Object} error
   * @param {string} error.code
   * @param {string} error.message
   * @param {boolean} [error.retryable=true]
   * @returns {Promise<Object>}
   */
  fail: async function (id, error) {
    try {
      const currentJob = await this.get(id);
      if (!currentJob) throw new Error("Job not found");

      const shouldRetry =
        error.retryable !== false &&
        currentJob.retryCount < currentJob.maxRetries;

      const newStatus = shouldRetry ? JobStatus.PENDING : JobStatus.FAILED;

      const job = await prisma.image_jobs.update({
        where: { id },
        data: {
          status: newStatus,
          error: JSON.stringify(error),
          retryCount: shouldRetry
            ? currentJob.retryCount + 1
            : currentJob.retryCount,
          completedAt: shouldRetry ? null : new Date(),
        },
      });

      const parsed = this._parseJob(job);

      if (shouldRetry) {
        jobEmitter.emit("job:retry", parsed);
        jobEmitter.emit(`job:${id}:retry`, {
          retryCount: parsed.retryCount,
          maxRetries: parsed.maxRetries,
        });
      } else {
        jobEmitter.emit("job:failed", parsed);
        jobEmitter.emit(`job:${id}:error`, {
          status: JobStatus.FAILED,
          error: error,
        });
      }

      return { job: parsed, error: null };
    } catch (err) {
      console.error("[ImageJob] Fail error:", err);
      return { job: null, error: err.message };
    }
  },

  /**
   * 取消任务
   * @param {string} id
   * @returns {Promise<Object>}
   */
  cancel: async function (id) {
    try {
      const job = await prisma.image_jobs.update({
        where: { id },
        data: {
          status: JobStatus.CANCELLED,
          completedAt: new Date(),
        },
      });

      const parsed = this._parseJob(job);
      jobEmitter.emit("job:cancelled", parsed);
      jobEmitter.emit(`job:${id}:cancel`, { status: JobStatus.CANCELLED });

      return { job: parsed, error: null };
    } catch (error) {
      console.error("[ImageJob] Cancel error:", error);
      return { job: null, error: error.message };
    }
  },

  /**
   * 检查超时任务
   * @returns {Promise<number>}
   */
  checkTimeouts: async function () {
    try {
      const runningJobs = await prisma.image_jobs.findMany({
        where: { status: JobStatus.RUNNING },
      });

      let timedOut = 0;
      const now = Date.now();

      for (const job of runningJobs) {
        if (job.startedAt) {
          const elapsed = now - job.startedAt.getTime();
          if (elapsed > job.timeoutMs) {
            await this.fail(job.id, {
              code: "TIMEOUT",
              message: `Job timed out after ${job.timeoutMs}ms`,
              retryable: true,
            });
            timedOut++;
          }
        }
      }

      return timedOut;
    } catch (error) {
      console.error("[ImageJob] CheckTimeouts error:", error);
      return 0;
    }
  },

  /**
   * 清理旧任务
   * @param {number} completedRetentionDays
   * @param {number} failedRetentionDays
   * @returns {Promise<Object>}
   */
  cleanup: async function (
    completedRetentionDays = 30,
    failedRetentionDays = 7
  ) {
    const stats = { completed: 0, failed: 0 };

    try {
      const completedCutoff = new Date(
        Date.now() - completedRetentionDays * 24 * 60 * 60 * 1000
      );
      const failedCutoff = new Date(
        Date.now() - failedRetentionDays * 24 * 60 * 60 * 1000
      );

      const completedResult = await prisma.image_jobs.deleteMany({
        where: {
          status: JobStatus.COMPLETED,
          completedAt: { lte: completedCutoff },
        },
      });
      stats.completed = completedResult.count;

      const failedResult = await prisma.image_jobs.deleteMany({
        where: {
          status: { in: [JobStatus.FAILED, JobStatus.CANCELLED] },
          completedAt: { lte: failedCutoff },
        },
      });
      stats.failed = failedResult.count;
    } catch (error) {
      console.error("[ImageJob] Cleanup error:", error);
    }

    return stats;
  },

  /**
   * 获取队列统计
   * @param {number} [workspaceId]
   * @returns {Promise<Object>}
   */
  getStats: async function (workspaceId = null) {
    try {
      const where = workspaceId ? { workspaceId } : {};

      const [pending, running, completed, failed, cancelled] =
        await Promise.all([
          prisma.image_jobs.count({
            where: { ...where, status: JobStatus.PENDING },
          }),
          prisma.image_jobs.count({
            where: { ...where, status: JobStatus.RUNNING },
          }),
          prisma.image_jobs.count({
            where: { ...where, status: JobStatus.COMPLETED },
          }),
          prisma.image_jobs.count({
            where: { ...where, status: JobStatus.FAILED },
          }),
          prisma.image_jobs.count({
            where: { ...where, status: JobStatus.CANCELLED },
          }),
        ]);

      return {
        pending,
        running,
        completed,
        failed,
        cancelled,
        total: pending + running + completed + failed + cancelled,
      };
    } catch (error) {
      console.error("[ImageJob] GetStats error:", error);
      return {
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        total: 0,
      };
    }
  },

  /**
   * 解析 Job 的 JSON 字段
   * @private
   * @param {Object} job
   * @returns {Object}
   */
  _parseJob: function (job) {
    if (!job) return null;
    return {
      ...job,
      params: job.params ? JSON.parse(job.params) : {},
      error: job.error ? JSON.parse(job.error) : null,
    };
  },
};

module.exports = { ImageJob, JobStatus, JobType };
