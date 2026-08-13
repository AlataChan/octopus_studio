const prisma = require("../utils/prisma");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");

/**
 * ImageAsset 模型 - 图像资产存储
 *
 * 负责：
 * - 图像文件的元数据管理
 * - 本地/S3 存储抽象
 * - 资产去重（基于 checksum）
 * - 临时资产生命周期管理
 */
const ImageAsset = {
  /**
   * 创建图像资产
   * @param {Object} params
   * @param {number} params.workspaceId - 工作区 ID
   * @param {string} [params.projectId] - 项目 ID
   * @param {string} params.filename - 原始文件名
   * @param {string} params.mimeType - MIME 类型
   * @param {number} params.sizeBytes - 文件大小
   * @param {number} params.width - 图像宽度
   * @param {number} params.height - 图像高度
   * @param {string} [params.storageBackend='local'] - 存储后端
   * @param {string} params.storagePath - 存储路径
   * @param {string} [params.checksum] - SHA256 校验和
   * @param {Object} [params.metadata] - 元数据
   * @param {Date} [params.expiresAt] - 过期时间
   * @returns {Promise<Object>}
   */
  create: async function ({
    workspaceId,
    projectId = null,
    filename,
    mimeType,
    sizeBytes,
    width,
    height,
    storageBackend = "local",
    storagePath,
    checksum = null,
    metadata = null,
    expiresAt = null,
  }) {
    try {
      const asset = await prisma.image_assets.create({
        data: {
          id: uuidv4(),
          workspaceId,
          projectId,
          filename,
          mimeType,
          sizeBytes,
          width,
          height,
          storageBackend,
          storagePath,
          checksum,
          metadata: metadata ? JSON.stringify(metadata) : null,
          expiresAt,
        },
      });
      return { asset, error: null };
    } catch (error) {
      console.error("[ImageAsset] Create error:", error);
      return { asset: null, error: error.message };
    }
  },

  /**
   * 根据 ID 获取资产
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  get: async function (id) {
    try {
      const asset = await prisma.image_assets.findUnique({
        where: { id },
      });
      return asset;
    } catch (error) {
      console.error("[ImageAsset] Get error:", error);
      return null;
    }
  },

  /**
   * 根据条件获取资产
   * @param {Object} clause - Prisma where 条件
   * @returns {Promise<Object|null>}
   */
  where: async function (clause = {}) {
    try {
      const asset = await prisma.image_assets.findFirst({
        where: clause,
      });
      return asset;
    } catch (error) {
      console.error("[ImageAsset] Where error:", error);
      return null;
    }
  },

  /**
   * 列出工作区的资产
   * @param {number} workspaceId
   * @param {Object} [options]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {string} [options.projectId]
   * @returns {Promise<Array>}
   */
  list: async function (workspaceId, options = {}) {
    const { limit = 50, offset = 0, projectId } = options;

    try {
      const where = { workspaceId };
      if (projectId) where.projectId = projectId;

      const assets = await prisma.image_assets.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });
      return assets;
    } catch (error) {
      console.error("[ImageAsset] List error:", error);
      return [];
    }
  },

  /**
   * 更新资产
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  update: async function (id, data) {
    try {
      if (data.metadata && typeof data.metadata === "object") {
        data.metadata = JSON.stringify(data.metadata);
      }

      const asset = await prisma.image_assets.update({
        where: { id },
        data,
      });
      return { asset, error: null };
    } catch (error) {
      console.error("[ImageAsset] Update error:", error);
      return { asset: null, error: error.message };
    }
  },

  /**
   * 删除资产（软删除 - 设置过期时间）
   * @param {string} id
   * @param {boolean} [hard=false] - 是否硬删除
   * @returns {Promise<boolean>}
   */
  delete: async function (id, hard = false) {
    try {
      if (hard) {
        await prisma.image_assets.delete({ where: { id } });
      } else {
        // 软删除：设置 24 小时后过期
        await prisma.image_assets.update({
          where: { id },
          data: {
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }
      return true;
    } catch (error) {
      console.error("[ImageAsset] Delete error:", error);
      return false;
    }
  },

  /**
   * 根据 checksum 查找已存在的资产（去重）
   * @param {string} checksum
   * @param {number} workspaceId
   * @returns {Promise<Object|null>}
   */
  findByChecksum: async function (checksum, workspaceId) {
    try {
      const asset = await prisma.image_assets.findFirst({
        where: {
          checksum,
          workspaceId,
          expiresAt: null, // 未过期
        },
      });
      return asset;
    } catch (error) {
      console.error("[ImageAsset] FindByChecksum error:", error);
      return null;
    }
  },

  /**
   * 清理过期资产
   * @returns {Promise<{deleted: number, errors: number}>}
   */
  cleanupExpired: async function () {
    const stats = { deleted: 0, errors: 0 };

    try {
      const expiredAssets = await prisma.image_assets.findMany({
        where: {
          expiresAt: { lte: new Date() },
        },
      });

      for (const asset of expiredAssets) {
        try {
          // 删除存储文件
          await this.deleteStorageFile(asset);

          // 删除数据库记录
          await prisma.image_assets.delete({ where: { id: asset.id } });
          stats.deleted++;
        } catch (error) {
          console.error(`[ImageAsset] Cleanup error for ${asset.id}:`, error);
          stats.errors++;
        }
      }
    } catch (error) {
      console.error("[ImageAsset] Cleanup error:", error);
    }

    return stats;
  },

  /**
   * 删除存储文件
   * @param {Object} asset
   * @returns {Promise<boolean>}
   */
  deleteStorageFile: async function (asset) {
    try {
      if (asset.storageBackend === "local") {
        await fs.unlink(asset.storagePath).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      } else if (asset.storageBackend === "s3") {
        const S3Client = require("../utils/storage/S3Client");
        // S3 deletes are idempotent so expired asset cleanup can proceed after prior object removal.
        const result = await S3Client.deleteFile(asset.storagePath);
        if (!result?.ok) {
          console.warn(
            `[ImageAsset] S3 delete failed for ${asset.id}: ${result?.error || "unknown error"}`
          );
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error("[ImageAsset] DeleteStorageFile error:", error);
      return false;
    }
  },

  /**
   * 计算文件 checksum
   * @param {Buffer} buffer
   * @returns {string}
   */
  calculateChecksum: function (buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  },

  /**
   * 获取资产的访问 URL
   * @param {Object} asset
   * @returns {Promise<string>}
   */
  getAccessUrl: async function (asset) {
    if (!asset) return null;

    if (asset.storageBackend === "s3") {
      const S3Client = require("../utils/storage/S3Client");
      const { url } = await S3Client.getPresignedGetUrl({
        key: asset.storagePath,
        workspaceId: asset.workspaceId,
      });
      return url;
    }

    // 本地存储：返回相对 API 路径
    return `/api/images/assets/${asset.id}/file`;
  },

  /**
   * 统计工作区的资产使用量
   * @param {number} workspaceId
   * @returns {Promise<Object>}
   */
  getUsageStats: async function (workspaceId) {
    try {
      const stats = await prisma.image_assets.aggregate({
        where: { workspaceId, expiresAt: null },
        _count: { id: true },
        _sum: { sizeBytes: true },
      });

      return {
        count: stats._count.id || 0,
        totalSizeBytes: stats._sum.sizeBytes || 0,
        totalSizeMB:
          Math.round(((stats._sum.sizeBytes || 0) / (1024 * 1024)) * 100) / 100,
      };
    } catch (error) {
      console.error("[ImageAsset] GetUsageStats error:", error);
      return { count: 0, totalSizeBytes: 0, totalSizeMB: 0 };
    }
  },
};

module.exports = { ImageAsset };
