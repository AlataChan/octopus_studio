/**
 * Workspace Images API Endpoints
 *
 * 提供图像生成、项目管理、任务队列相关的 API
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");
const prisma = require("../utils/prisma");
const { reqBody, userFromSession } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  ROLES,
  flexUserRoleValid,
} = require("../utils/middleware/multiUserProtected");
const { validWorkspaceSlug } = require("../utils/middleware/validWorkspace");
const { ImageAsset } = require("../models/imageAsset");
const { ImageProject } = require("../models/imageProject");
const { ImageProjectVersion } = require("../models/imageProjectVersion");
const { ImageJob, JobStatus, JobType } = require("../models/imageJob");
const {
  generateImage,
  getImageProviderStatus,
} = require("../utils/AiProviders/imageProvider");
const {
  assertWorkspaceResourceAccess,
} = require("../utils/access/assertWorkspaceResourceAccess");

// 配置 multer 用于文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only PNG, JPEG, WebP, and GIF are allowed."
        )
      );
    }
  },
});

/**
 * 获取存储目录路径
 * @param {number} workspaceId
 * @returns {string}
 */
function getStorageDir(workspaceId) {
  return path.resolve(
    process.env.STORAGE_DIR || path.join(__dirname, "../storage"),
    "images",
    `workspace-${workspaceId}`
  );
}

function getStorageRoot() {
  return path.resolve(
    process.env.STORAGE_DIR || path.join(__dirname, "../storage")
  );
}

function resolveStoragePath(storagePath) {
  const storageRoot = getStorageRoot();
  const resolvedPath = path.resolve(storagePath);
  const relativePath = path.relative(storageRoot, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return resolvedPath;
}

function encodeRFC5987Value(value) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function contentDispositionFor(filename) {
  const sanitized = String(filename || "asset")
    .replace(/[\r\n"\\]/g, "")
    .trim();
  const safeFilename = sanitized || "asset";

  return `inline; filename="${safeFilename}"; filename*=UTF-8''${encodeRFC5987Value(safeFilename)}`;
}

function assetIsDeleted(asset) {
  return !!asset?.deletedAt || !!asset?.expiresAt;
}

/**
 * 确保存储目录存在
 * @param {string} dir
 */
async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

function workspaceImagesEndpoints(app) {
  if (!app) return;

  // ========================================
  // Provider 状态
  // ========================================

  /**
   * GET /images/providers
   * 获取图像生成 Provider 状态
   */
  app.get("/images/providers", [validatedRequest], async (_, response) => {
    try {
      const status = getImageProviderStatus();
      response.status(200).json({ success: true, providers: status });
    } catch (e) {
      console.error("[WorkspaceImages] Get providers error:", e);
      response.status(500).json({ success: false, error: e.message });
    }
  });

  // ========================================
  // 图像生成
  // ========================================

  /**
   * POST /workspace/:slug/images/generate
   * 生成图像（文生图）
   */
  app.post(
    "/workspace/:slug/images/generate",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const {
          prompt,
          negativePrompt,
          width = 1024,
          height = 1024,
          provider,
          model,
          createProject = true,
        } = reqBody(request);

        if (!prompt || prompt.trim().length === 0) {
          return response
            .status(400)
            .json({ success: false, error: "Prompt is required." });
        }

        // 创建 Job
        const { job, error: jobError } = await ImageJob.create({
          workspaceId: workspace.id,
          userId: user?.id,
          type: JobType.GENERATE,
          params: {
            prompt,
            negativePrompt,
            width,
            height,
            provider,
            model,
            createProject,
          },
        });

        if (jobError) {
          return response.status(500).json({ success: false, error: jobError });
        }

        // 异步执行生成任务
        processGenerateJob(job, workspace.id, user?.id).catch((err) => {
          console.error("[WorkspaceImages] Generate job error:", err);
        });

        response.status(202).json({
          success: true,
          jobId: job.id,
          message: "Image generation started",
        });
      } catch (e) {
        console.error("[WorkspaceImages] Generate error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  // ========================================
  // Jobs API
  // ========================================

  /**
   * GET /workspace/:slug/images/jobs
   * 列出任务
   */
  app.get(
    "/workspace/:slug/images/jobs",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { status, limit = 20, offset = 0 } = request.query;

        const jobs = await ImageJob.list({
          workspaceId: workspace.id,
          status,
          limit: parseInt(limit),
          offset: parseInt(offset),
        });

        // Backfill `job.projectId` for older jobs (or if linking failed) using output asset -> project mapping.
        // This enables selecting historical jobs and opening the correct canvas project.
        const assetIdsToResolve = jobs
          .filter((job) => !job.projectId && !!job.outputAssetId)
          .map((job) => job.outputAssetId);

        if (assetIdsToResolve.length > 0) {
          const assets = await prisma.image_assets.findMany({
            where: {
              id: { in: assetIdsToResolve },
              workspaceId: workspace.id,
            },
            select: { id: true, projectId: true },
          });
          const projectIdByAssetId = new Map(
            assets.map((a) => [a.id, a.projectId || null])
          );

          const patchedJobs = jobs.map((job) => {
            if (job.projectId) return job;
            if (!job.outputAssetId) return job;
            const derivedProjectId =
              projectIdByAssetId.get(job.outputAssetId) || null;
            if (!derivedProjectId) return job;
            return { ...job, projectId: derivedProjectId };
          });

          // Best-effort persistence so future queries don't need to backfill.
          const toPersist = patchedJobs.filter(
            (job) =>
              job.projectId && !jobs.find((j) => j.id === job.id)?.projectId
          );
          if (toPersist.length > 0) {
            await Promise.allSettled(
              toPersist.map((job) =>
                prisma.image_jobs.update({
                  where: { id: job.id },
                  data: { projectId: job.projectId },
                })
              )
            );
          }

          return response
            .status(200)
            .json({ success: true, jobs: patchedJobs });
        }

        response.status(200).json({ success: true, jobs });
      } catch (e) {
        console.error("[WorkspaceImages] List jobs error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * GET /workspace/:slug/images/jobs/:jobId
   * 获取任务详情
   */
  app.get(
    "/workspace/:slug/images/jobs/:jobId",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { jobId } = request.params;

        const job = await ImageJob.get(jobId);
        if (!job || job.workspaceId !== workspace.id) {
          return response
            .status(404)
            .json({ success: false, error: "Job not found." });
        }

        // 如果有输出资产，获取 URL
        let outputUrl = null;
        let resolvedProjectId = job.projectId || null;
        if (job.outputAssetId) {
          const asset = await ImageAsset.get(job.outputAssetId);
          if (asset) {
            outputUrl = await ImageAsset.getAccessUrl(asset);
            if (!resolvedProjectId && asset.projectId) {
              resolvedProjectId = asset.projectId;
              // Best-effort persistence.
              prisma.image_jobs
                .update({
                  where: { id: job.id },
                  data: { projectId: resolvedProjectId },
                })
                .catch(() => {});
            }
          }
        }

        response.status(200).json({
          success: true,
          job: {
            ...job,
            projectId: resolvedProjectId,
            outputUrl,
          },
        });
      } catch (e) {
        console.error("[WorkspaceImages] Get job error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * GET /workspace/:slug/images/jobs/:jobId/stream
   * SSE 推送任务进度
   */
  app.get(
    "/workspace/:slug/images/jobs/:jobId/stream",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { jobId } = request.params;

        const job = await ImageJob.get(jobId);
        if (!job || job.workspaceId !== workspace.id) {
          return response
            .status(404)
            .json({ success: false, error: "Job not found." });
        }

        // 设置 SSE 头
        response.setHeader("Content-Type", "text/event-stream");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Connection", "keep-alive");
        response.flushHeaders();

        // 发送初始状态
        response.write(
          `data: ${JSON.stringify({ type: "status", status: job.status, progress: job.progress })}\n\n`
        );

        // 如果任务已完成，直接返回
        if (
          job.status === JobStatus.COMPLETED ||
          job.status === JobStatus.FAILED ||
          job.status === JobStatus.CANCELLED
        ) {
          response.write(
            `data: ${JSON.stringify({ type: "done", status: job.status })}\n\n`
          );
          response.end();
          return;
        }

        // 监听任务事件
        const progressHandler = (data) => {
          response.write(
            `data: ${JSON.stringify({ type: "progress", ...data })}\n\n`
          );
        };

        const completeHandler = (data) => {
          response.write(
            `data: ${JSON.stringify({ type: "complete", ...data })}\n\n`
          );
          cleanup();
          response.end();
        };

        const errorHandler = (data) => {
          response.write(
            `data: ${JSON.stringify({ type: "error", ...data })}\n\n`
          );
          cleanup();
          response.end();
        };

        const cleanup = () => {
          ImageJob.emitter.off(`job:${jobId}:progress`, progressHandler);
          ImageJob.emitter.off(`job:${jobId}:complete`, completeHandler);
          ImageJob.emitter.off(`job:${jobId}:error`, errorHandler);
          ImageJob.emitter.off(`job:${jobId}:cancel`, errorHandler);
        };

        ImageJob.emitter.on(`job:${jobId}:progress`, progressHandler);
        ImageJob.emitter.on(`job:${jobId}:complete`, completeHandler);
        ImageJob.emitter.on(`job:${jobId}:error`, errorHandler);
        ImageJob.emitter.on(`job:${jobId}:cancel`, errorHandler);

        // 客户端断开时清理
        request.on("close", cleanup);
      } catch (e) {
        console.error("[WorkspaceImages] Stream job error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * POST /workspace/:slug/images/jobs/:jobId/cancel
   * 取消任务
   */
  app.post(
    "/workspace/:slug/images/jobs/:jobId/cancel",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { jobId } = request.params;

        const job = await ImageJob.get(jobId);
        if (!job || job.workspaceId !== workspace.id) {
          return response
            .status(404)
            .json({ success: false, error: "Job not found." });
        }

        if (
          job.status !== JobStatus.PENDING &&
          job.status !== JobStatus.RUNNING
        ) {
          return response
            .status(400)
            .json({ success: false, error: "Job cannot be cancelled." });
        }

        const { job: cancelledJob, error } = await ImageJob.cancel(jobId);
        if (error) {
          return response.status(500).json({ success: false, error });
        }

        response.status(200).json({ success: true, job: cancelledJob });
      } catch (e) {
        console.error("[WorkspaceImages] Cancel job error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  // ========================================
  // Projects API
  // ========================================

  /**
   * GET /workspace/:slug/images/projects
   * 列出项目
   */
  app.get(
    "/workspace/:slug/images/projects",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { limit = 20, offset = 0, status = "active" } = request.query;

        const projects = await ImageProject.list(workspace.id, {
          limit: parseInt(limit),
          offset: parseInt(offset),
          status,
        });

        // Enrich with current version metadata for thumbnails / UX.
        const currentVersionIds = Array.from(
          new Set(
            projects
              .map((p) => p?.currentVersionId)
              .filter(Boolean)
              .map(String)
          )
        );

        const versions =
          currentVersionIds.length > 0
            ? await prisma.image_project_versions.findMany({
                where: { id: { in: currentVersionIds } },
                select: { id: true, outputAssetId: true, versionType: true },
              })
            : [];

        const versionById = Object.fromEntries(
          versions.map((v) => [String(v.id), v])
        );

        const enrichedProjects = projects.map((p) => {
          const current = p?.currentVersionId
            ? versionById[String(p.currentVersionId)] || null
            : null;
          return {
            ...p,
            currentVersionOutputAssetId: current?.outputAssetId || null,
            currentVersionType: current?.versionType || null,
          };
        });

        response
          .status(200)
          .json({ success: true, projects: enrichedProjects });
      } catch (e) {
        console.error("[WorkspaceImages] List projects error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * PATCH /workspace/:slug/images/projects/:projectId/versions/:versionId
   * 更新项目版本（sceneGraph 等）
   */
  app.patch(
    "/workspace/:slug/images/projects/:projectId/versions/:versionId",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { projectId, versionId } = request.params;
        const { sceneGraph, versionType, description } = reqBody(request);

        if (!sceneGraph || typeof sceneGraph !== "object") {
          return response
            .status(400)
            .json({ success: false, error: "sceneGraph is required." });
        }

        const project = await ImageProject.get(projectId);
        if (!project || project.workspaceId !== workspace.id) {
          return response
            .status(404)
            .json({ success: false, error: "Project not found." });
        }

        const existingVersion = await ImageProjectVersion.get(versionId);
        if (!existingVersion || existingVersion.projectId !== projectId) {
          return response
            .status(404)
            .json({ success: false, error: "Version not found." });
        }

        const { version, error } = await ImageProjectVersion.update(versionId, {
          sceneGraph,
          ...(versionType ? { versionType } : {}),
          ...(description ? { description } : {}),
        });

        if (error) {
          return response.status(500).json({ success: false, error });
        }

        // Touch project updatedAt for better list sorting.
        await ImageProject.update(projectId, {});

        response.status(200).json({ success: true, version });
      } catch (e) {
        console.error("[WorkspaceImages] Update project version error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * GET /workspace/:slug/images/projects/:projectId
   * 获取项目详情
   */
  app.get(
    "/workspace/:slug/images/projects/:projectId",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { projectId } = request.params;
        const { includeVersions = "false" } = request.query;

        const project = await ImageProject.get(projectId, {
          includeVersions: includeVersions === "true",
        });

        if (!project || project.workspaceId !== workspace.id) {
          return response
            .status(404)
            .json({ success: false, error: "Project not found." });
        }

        // 获取当前版本
        let currentVersion = null;
        if (project.currentVersionId) {
          currentVersion = await ImageProjectVersion.get(
            project.currentVersionId
          );
        }

        // 获取输出资产 URL
        let outputUrl = null;
        if (currentVersion?.outputAssetId) {
          const asset = await ImageAsset.get(currentVersion.outputAssetId);
          if (asset) {
            outputUrl = await ImageAsset.getAccessUrl(asset);
          }
        }

        response.status(200).json({
          success: true,
          project: {
            ...project,
            currentVersion,
            outputUrl,
          },
        });
      } catch (e) {
        console.error("[WorkspaceImages] Get project error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * DELETE /workspace/:slug/images/projects/:projectId
   * 删除项目
   */
  app.delete(
    "/workspace/:slug/images/projects/:projectId",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { projectId } = request.params;

        const project = await ImageProject.get(projectId);
        if (!project || project.workspaceId !== workspace.id) {
          return response
            .status(404)
            .json({ success: false, error: "Project not found." });
        }

        const success = await ImageProject.delete(projectId);
        response.status(200).json({ success });
      } catch (e) {
        console.error("[WorkspaceImages] Delete project error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  // ========================================
  // Assets API
  // ========================================

  /**
   * POST /workspace/:slug/images/assets/upload
   * 上传图像
   */
  app.post(
    "/workspace/:slug/images/assets/upload",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      validWorkspaceSlug,
      upload.single("file"),
    ],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const file = request.file;

        if (!file) {
          return response
            .status(400)
            .json({ success: false, error: "No file uploaded." });
        }

        // 获取图像尺寸
        const sharp = require("sharp");
        const metadata = await sharp(file.buffer).metadata();

        // 计算 checksum
        const checksum = ImageAsset.calculateChecksum(file.buffer);

        // 检查是否已存在（去重）
        const existing = await ImageAsset.findByChecksum(
          checksum,
          workspace.id
        );
        if (existing) {
          const url = await ImageAsset.getAccessUrl(existing);
          return response.status(200).json({
            success: true,
            asset: existing,
            url,
            deduplicated: true,
          });
        }

        // 保存文件
        const storageDir = getStorageDir(workspace.id);
        await ensureDir(storageDir);

        const ext = path.extname(file.originalname) || ".png";
        const filename = `${uuidv4()}${ext}`;
        const storagePath = path.join(storageDir, filename);

        await fs.writeFile(storagePath, file.buffer);

        // 创建资产记录
        const { asset, error } = await ImageAsset.create({
          workspaceId: workspace.id,
          filename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          width: metadata.width || 0,
          height: metadata.height || 0,
          storageBackend: "local",
          storagePath,
          checksum,
          metadata: { source: "upload" },
        });

        if (error) {
          // 清理文件
          await fs.unlink(storagePath).catch(() => {});
          return response.status(500).json({ success: false, error });
        }

        const url = await ImageAsset.getAccessUrl(asset);
        response.status(200).json({ success: true, asset, url });
      } catch (e) {
        console.error("[WorkspaceImages] Upload asset error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * GET /images/assets/:assetId/file
   * 获取图像文件
   */
  app.get(
    "/images/assets/:assetId/file",
    [validatedRequest],
    async (request, response) => {
      try {
        const { assetId } = request.params;

        const asset = await ImageAsset.get(assetId);
        if (!asset || assetIsDeleted(asset)) {
          return response
            .status(404)
            .json({ success: false, error: "Asset not found." });
        }

        const access = await assertWorkspaceResourceAccess({
          workspaceId: asset.workspaceId,
          user: response.locals.user || request.user || null,
          multiUserMode: response.locals.multiUserMode,
        });
        if (!access.ok) {
          return response
            .status(access.status)
            .json({ success: false, error: access.error });
        }

        if (asset.storageBackend === "local") {
          const resolvedPath = resolveStoragePath(asset.storagePath);
          if (!resolvedPath) {
            return response.status(400).json({
              success: false,
              error: "Invalid asset storage path.",
            });
          }

          response.setHeader("Content-Type", asset.mimeType);
          response.setHeader(
            "Content-Disposition",
            contentDispositionFor(asset.filename)
          );
          response.sendFile(resolvedPath);
        } else {
          // S3 - 重定向到预签名 URL
          const url = await ImageAsset.getAccessUrl(asset);
          response.redirect(url);
        }
      } catch (e) {
        console.error("[WorkspaceImages] Get asset file error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * GET /workspace/:slug/images/assets
   * 列出资产
   */
  app.get(
    "/workspace/:slug/images/assets",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { limit = 50, offset = 0, projectId } = request.query;

        const assets = await ImageAsset.list(workspace.id, {
          limit: parseInt(limit),
          offset: parseInt(offset),
          projectId,
        });

        response.status(200).json({ success: true, assets });
      } catch (e) {
        console.error("[WorkspaceImages] List assets error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * DELETE /workspace/:slug/images/assets/:assetId
   * 删除资产
   */
  app.delete(
    "/workspace/:slug/images/assets/:assetId",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { assetId } = request.params;

        const asset = await ImageAsset.get(assetId);
        if (!asset || asset.workspaceId !== workspace.id) {
          return response
            .status(404)
            .json({ success: false, error: "Asset not found." });
        }

        const success = await ImageAsset.delete(assetId);
        response.status(200).json({ success });
      } catch (e) {
        console.error("[WorkspaceImages] Delete asset error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  // ========================================
  // Stats API
  // ========================================

  /**
   * GET /workspace/:slug/images/stats
   * 获取统计信息
   */
  app.get(
    "/workspace/:slug/images/stats",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;

        const [projectStats, jobStats, assetStats] = await Promise.all([
          ImageProject.count(workspace.id),
          ImageJob.getStats(workspace.id),
          ImageAsset.getUsageStats(workspace.id),
        ]);

        response.status(200).json({
          success: true,
          stats: {
            projects: projectStats,
            jobs: jobStats,
            assets: assetStats,
          },
        });
      } catch (e) {
        console.error("[WorkspaceImages] Get stats error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );
}

/**
 * 处理图像生成任务
 * @param {Object} job
 * @param {number} workspaceId
 * @param {number} userId
 */
async function processGenerateJob(job, workspaceId, userId) {
  try {
    // 开始任务
    await ImageJob.start(job.id);
    await ImageJob.updateProgress(job.id, 10);

    const {
      prompt,
      negativePrompt,
      width,
      height,
      provider,
      model,
      createProject,
    } = job.params;

    // 调用图像生成
    await ImageJob.updateProgress(job.id, 30);
    const result = await generateImage(
      { prompt, negativePrompt, width, height },
      { provider, model }
    );

    if (!result.success) {
      await ImageJob.fail(job.id, {
        code: "GENERATION_FAILED",
        message: result.error,
        retryable: true,
      });
      return;
    }

    await ImageJob.updateProgress(job.id, 70);

    // 下载并保存图像
    let imageBuffer;
    if (result.imageUrl) {
      const response = await fetch(result.imageUrl);
      imageBuffer = Buffer.from(await response.arrayBuffer());
    } else if (result.imageBuffer) {
      imageBuffer = result.imageBuffer;
    } else {
      throw new Error("No image data returned");
    }

    // 获取图像元数据
    const sharp = require("sharp");
    const metadata = await sharp(imageBuffer).metadata();

    // 保存文件
    const storageDir = getStorageDir(workspaceId);
    await ensureDir(storageDir);

    const filename = `${uuidv4()}.png`;
    const storagePath = path.join(storageDir, filename);
    await fs.writeFile(storagePath, imageBuffer);

    // 计算 checksum
    const checksum = ImageAsset.calculateChecksum(imageBuffer);

    // 创建资产
    const { asset, error: assetError } = await ImageAsset.create({
      workspaceId,
      filename: `generated-${Date.now()}.png`,
      mimeType: "image/png",
      sizeBytes: imageBuffer.length,
      width: metadata.width || width,
      height: metadata.height || height,
      storageBackend: "local",
      storagePath,
      checksum,
      metadata: {
        source: "generate",
        jobId: job.id,
        prompt,
        provider: result.metadata?.provider,
        revisedPrompt: result.revisedPrompt,
      },
    });

    if (assetError) {
      throw new Error(assetError);
    }

    await ImageJob.updateProgress(job.id, 90);

    // 可选：创建项目
    let projectId = null;
    if (createProject) {
      const { project, error: projectError } = await ImageProject.create({
        workspaceId,
        userId,
        title: prompt.substring(0, 100),
        sourceType: "generated",
        sourceProvider: result.metadata?.provider,
        sourcePrompt: prompt,
      });

      if (!projectError && project) {
        projectId = project.id;

        // 关联资产到项目
        await ImageAsset.update(asset.id, { projectId });

        // 创建初始版本
        const { version } = await ImageProjectVersion.createInitialVersion({
          projectId,
          outputAssetId: asset.id,
          width: metadata.width || width,
          height: metadata.height || height,
        });

        // 设置当前版本
        if (version) {
          await ImageProject.setCurrentVersion(projectId, version.id);
        }
      }
    }

    // 完成任务
    await ImageJob.complete(job.id, {
      outputAssetId: asset.id,
      providerUsed: result.metadata?.provider,
      projectId: projectId || undefined,
    });
  } catch (error) {
    console.error("[processGenerateJob] Error:", error);
    await ImageJob.fail(job.id, {
      code: "PROCESSING_ERROR",
      message: error.message,
      retryable: false,
    });
  }
}

module.exports = { workspaceImagesEndpoints };
