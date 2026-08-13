const prisma = require("../utils/prisma");

/**
 * 通知类型枚举
 */
const NOTIFICATION_TYPES = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  BILLING_ALERT: "billing_alert", // 余额不足告警
  BUDGET_ALERT: "budget_alert", // 预算超限告警
  SYSTEM: "system", // 系统通知
};

/**
 * 通知模型 - 站内信管理
 */
const Notification = {
  TYPES: NOTIFICATION_TYPES,

  /**
   * 创建通知
   * @param {Object} data - 通知数据
   * @returns {Promise<Object>}
   */
  create: async function ({
    userId,
    type = "info",
    title,
    content,
    metadata = null,
  }) {
    try {
      const notification = await prisma.notifications.create({
        data: {
          userId,
          type,
          title,
          content,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });
      return { notification, error: null };
    } catch (error) {
      console.error("[Notification] Create failed:", error.message);
      return { notification: null, error: error.message };
    }
  },

  /**
   * 批量创建通知（给多个用户发送相同通知）
   * @param {number[]} userIds - 用户 ID 数组
   * @param {Object} data - 通知数据
   * @returns {Promise<Object>}
   */
  createMany: async function (
    userIds,
    { type = "info", title, content, metadata = null }
  ) {
    try {
      const notifications = await prisma.notifications.createMany({
        data: userIds.map((userId) => ({
          userId,
          type,
          title,
          content,
          metadata: metadata ? JSON.stringify(metadata) : null,
        })),
      });
      return { count: notifications.count, error: null };
    } catch (error) {
      console.error("[Notification] CreateMany failed:", error.message);
      return { count: 0, error: error.message };
    }
  },

  /**
   * 获取用户通知列表
   * @param {number} userId - 用户 ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>}
   */
  getByUser: async function (
    userId,
    { page = 1, limit = 20, unreadOnly = false } = {}
  ) {
    try {
      const where = { userId };
      if (unreadOnly) where.isRead = false;

      const [notifications, total] = await Promise.all([
        prisma.notifications.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.notifications.count({ where }),
      ]);

      return {
        notifications: notifications.map((n) => ({
          ...n,
          metadata: n.metadata ? JSON.parse(n.metadata) : null,
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
        error: null,
      };
    } catch (error) {
      console.error("[Notification] GetByUser failed:", error.message);
      return { notifications: [], total: 0, error: error.message };
    }
  },

  /**
   * 获取未读通知数量
   * @param {number} userId - 用户 ID
   * @returns {Promise<number>}
   */
  getUnreadCount: async function (userId) {
    try {
      return await prisma.notifications.count({
        where: { userId, isRead: false },
      });
    } catch (error) {
      console.error("[Notification] GetUnreadCount failed:", error.message);
      return 0;
    }
  },

  /**
   * 标记通知为已读
   * @param {number} id - 通知 ID
   * @param {number} userId - 用户 ID (用于权限验证)
   * @returns {Promise<Object>}
   */
  markAsRead: async function (id, userId) {
    try {
      const notification = await prisma.notifications.updateMany({
        where: { id, userId },
        data: { isRead: true },
      });
      return { success: notification.count > 0, error: null };
    } catch (error) {
      console.error("[Notification] MarkAsRead failed:", error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 标记所有通知为已读
   * @param {number} userId - 用户 ID
   * @returns {Promise<Object>}
   */
  markAllAsRead: async function (userId) {
    try {
      const result = await prisma.notifications.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
      return { count: result.count, error: null };
    } catch (error) {
      console.error("[Notification] MarkAllAsRead failed:", error.message);
      return { count: 0, error: error.message };
    }
  },

  /**
   * 删除通知
   * @param {number} id - 通知 ID
   * @param {number} userId - 用户 ID
   * @returns {Promise<Object>}
   */
  delete: async function (id, userId) {
    try {
      const result = await prisma.notifications.deleteMany({
        where: { id, userId },
      });
      return { success: result.count > 0, error: null };
    } catch (error) {
      console.error("[Notification] Delete failed:", error.message);
      return { success: false, error: error.message };
    }
  },
};

module.exports = { Notification };
