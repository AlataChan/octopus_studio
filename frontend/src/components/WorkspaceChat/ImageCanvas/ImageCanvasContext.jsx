/**
 * ImageCanvasContext - 图像画布全局状态管理
 *
 * 提供:
 * - 图像生成状态管理
 * - 项目列表和选中状态
 * - 任务队列监听
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import WorkspaceImages from "@/models/workspaceImages";

// 事件名称
export const IMAGE_GENERATED_EVENT = "imageCanvas:generated";
export const IMAGE_CANVAS_OPEN_EVENT = "imageCanvas:open";

const ImageCanvasContext = createContext(null);

export function ImageCanvasProvider({ workspace, children }) {
  const workspaceSlug = workspace?.slug || null;
  const enabled = !!workspaceSlug;

  // 状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [providers, setProviders] = useState({});

  // 项目相关
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);

  // Jobs 相关（历史任务）
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState(null);
  const hasHydratedLatestRef = useRef(false);

  // 生成相关
  const [generating, setGenerating] = useState(false);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedImageUrl, setGeneratedImageUrl] = useState(null);
  const generatedImageUrlRef = useRef(null);
  useEffect(() => {
    generatedImageUrlRef.current = generatedImageUrl;
  }, [generatedImageUrl]);

  // Revoke blob URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (
        typeof generatedImageUrl === "string" &&
        generatedImageUrl.startsWith("blob:")
      ) {
        URL.revokeObjectURL(generatedImageUrl);
      }
    };
  }, [generatedImageUrl]);

  /**
   * 加载 Provider 列表
   */
  const loadProviders = useCallback(async () => {
    const res = await WorkspaceImages.getProviders();
    if (res?.success) {
      setProviders(res.providers || {});
    }
  }, []);

  /**
   * 刷新项目列表
   */
  const refreshProjects = useCallback(async () => {
    if (!enabled) {
      setProjects([]);
      return;
    }

    setLoading(true);
    setError(null);

    const res = await WorkspaceImages.listProjects(workspaceSlug);
    if (!res?.success) {
      setError(res?.error || "Failed to load projects");
      setLoading(false);
      return;
    }

    setProjects(res.projects || []);
    setLoading(false);
  }, [enabled, workspaceSlug]);

  /**
   * 刷新 Jobs 列表（用于历史记录 / 任务追踪）
   */
  const refreshJobs = useCallback(async () => {
    if (!enabled) {
      setJobs([]);
      return;
    }

    setJobsLoading(true);
    setJobsError(null);

    const res = await WorkspaceImages.listJobs(workspaceSlug, {
      limit: 50,
      offset: 0,
    });
    if (!res?.success) {
      setJobsError(res?.error || "Failed to load jobs");
      setJobsLoading(false);
      return;
    }

    const list = res.jobs || [];
    setJobs(list);
    setJobsLoading(false);

    // On first load only: hydrate a preview so refresh doesn't feel like "lost" output.
    if (!hasHydratedLatestRef.current && !generatedImageUrlRef.current) {
      const lastOutputAssetKey = workspaceSlug
        ? `imageCanvas:lastOutputAssetId:${workspaceSlug}`
        : null;

      let hydrated = false;

      // Try localStorage first (fast path after refresh).
      try {
        const cachedAssetId = lastOutputAssetKey
          ? window.localStorage.getItem(lastOutputAssetKey)
          : null;
        if (cachedAssetId) {
          const blobUrl =
            await WorkspaceImages.fetchAssetBlobUrl(cachedAssetId);
          if (blobUrl) {
            setGeneratedImageUrl(blobUrl);
            hydrated = true;
          }
        }
      } catch {}

      // Fallback to the latest completed job.
      if (!hydrated) {
        const latestCompleted = list.find(
          (j) => j?.status === "completed" && !!j.outputAssetId
        );
        if (latestCompleted?.outputAssetId) {
          const blobUrl = await WorkspaceImages.fetchAssetBlobUrl(
            latestCompleted.outputAssetId
          );
          if (blobUrl) setGeneratedImageUrl(blobUrl);
        }
      }
      hasHydratedLatestRef.current = true;
    }
  }, [enabled, workspaceSlug]);

  /**
   * 选择项目
   */
  const selectProject = useCallback(
    async (projectId) => {
      if (!enabled || !projectId) {
        setSelectedProjectId(null);
        setSelectedProject(null);
        return;
      }

      setSelectedProjectId(projectId);
      const res = await WorkspaceImages.getProject(workspaceSlug, projectId, {
        includeVersions: true,
      });

      if (res?.success && res.project) {
        setSelectedProject(res.project);
      } else {
        setSelectedProject(null);
      }
    },
    [enabled, workspaceSlug]
  );

  /**
   * 预览某个任务的输出（会更新 Latest 预览）
   */
  const previewJobOutput = useCallback(
    async (job) => {
      if (!job?.outputAssetId) return null;
      const blobUrl = await WorkspaceImages.fetchAssetBlobUrl(
        job.outputAssetId
      );
      if (blobUrl) setGeneratedImageUrl(blobUrl);
      // Persist the last selected output so refresh can restore the same preview.
      try {
        if (workspaceSlug) {
          window.localStorage.setItem(
            `imageCanvas:lastOutputAssetId:${workspaceSlug}`,
            job.outputAssetId
          );
        }
      } catch {}

      // Prefer explicit job.projectId, but fall back to resolving via project thumbnails.
      const fallbackProjectId =
        projects?.find(
          (p) => p?.currentVersionOutputAssetId === job.outputAssetId
        )?.id || null;

      const projectIdToSelect = job?.projectId || fallbackProjectId;
      if (projectIdToSelect) await selectProject(projectIdToSelect);
      return blobUrl;
    },
    [projects, selectProject, workspaceSlug]
  );

  /**
   * 生成图像
   */
  const generateImage = useCallback(
    async ({
      prompt,
      negativePrompt,
      width = 1024,
      height = 1024,
      provider,
      model,
      createProject = true,
    }) => {
      if (!enabled) {
        return { success: false, error: "Workspace not available" };
      }

      setGenerating(true);
      setGenerationProgress(0);
      setGeneratedImageUrl(null);
      setError(null);

      const res = await WorkspaceImages.generate(workspaceSlug, {
        prompt,
        negativePrompt,
        width,
        height,
        provider,
        model,
        createProject,
      });

      if (!res?.success) {
        setGenerating(false);
        setError(res?.error || "Generation failed");
        return res;
      }

      const jobId = res.jobId;
      setCurrentJobId(jobId);

      // 订阅任务进度
      const unsubscribe = WorkspaceImages.subscribeJobProgress(
        workspaceSlug,
        jobId,
        {
          onProgress: (data) => {
            setGenerationProgress(data.progress || 0);
          },
          onComplete: async (data) => {
            setGenerating(false);
            setGenerationProgress(100);

            // 获取生成的图像 URL
            if (data.outputAssetId) {
              try {
                window.localStorage.setItem(
                  `imageCanvas:lastOutputAssetId:${workspaceSlug}`,
                  data.outputAssetId
                );
              } catch {}

              const blobUrl = await WorkspaceImages.fetchAssetBlobUrl(
                data.outputAssetId
              );
              if (!blobUrl) {
                setError("Failed to load generated image");
              } else {
                setGeneratedImageUrl(blobUrl);

                // 触发事件
                window.dispatchEvent(
                  new CustomEvent(IMAGE_GENERATED_EVENT, {
                    detail: { assetId: data.outputAssetId, url: blobUrl },
                  })
                );
              }
            }

            // 刷新项目列表
            await refreshProjects();
            await refreshJobs();

            // Auto-select the generated project so users can open the Canvas workspace immediately.
            try {
              const jobRes = await WorkspaceImages.getJob(workspaceSlug, jobId);
              const projectId = jobRes?.job?.projectId || null;
              if (projectId) await selectProject(projectId);
            } catch {}
          },
          onError: (data) => {
            setGenerating(false);
            setError(
              data?.error?.message || data?.error || "Generation failed"
            );
          },
        }
      );

      // 保存取消函数以便后续使用
      return { success: true, jobId, unsubscribe };
    },
    [enabled, workspaceSlug, refreshProjects, refreshJobs, selectProject]
  );

  /**
   * 取消当前生成任务
   */
  const cancelGeneration = useCallback(async () => {
    if (!currentJobId || !enabled) return;

    const res = await WorkspaceImages.cancelJob(workspaceSlug, currentJobId);
    if (res?.success) {
      setGenerating(false);
      setCurrentJobId(null);
      setGenerationProgress(0);
    }
    return res;
  }, [currentJobId, enabled, workspaceSlug]);

  /**
   * 删除项目
   */
  const deleteProject = useCallback(
    async (projectId) => {
      if (!enabled) return { success: false };

      const res = await WorkspaceImages.deleteProject(workspaceSlug, projectId);
      if (res?.success) {
        // 如果删除的是当前选中的项目，清除选中状态
        if (selectedProjectId === projectId) {
          setSelectedProjectId(null);
          setSelectedProject(null);
        }
        await refreshProjects();
      }
      return res;
    },
    [enabled, workspaceSlug, selectedProjectId, refreshProjects]
  );

  /**
   * 上传图像
   */
  const uploadImage = useCallback(
    async (file) => {
      if (!enabled) {
        return { success: false, error: "Workspace not available" };
      }

      const res = await WorkspaceImages.uploadAsset(workspaceSlug, file);
      return res;
    },
    [enabled, workspaceSlug]
  );

  /**
   * 获取统计信息
   */
  const getStats = useCallback(async () => {
    if (!enabled) return null;
    return WorkspaceImages.getStats(workspaceSlug);
  }, [enabled, workspaceSlug]);

  // 初始化加载
  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  // Context 值
  const value = useMemo(
    () => ({
      enabled,
      workspaceSlug,
      loading,
      error,
      providers,

      // 项目
      projects,
      selectedProjectId,
      selectedProject,
      refreshProjects,
      selectProject,
      deleteProject,

      // Jobs
      jobs,
      jobsLoading,
      jobsError,
      refreshJobs,
      previewJobOutput,

      // 生成
      generating,
      generationProgress,
      generatedImageUrl,
      generateImage,
      cancelGeneration,

      // 资产
      uploadImage,

      // 统计
      getStats,
    }),
    [
      enabled,
      workspaceSlug,
      loading,
      error,
      providers,
      projects,
      selectedProjectId,
      selectedProject,
      refreshProjects,
      selectProject,
      deleteProject,
      jobs,
      jobsLoading,
      jobsError,
      refreshJobs,
      previewJobOutput,
      generating,
      generationProgress,
      generatedImageUrl,
      generateImage,
      cancelGeneration,
      uploadImage,
      getStats,
    ]
  );

  return (
    <ImageCanvasContext.Provider value={value}>
      {children}
    </ImageCanvasContext.Provider>
  );
}

export function useImageCanvas() {
  return useContext(ImageCanvasContext);
}
