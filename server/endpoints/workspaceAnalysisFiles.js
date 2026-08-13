/**
 * @fileoverview 工作区分析文件上传 API
 * 处理 Excel/CSV 文件上传到 S3/MinIO 临时存储层
 */

const multer = require("multer");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validWorkspaceSlug } = require("../utils/middleware/validWorkspace");
const { Workspace } = require("../models/workspace");
const { EventLogs } = require("../models/eventLogs");
const S3Client = require("../utils/storage/S3Client");

// 配置 multer - 内存存储（500MB 限制）
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: S3Client.getMaxFileSize(),
  },
  fileFilter: (req, file, cb) => {
    // 只允许 Excel 和 CSV 文件
    const allowedMimes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    const allowedExts = [".csv", ".xls", ".xlsx"];
    const ext = file.originalname
      .toLowerCase()
      .slice(file.originalname.lastIndexOf("."));

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("只支持 CSV 和 Excel 文件格式"));
    }
  },
});

/**
 * 注册工作区分析文件相关的 API 端点
 * @param {Express} app
 */
function workspaceAnalysisFilesEndpoints(app) {
  if (!app) return;

  /**
   * 检查临时分析层状态
   * GET /api/analysis-layer/status
   */
  app.get("/analysis-layer/status", [validatedRequest], async (req, res) => {
    try {
      if (!S3Client.isEnabled()) {
        return res.json({
          success: true,
          data: {
            enabled: false,
            message: "存储后端配置异常，请检查 STORAGE_BACKEND 设置",
          },
        });
      }

      const status = await S3Client.checkConnection();
      res.json({
        success: true,
        data: {
          enabled: true,
          connected: status.connected,
          backend: status.backend,
          bucket: status.bucket,
          storageDir: status.storageDir,
          maxFileSize: S3Client.getMaxFileSize(),
          retentionDays: S3Client.getRetentionDays(),
          error: status.error,
        },
      });
    } catch (error) {
      console.error("[AnalysisFiles] Status check error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 上传分析文件
   * POST /api/workspace/:slug/analysis-files/upload
   */
  app.post(
    "/workspace/:slug/analysis-files/upload",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
      validWorkspaceSlug,
      upload.single("file"),
    ],
    async (req, res) => {
      try {
        if (!S3Client.isEnabled()) {
          return res.status(400).json({
            success: false,
            error: "临时分析层未启用，请配置 S3/MinIO 环境变量",
          });
        }

        const { slug } = req.params;
        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return res
            .status(404)
            .json({ success: false, error: "工作区不存在" });
        }

        if (!req.file) {
          return res
            .status(400)
            .json({ success: false, error: "请选择要上传的文件" });
        }

        const { buffer, originalname, mimetype, size } = req.file;

        // 上传到 S3
        const result = await S3Client.uploadFile(
          buffer,
          originalname,
          workspace.id,
          mimetype
        );

        // 记录事件日志
        await EventLogs.logEvent("analysis_file_uploaded", {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          fileName: originalname,
          fileSize: size,
          s3Key: result.key,
        });

        res.json({
          success: true,
          data: {
            key: result.key,
            url: result.url,
            originalName: originalname,
            size,
            uploadedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error("[AnalysisFiles] Upload error:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 列出工作区的分析文件
   * GET /api/workspace/:slug/analysis-files
   */
  app.get(
    "/workspace/:slug/analysis-files",
    [validatedRequest, validWorkspaceSlug],
    async (req, res) => {
      try {
        if (!S3Client.isEnabled()) {
          return res.json({
            success: true,
            data: { files: [], enabled: false },
          });
        }

        const { slug } = req.params;
        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return res
            .status(404)
            .json({ success: false, error: "工作区不存在" });
        }

        const files = await S3Client.listWorkspaceFiles(workspace.id);
        res.json({
          success: true,
          data: {
            files: files.map((f) => ({
              key: f.key,
              size: f.size,
              lastModified: f.lastModified,
            })),
            enabled: true,
          },
        });
      } catch (error) {
        console.error("[AnalysisFiles] List error:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 删除分析文件
   * DELETE /api/workspace/:slug/analysis-files/:key
   */
  app.delete(
    "/workspace/:slug/analysis-files/*",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
      validWorkspaceSlug,
    ],
    async (req, res) => {
      try {
        if (!S3Client.isEnabled()) {
          return res.status(400).json({
            success: false,
            error: "临时分析层未启用",
          });
        }

        const { slug } = req.params;
        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return res
            .status(404)
            .json({ success: false, error: "工作区不存在" });
        }

        // 获取完整的 key（从 URL 路径中）
        const key = req.params[0];
        if (!key || !key.startsWith(`workspace-${workspace.id}/`)) {
          return res
            .status(403)
            .json({ success: false, error: "无权删除此文件" });
        }

        await S3Client.deleteFile(key);

        await EventLogs.logEvent("analysis_file_deleted", {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          s3Key: key,
        });

        res.json({ success: true, message: "文件已删除" });
      } catch (error) {
        console.error("[AnalysisFiles] Delete error:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 获取文件的预签名 URL（用于 DuckDB 查询）
   * GET /api/workspace/:slug/analysis-files/presign/*
   */
  app.get(
    "/workspace/:slug/analysis-files/presign/*",
    [validatedRequest, validWorkspaceSlug],
    async (req, res) => {
      try {
        if (!S3Client.isEnabled()) {
          return res.status(400).json({
            success: false,
            error: "临时分析层未启用",
          });
        }

        const { slug } = req.params;
        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return res
            .status(404)
            .json({ success: false, error: "工作区不存在" });
        }

        const key = req.params[0];
        if (!key || !key.startsWith(`workspace-${workspace.id}/`)) {
          return res
            .status(403)
            .json({ success: false, error: "无权访问此文件" });
        }

        const url = await S3Client.getPresignedUrl(key, 3600);
        res.json({ success: true, data: { url, expiresIn: 3600 } });
      } catch (error) {
        console.error("[AnalysisFiles] Presign error:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 获取知识同步统计
   * GET /api/knowledge-sync/stats
   */
  app.get(
    "/knowledge-sync/stats",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (req, res) => {
      try {
        const { getSyncStats } = require("../utils/etl/knowledgeSync");
        const stats = await getSyncStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        console.error("[KnowledgeSync] Stats error:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 手动触发知识同步
   * POST /api/knowledge-sync/run
   */
  app.post(
    "/knowledge-sync/run",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (req, res) => {
      try {
        const { runKnowledgeSync } = require("../utils/etl/knowledgeSync");
        const result = await runKnowledgeSync();

        await EventLogs.logEvent("knowledge_sync_completed", {
          success: result.success,
          failed: result.failed,
          total: result.total,
        });

        res.json({ success: true, data: result });
      } catch (error) {
        console.error("[KnowledgeSync] Run error:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );
}

module.exports = { workspaceAnalysisFilesEndpoints };
