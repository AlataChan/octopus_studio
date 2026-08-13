/**
 * WorkspaceImages API Model
 *
 * 前端与后端图像 API 的交互层
 */

import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const WorkspaceImages = {
  // ========================================
  // Provider
  // ========================================

  /**
   * 获取可用的图像生成 Provider
   */
  getProviders: async function () {
    return fetch(`${API_BASE}/images/providers`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message, providers: {} }));
  },

  // ========================================
  // Generation
  // ========================================

  /**
   * 生成图像
   * @param {string} workspaceSlug
   * @param {Object} params
   * @param {string} params.prompt - 提示词
   * @param {string} [params.negativePrompt] - 负面提示词
   * @param {number} [params.width=1024] - 宽度
   * @param {number} [params.height=1024] - 高度
   * @param {string} [params.provider] - 指定 Provider
   * @param {string} [params.model] - 指定模型
   * @param {boolean} [params.createProject=true] - 是否创建项目
   */
  generate: async function (workspaceSlug, params) {
    return fetch(`${API_BASE}/workspace/${workspaceSlug}/images/generate`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(params),
    })
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  // ========================================
  // Jobs
  // ========================================

  /**
   * 列出任务
   */
  listJobs: async function (
    workspaceSlug,
    { status, limit = 20, offset = 0 } = {}
  ) {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (limit) params.append("limit", limit.toString());
    if (offset) params.append("offset", offset.toString());

    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/images/jobs?${params.toString()}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message, jobs: [] }));
  },

  /**
   * 获取任务详情
   */
  getJob: async function (workspaceSlug, jobId) {
    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/images/jobs/${jobId}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message, job: null }));
  },

  /**
   * 订阅任务进度 (SSE)
   * @param {string} workspaceSlug
   * @param {string} jobId
   * @param {Object} handlers
   * @param {Function} handlers.onProgress - 进度回调
   * @param {Function} handlers.onComplete - 完成回调
   * @param {Function} handlers.onError - 错误回调
   * @returns {Function} 取消订阅函数
   */
  subscribeJobProgress: function (workspaceSlug, jobId, handlers) {
    const { onProgress, onComplete, onError } = handlers;
    const controller = new AbortController();

    const parseSseChunk = (chunkText) => {
      // Expect server format: `data: <json>\n\n`
      const lines = chunkText.split("\n");
      const dataLine = lines.find((l) => l.startsWith("data: "));
      if (!dataLine) return null;
      const jsonText = dataLine.slice("data: ".length).trim();
      if (!jsonText) return null;
      return JSON.parse(jsonText);
    };

    const start = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/workspace/${workspaceSlug}/images/jobs/${jobId}/stream`,
          {
            method: "GET",
            headers: {
              ...baseHeaders(),
              Accept: "text/event-stream",
            },
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(msg || res.statusText || "SSE connection failed");
        }

        if (!res.body) throw new Error("SSE stream not supported by browser");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Each SSE message ends with a blank line
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            let data;
            try {
              data = parseSseChunk(part);
            } catch (e) {
              console.error("[WorkspaceImages] SSE parse error:", e);
              continue;
            }
            if (!data) continue;

            switch (data.type) {
              case "progress":
                onProgress?.(data);
                break;
              case "complete":
                onComplete?.(data);
                controller.abort();
                return;
              case "error":
              case "done":
                if (data.status === "failed") onError?.(data);
                else onComplete?.(data);
                controller.abort();
                return;
            }
          }
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        console.error("[WorkspaceImages] SSE error:", e);
        onError?.({ error: { message: e.message || "Connection error" } });
      }
    };

    start();

    return () => controller.abort();
  },

  /**
   * 取消任务
   */
  cancelJob: async function (workspaceSlug, jobId) {
    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/images/jobs/${jobId}/cancel`,
      {
        method: "POST",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  // ========================================
  // Projects
  // ========================================

  /**
   * 列出项目
   */
  listProjects: async function (
    workspaceSlug,
    { limit = 20, offset = 0, status = "active" } = {}
  ) {
    const params = new URLSearchParams();
    if (limit) params.append("limit", limit.toString());
    if (offset) params.append("offset", offset.toString());
    if (status) params.append("status", status);

    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/images/projects?${params.toString()}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message, projects: [] }));
  },

  /**
   * 获取项目详情
   */
  getProject: async function (
    workspaceSlug,
    projectId,
    { includeVersions = false } = {}
  ) {
    const params = new URLSearchParams();
    if (includeVersions) params.append("includeVersions", "true");

    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/images/projects/${projectId}?${params.toString()}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message, project: null }));
  },

  /**
   * 更新项目版本（sceneGraph 等）
   */
  updateProjectVersion: async function (
    workspaceSlug,
    projectId,
    versionId,
    data
  ) {
    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/images/projects/${projectId}/versions/${versionId}`,
      {
        method: "PATCH",
        headers: baseHeaders(),
        body: JSON.stringify(data),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message, version: null }));
  },

  /**
   * 删除项目
   */
  deleteProject: async function (workspaceSlug, projectId) {
    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/images/projects/${projectId}`,
      {
        method: "DELETE",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  // ========================================
  // Assets
  // ========================================

  /**
   * 上传图像
   * @param {string} workspaceSlug
   * @param {File} file
   */
  uploadAsset: async function (workspaceSlug, file) {
    const formData = new FormData();
    formData.append("file", file);

    // 不使用 baseHeaders，因为 FormData 需要浏览器自动设置 Content-Type
    const headers = baseHeaders();

    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/images/assets/upload`,
      {
        method: "POST",
        headers,
        body: formData,
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  /**
   * 列出资产
   */
  listAssets: async function (
    workspaceSlug,
    { limit = 50, offset = 0, projectId } = {}
  ) {
    const params = new URLSearchParams();
    if (limit) params.append("limit", limit.toString());
    if (offset) params.append("offset", offset.toString());
    if (projectId) params.append("projectId", projectId);

    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/images/assets?${params.toString()}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message, assets: [] }));
  },

  /**
   * 获取资产 URL
   * @param {string} assetId
   */
  getAssetUrl: function (assetId) {
    return `${API_BASE}/images/assets/${assetId}/file`;
  },

  /**
   * 获取资产 Blob URL（用于 <img src>，避免带鉴权 Header 的限制）
   * @param {string} assetId
   * @returns {Promise<string|null>} object URL
   */
  fetchAssetBlobUrl: async function (assetId) {
    return await fetch(`${API_BASE}/images/assets/${assetId}/file`, {
      method: "GET",
      cache: "no-cache",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (res.ok && res.status !== 204) return res.blob();
        throw new Error("Failed to fetch image asset.");
      })
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch((e) => {
        console.error("[WorkspaceImages] Error fetching asset file:", e);
        return null;
      });
  },

  /**
   * 删除资产
   */
  deleteAsset: async function (workspaceSlug, assetId) {
    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/images/assets/${assetId}`,
      {
        method: "DELETE",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  // ========================================
  // Stats
  // ========================================

  /**
   * 获取统计信息
   */
  getStats: async function (workspaceSlug) {
    return fetch(`${API_BASE}/workspace/${workspaceSlug}/images/stats`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => ({
        success: false,
        error: e.message,
        stats: { projects: {}, jobs: {}, assets: {} },
      }));
  },
};

export default WorkspaceImages;
