const prisma = require("../utils/prisma");
const { v4: uuidv4 } = require("uuid");

/**
 * ImageProjectVersion 模型 - 图像项目版本
 *
 * 负责：
 * - 版本记录管理
 * - Scene Graph 存储
 * - 版本链追溯
 */
const ImageProjectVersion = {
  /**
   * 创建版本
   * @param {Object} params
   * @param {string} params.projectId
   * @param {string} [params.parentVersionId]
   * @param {string} params.outputAssetId
   * @param {Object} params.sceneGraph - Scene Graph 结构
   * @param {Object} [params.derivedAssets]
   * @param {Object} [params.metrics]
   * @param {string} params.versionType - 'raw' | 'analyzed' | 'edited' | 'exported'
   * @param {string} [params.description]
   * @param {string} [params.jobId]
   * @returns {Promise<Object>}
   */
  create: async function ({
    projectId,
    parentVersionId = null,
    outputAssetId,
    sceneGraph,
    derivedAssets = null,
    metrics = null,
    versionType,
    description = null,
    jobId = null,
  }) {
    try {
      const version = await prisma.image_project_versions.create({
        data: {
          id: uuidv4(),
          projectId,
          parentVersionId,
          outputAssetId,
          sceneGraph: JSON.stringify(sceneGraph),
          derivedAssets: derivedAssets ? JSON.stringify(derivedAssets) : null,
          metrics: metrics ? JSON.stringify(metrics) : null,
          versionType,
          description,
          jobId,
        },
      });
      return { version, error: null };
    } catch (error) {
      console.error("[ImageProjectVersion] Create error:", error);
      return { version: null, error: error.message };
    }
  },

  /**
   * 根据 ID 获取版本
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  get: async function (id) {
    try {
      const version = await prisma.image_project_versions.findUnique({
        where: { id },
      });

      if (version) {
        // 解析 JSON 字段
        version.sceneGraph = JSON.parse(version.sceneGraph || "{}");
        version.derivedAssets = version.derivedAssets
          ? JSON.parse(version.derivedAssets)
          : null;
        version.metrics = version.metrics ? JSON.parse(version.metrics) : null;
      }

      return version;
    } catch (error) {
      console.error("[ImageProjectVersion] Get error:", error);
      return null;
    }
  },

  /**
   * 根据条件获取版本
   * @param {Object} clause
   * @returns {Promise<Object|null>}
   */
  where: async function (clause = {}) {
    try {
      const version = await prisma.image_project_versions.findFirst({
        where: clause,
        orderBy: { createdAt: "desc" },
      });

      if (version) {
        version.sceneGraph = JSON.parse(version.sceneGraph || "{}");
        version.derivedAssets = version.derivedAssets
          ? JSON.parse(version.derivedAssets)
          : null;
        version.metrics = version.metrics ? JSON.parse(version.metrics) : null;
      }

      return version;
    } catch (error) {
      console.error("[ImageProjectVersion] Where error:", error);
      return null;
    }
  },

  /**
   * 列出项目的版本
   * @param {string} projectId
   * @param {Object} [options]
   * @param {number} [options.limit=20]
   * @param {string} [options.versionType]
   * @returns {Promise<Array>}
   */
  list: async function (projectId, options = {}) {
    const { limit = 20, versionType } = options;

    try {
      const where = { projectId };
      if (versionType) where.versionType = versionType;

      const versions = await prisma.image_project_versions.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      // 解析 JSON 字段
      return versions.map((v) => ({
        ...v,
        sceneGraph: JSON.parse(v.sceneGraph || "{}"),
        derivedAssets: v.derivedAssets ? JSON.parse(v.derivedAssets) : null,
        metrics: v.metrics ? JSON.parse(v.metrics) : null,
      }));
    } catch (error) {
      console.error("[ImageProjectVersion] List error:", error);
      return [];
    }
  },

  /**
   * 更新版本
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  update: async function (id, data) {
    try {
      // 序列化 JSON 字段
      if (data.sceneGraph && typeof data.sceneGraph === "object") {
        data.sceneGraph = JSON.stringify(data.sceneGraph);
      }
      if (data.derivedAssets && typeof data.derivedAssets === "object") {
        data.derivedAssets = JSON.stringify(data.derivedAssets);
      }
      if (data.metrics && typeof data.metrics === "object") {
        data.metrics = JSON.stringify(data.metrics);
      }

      const version = await prisma.image_project_versions.update({
        where: { id },
        data,
      });

      // 解析返回的 JSON 字段
      version.sceneGraph = JSON.parse(version.sceneGraph || "{}");
      version.derivedAssets = version.derivedAssets
        ? JSON.parse(version.derivedAssets)
        : null;
      version.metrics = version.metrics ? JSON.parse(version.metrics) : null;

      return { version, error: null };
    } catch (error) {
      console.error("[ImageProjectVersion] Update error:", error);
      return { version: null, error: error.message };
    }
  },

  /**
   * 删除版本
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  delete: async function (id) {
    try {
      await prisma.image_project_versions.delete({ where: { id } });
      return true;
    } catch (error) {
      console.error("[ImageProjectVersion] Delete error:", error);
      return false;
    }
  },

  /**
   * 获取版本链（从当前版本追溯到根版本）
   * @param {string} versionId
   * @returns {Promise<Array>}
   */
  getVersionChain: async function (versionId) {
    const chain = [];
    let currentId = versionId;

    try {
      while (currentId) {
        const version = await this.get(currentId);
        if (!version) break;
        chain.push(version);
        currentId = version.parentVersionId;
      }
      return chain;
    } catch (error) {
      console.error("[ImageProjectVersion] GetVersionChain error:", error);
      return chain;
    }
  },

  /**
   * 创建初始版本（从原始图像）
   * @param {Object} params
   * @param {string} params.projectId
   * @param {string} params.outputAssetId
   * @param {number} params.width
   * @param {number} params.height
   * @returns {Promise<Object>}
   */
  createInitialVersion: async function ({
    projectId,
    outputAssetId,
    width,
    height,
  }) {
    // 创建初始 Scene Graph（仅包含背景图层）
    const sceneGraph = {
      width,
      height,
      elements: [
        {
          id: uuidv4(),
          type: "background",
          name: "Background",
          locked: true,
          visible: true,
          zIndex: 0,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0 },
          assetId: outputAssetId,
        },
      ],
    };

    return this.create({
      projectId,
      outputAssetId,
      sceneGraph,
      versionType: "raw",
      description: "Initial import",
    });
  },

  /**
   * 基于分析结果创建版本（OCR + 去字背景）
   * @param {Object} params
   * @param {string} params.projectId
   * @param {string} params.parentVersionId
   * @param {string} params.outputAssetId
   * @param {Object} params.sceneGraph
   * @param {Object} params.derivedAssets
   * @param {string} params.jobId
   * @returns {Promise<Object>}
   */
  createAnalyzedVersion: async function ({
    projectId,
    parentVersionId,
    outputAssetId,
    sceneGraph,
    derivedAssets,
    jobId,
  }) {
    return this.create({
      projectId,
      parentVersionId,
      outputAssetId,
      sceneGraph,
      derivedAssets,
      versionType: "analyzed",
      description: "OCR analysis completed",
      jobId,
    });
  },

  /**
   * 清理旧版本（保留最近 N 个）
   * @param {string} projectId
   * @param {number} keepCount
   * @returns {Promise<number>}
   */
  cleanupOldVersions: async function (projectId, keepCount = 20) {
    try {
      // 获取需要保留的版本 ID
      const keepVersions = await prisma.image_project_versions.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: keepCount,
        select: { id: true },
      });

      const keepIds = keepVersions.map((v) => v.id);

      // 同时保留 raw 和 exported 类型的版本
      const protectedVersions = await prisma.image_project_versions.findMany({
        where: {
          projectId,
          versionType: { in: ["raw", "exported"] },
        },
        select: { id: true },
      });

      const protectedIds = protectedVersions.map((v) => v.id);
      const allKeepIds = [...new Set([...keepIds, ...protectedIds])];

      // 删除其他版本
      const result = await prisma.image_project_versions.deleteMany({
        where: {
          projectId,
          id: { notIn: allKeepIds },
        },
      });

      return result.count;
    } catch (error) {
      console.error("[ImageProjectVersion] CleanupOldVersions error:", error);
      return 0;
    }
  },
};

module.exports = { ImageProjectVersion };
