const prisma = require("../utils/prisma");
const { v4: uuidv4 } = require("uuid");

/**
 * ImageProject 模型 - 图像编辑项目
 *
 * 负责：
 * - 项目生命周期管理
 * - 版本控制
 * - 与 Workspace/Thread 的关联
 */
const ImageProject = {
  /**
   * 创建项目
   * @param {Object} params
   * @param {number} params.workspaceId
   * @param {number} [params.userId]
   * @param {number} [params.threadId]
   * @param {string} [params.title]
   * @param {string} params.sourceType - 'generated' | 'imported'
   * @param {string} [params.sourceProvider]
   * @param {string} [params.sourcePrompt]
   * @returns {Promise<Object>}
   */
  create: async function ({
    workspaceId,
    userId = null,
    threadId = null,
    title = null,
    sourceType,
    sourceProvider = null,
    sourcePrompt = null,
  }) {
    try {
      const project = await prisma.image_projects.create({
        data: {
          id: uuidv4(),
          workspaceId,
          userId,
          threadId,
          title,
          sourceType,
          sourceProvider,
          sourcePrompt,
          status: "active",
        },
      });
      return { project, error: null };
    } catch (error) {
      console.error("[ImageProject] Create error:", error);
      return { project: null, error: error.message };
    }
  },

  /**
   * 根据 ID 获取项目
   * @param {string} id
   * @param {Object} [options]
   * @param {boolean} [options.includeVersions=false]
   * @param {boolean} [options.includeAssets=false]
   * @returns {Promise<Object|null>}
   */
  get: async function (id, options = {}) {
    const { includeVersions = false, includeAssets = false } = options;

    try {
      const project = await prisma.image_projects.findUnique({
        where: { id },
        include: {
          versions: includeVersions
            ? { orderBy: { createdAt: "desc" } }
            : false,
          assets: includeAssets,
        },
      });
      return project;
    } catch (error) {
      console.error("[ImageProject] Get error:", error);
      return null;
    }
  },

  /**
   * 根据条件获取项目
   * @param {Object} clause
   * @returns {Promise<Object|null>}
   */
  where: async function (clause = {}) {
    try {
      const project = await prisma.image_projects.findFirst({
        where: clause,
      });
      return project;
    } catch (error) {
      console.error("[ImageProject] Where error:", error);
      return null;
    }
  },

  /**
   * 列出工作区的项目
   * @param {number} workspaceId
   * @param {Object} [options]
   * @param {number} [options.limit=20]
   * @param {number} [options.offset=0]
   * @param {string} [options.status='active']
   * @param {number} [options.threadId]
   * @param {number} [options.userId]
   * @returns {Promise<Array>}
   */
  list: async function (workspaceId, options = {}) {
    const {
      limit = 20,
      offset = 0,
      status = "active",
      threadId,
      userId,
    } = options;

    try {
      const where = { workspaceId };
      if (status) where.status = status;
      if (threadId) where.threadId = threadId;
      if (userId) where.userId = userId;

      const projects = await prisma.image_projects.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      });
      return projects;
    } catch (error) {
      console.error("[ImageProject] List error:", error);
      return [];
    }
  },

  /**
   * 更新项目
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  update: async function (id, data) {
    try {
      const project = await prisma.image_projects.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });
      return { project, error: null };
    } catch (error) {
      console.error("[ImageProject] Update error:", error);
      return { project: null, error: error.message };
    }
  },

  /**
   * 设置当前版本
   * @param {string} projectId
   * @param {string} versionId
   * @returns {Promise<Object>}
   */
  setCurrentVersion: async function (projectId, versionId) {
    return this.update(projectId, { currentVersionId: versionId });
  },

  /**
   * 归档项目
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  archive: async function (id) {
    try {
      await prisma.image_projects.update({
        where: { id },
        data: { status: "archived", updatedAt: new Date() },
      });
      return true;
    } catch (error) {
      console.error("[ImageProject] Archive error:", error);
      return false;
    }
  },

  /**
   * 删除项目（软删除）
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  delete: async function (id) {
    try {
      await prisma.image_projects.update({
        where: { id },
        data: { status: "deleted", updatedAt: new Date() },
      });
      return true;
    } catch (error) {
      console.error("[ImageProject] Delete error:", error);
      return false;
    }
  },

  /**
   * 硬删除项目（包括所有版本和资产）
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  hardDelete: async function (id) {
    try {
      // 级联删除由 Prisma schema 处理
      await prisma.image_projects.delete({ where: { id } });
      return true;
    } catch (error) {
      console.error("[ImageProject] HardDelete error:", error);
      return false;
    }
  },

  /**
   * 获取项目的当前版本
   * @param {string} projectId
   * @returns {Promise<Object|null>}
   */
  getCurrentVersion: async function (projectId) {
    try {
      const project = await this.get(projectId);
      if (!project?.currentVersionId) return null;

      const version = await prisma.image_project_versions.findUnique({
        where: { id: project.currentVersionId },
      });
      return version;
    } catch (error) {
      console.error("[ImageProject] GetCurrentVersion error:", error);
      return null;
    }
  },

  /**
   * 获取项目的所有版本
   * @param {string} projectId
   * @returns {Promise<Array>}
   */
  getVersions: async function (projectId) {
    try {
      const versions = await prisma.image_project_versions.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      });
      return versions;
    } catch (error) {
      console.error("[ImageProject] GetVersions error:", error);
      return [];
    }
  },

  /**
   * 统计项目数量
   * @param {number} workspaceId
   * @returns {Promise<Object>}
   */
  count: async function (workspaceId) {
    try {
      const [active, archived, total] = await Promise.all([
        prisma.image_projects.count({
          where: { workspaceId, status: "active" },
        }),
        prisma.image_projects.count({
          where: { workspaceId, status: "archived" },
        }),
        prisma.image_projects.count({
          where: { workspaceId, status: { not: "deleted" } },
        }),
      ]);

      return { active, archived, total };
    } catch (error) {
      console.error("[ImageProject] Count error:", error);
      return { active: 0, archived: 0, total: 0 };
    }
  },
};

module.exports = { ImageProject };
