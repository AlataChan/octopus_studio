/**
 * @fileoverview 文档审核任务数据模型
 * 管理文档审核任务的 CRUD 操作、队列管理、重试机制
 */

const prisma = require("../utils/prisma");
const {
  isRetryableError,
  getNextRetryTime,
} = require("../utils/errors/retryableErrors");
const { TASK_STATUS } = require("../utils/constants/reviewSteps");

const DocumentReviewTask = {
  /**
   * 创建审核任务
   * @param {Object} data - 任务数据
   * @returns {Promise<Object>}
   */
  async create(data) {
    const task = await prisma.document_review_tasks.create({
      data: {
        ...data,
        options: data.options ? JSON.stringify(data.options) : null,
        status: TASK_STATUS.PENDING,
      },
    });
    return this._formatTask(task);
  },

  /**
   * 批量创建任务
   * @param {Object[]} tasks - 任务数组
   * @returns {Promise<{ count: number }>}
   */
  async createBatch(tasks) {
    return await prisma.document_review_tasks.createMany({
      data: tasks.map((task) => ({
        ...task,
        options: task.options ? JSON.stringify(task.options) : null,
        status: TASK_STATUS.PENDING,
      })),
    });
  },

  /**
   * 智能创建任务（带去重检查）
   * @param {Object} data - 任务数据
   * @returns {Promise<{ task: Object, isDuplicate: boolean, message: string }>}
   */
  async createSmart(data) {
    const { workspaceId, inputPath, fileMtime, fileHash } = data;

    // 检查是否有正在处理的任务
    const existingTask = await this.checkDuplicate(workspaceId, inputPath);

    if (existingTask) {
      // 如果文件未修改，返回现有任务
      const sameFile =
        (fileMtime && existingTask.fileMtime === fileMtime) ||
        (fileHash && existingTask.fileHash === fileHash);

      if (sameFile) {
        return {
          task: this._formatTask(existingTask),
          isDuplicate: true,
          message: "该文件已在审核队列中",
        };
      }
    }

    // 查询最新版本号
    const latestTask = await this.getLatestByPath(workspaceId, inputPath);
    const version = latestTask ? latestTask.version + 1 : 1;

    const task = await this.create({ ...data, version });
    return {
      task,
      isDuplicate: false,
      message:
        version > 1 ? `创建新版本审核任务 (v${version})` : "创建审核任务",
    };
  },

  /**
   * 检查重复任务
   * @param {number} workspaceId
   * @param {string} inputPath
   * @returns {Promise<Object|null>}
   */
  async checkDuplicate(workspaceId, inputPath) {
    return await prisma.document_review_tasks.findFirst({
      where: {
        workspaceId,
        inputPath,
        status: { in: [TASK_STATUS.PENDING, TASK_STATUS.PROCESSING] },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * 原子化领取下一个待处理任务（防止并发竞争）
   * @param {number} workspaceId
   * @returns {Promise<Object|null>}
   */
  async claimNextTask(workspaceId) {
    return await prisma.$transaction(async (tx) => {
      // 查找待处理任务
      const pendingTask = await tx.document_review_tasks.findFirst({
        where: {
          workspaceId,
          status: TASK_STATUS.PENDING,
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      });

      if (!pendingTask) return null;

      // 原子化更新状态（使用条件更新防止竞争）
      const result = await tx.document_review_tasks.updateMany({
        where: {
          id: pendingTask.id,
          status: TASK_STATUS.PENDING,
        },
        data: {
          status: TASK_STATUS.PROCESSING,
          startedAt: new Date(),
        },
      });

      // 如果更新失败（被其他进程抢走），返回 null
      if (result.count === 0) return null;

      // 返回更新后的任务
      const updatedTask = await tx.document_review_tasks.findUnique({
        where: { id: pendingTask.id },
      });

      return this._formatTask(updatedTask);
    });
  },

  /**
   * 获取待处理任务列表
   * @param {number} workspaceId
   * @param {number} limit
   * @returns {Promise<Object[]>}
   */
  async getPendingTasks(workspaceId, limit = 10) {
    const tasks = await prisma.document_review_tasks.findMany({
      where: {
        workspaceId,
        status: TASK_STATUS.PENDING,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: limit,
    });
    return tasks.map(this._formatTask);
  },

  /**
   * 更新任务状态
   * @param {string} taskId
   * @param {string} status
   * @param {Object} data - 附加数据
   * @returns {Promise<Object>}
   */
  async updateStatus(taskId, status, data = {}) {
    const updateData = { status, ...data };

    // 自动设置时间戳
    if (status === TASK_STATUS.PROCESSING && !data.startedAt) {
      updateData.startedAt = new Date();
    }
    if (
      [TASK_STATUS.COMPLETED, TASK_STATUS.FAILED].includes(status) &&
      !data.completedAt
    ) {
      updateData.completedAt = new Date();
    }

    // JSON 字段处理
    if (data.result && typeof data.result === "object") {
      updateData.result = JSON.stringify(data.result);
    }
    if (data.options && typeof data.options === "object") {
      updateData.options = JSON.stringify(data.options);
    }

    const task = await prisma.document_review_tasks.update({
      where: { id: taskId },
      data: updateData,
    });

    return this._formatTask(task);
  },

  /**
   * 处理任务失败，判断是否需要重试
   * @param {string} taskId
   * @param {Error|object} error
   * @returns {Promise<{ retrying: boolean, nextRetryAt?: Date, retryCount?: number, finalError?: string }>}
   */
  async markFailed(taskId, error) {
    const task = await this.get(taskId);
    if (!task) return { retrying: false, finalError: "Task not found" };

    const { retryCount, maxRetries } = task;
    const errorMessage = error.message || String(error);

    // 判断是否可以重试
    if (isRetryableError(error) && retryCount < maxRetries) {
      const nextRetryAt = getNextRetryTime(retryCount);

      await prisma.document_review_tasks.update({
        where: { id: taskId },
        data: {
          status: TASK_STATUS.PENDING,
          retryCount: retryCount + 1,
          nextRetryAt,
          lastError: errorMessage,
        },
      });

      return {
        retrying: true,
        nextRetryAt,
        retryCount: retryCount + 1,
      };
    }

    // 标记为最终失败
    await prisma.document_review_tasks.update({
      where: { id: taskId },
      data: {
        status: TASK_STATUS.FAILED,
        error: errorMessage,
        lastError: errorMessage,
        completedAt: new Date(),
      },
    });

    return { retrying: false, finalError: errorMessage };
  },

  /**
   * 获取任务详情
   * @param {string} taskId
   * @returns {Promise<Object|null>}
   */
  async get(taskId) {
    const task = await prisma.document_review_tasks.findUnique({
      where: { id: taskId },
      include: { workspace: true },
    });
    return task ? this._formatTask(task) : null;
  },

  /**
   * 获取指定文件路径的最新审核任务
   * @param {number} workspaceId
   * @param {string} inputPath
   * @returns {Promise<Object|null>}
   */
  async getLatestByPath(workspaceId, inputPath) {
    const task = await prisma.document_review_tasks.findFirst({
      where: { workspaceId, inputPath },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    return task ? this._formatTask(task) : null;
  },

  /**
   * 根据知识库文档 ID 查找审核任务
   * @param {string} documentId - 知识库文档 ID（docId）
   * @param {number} workspaceId
   * @returns {Promise<Object|null>}
   */
  async findByDocumentId(documentId, workspaceId) {
    const task = await prisma.document_review_tasks.findFirst({
      where: {
        documentId,
        workspaceId,
        status: { in: [TASK_STATUS.PENDING, TASK_STATUS.PROCESSING] },
      },
      orderBy: { createdAt: "desc" },
    });
    return task ? this._formatTask(task) : null;
  },

  /**
   * 获取统计信息
   * @param {number} workspaceId
   * @returns {Promise<Object>}
   */
  async getStats(workspaceId) {
    const [pending, processing, completed, failed] = await Promise.all([
      prisma.document_review_tasks.count({
        where: { workspaceId, status: TASK_STATUS.PENDING },
      }),
      prisma.document_review_tasks.count({
        where: { workspaceId, status: TASK_STATUS.PROCESSING },
      }),
      prisma.document_review_tasks.count({
        where: { workspaceId, status: TASK_STATUS.COMPLETED },
      }),
      prisma.document_review_tasks.count({
        where: { workspaceId, status: TASK_STATUS.FAILED },
      }),
    ]);

    return {
      pending,
      processing,
      completed,
      failed,
      total: pending + processing + completed + failed,
    };
  },

  /**
   * 删除任务
   * @param {string} taskId
   * @returns {Promise<Object>}
   */
  async delete(taskId) {
    const task = await prisma.document_review_tasks.delete({
      where: { id: taskId },
    });
    return this._formatTask(task);
  },

  /**
   * 清理过期任务
   * @param {number} workspaceId
   * @param {number} daysOld - 多少天前的任务
   * @returns {Promise<{ count: number }>}
   */
  async cleanupOldTasks(workspaceId, daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return await prisma.document_review_tasks.deleteMany({
      where: {
        workspaceId,
        status: { in: [TASK_STATUS.COMPLETED, TASK_STATUS.FAILED] },
        completedAt: { lt: cutoffDate },
      },
    });
  },

  /**
   * 格式化任务对象（解析 JSON 字段）
   * @param {Object} task
   * @returns {Object}
   */
  _formatTask(task) {
    if (!task) return null;

    return {
      ...task,
      options: task.options ? JSON.parse(task.options) : {},
      result: task.result ? JSON.parse(task.result) : null,
      // BigInt 转换为 Number
      fileMtime: task.fileMtime ? Number(task.fileMtime) : null,
    };
  },
};

module.exports = { DocumentReviewTask };
