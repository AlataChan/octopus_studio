import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const WORKSPACE_ASSISTANT_LIST_CACHE_TTL_MS = 30_000;
const workspaceAssistantListCache = new Map();
const workspaceAssistantListRequests = new Map();
export const WORKSPACE_ASSISTANTS_UPDATED_EVENT =
  "workspace-assistants:updated";

export function notifyWorkspaceAssistantsUpdated(workspaceSlug = null) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(WORKSPACE_ASSISTANTS_UPDATED_EVENT, {
      detail: { workspaceSlug },
    })
  );
}

/**
 * Workspace Assistant API 封装
 * 用于管理 Workspace 中已安装的助手实例
 */
const WorkspaceAssistant = {
  notifyUpdated: notifyWorkspaceAssistantsUpdated,

  invalidateListCache: function (workspaceSlug = null) {
    if (workspaceSlug) {
      workspaceAssistantListCache.delete(workspaceSlug);
      workspaceAssistantListRequests.delete(workspaceSlug);
      return;
    }

    workspaceAssistantListCache.clear();
    workspaceAssistantListRequests.clear();
  },
  /**
   * 获取 Workspace 已安装的助手列表
   * @param {string} workspaceSlug - Workspace slug
   * @returns {Promise<{success: boolean, data?: {assistants: Array}, error?: string}>}
   */
  list: async function (workspaceSlug, { bypassCache = false } = {}) {
    const cacheKey = workspaceSlug;

    if (!bypassCache) {
      const cached = workspaceAssistantListCache.get(cacheKey);
      if (
        cached &&
        Date.now() - cached.cachedAt < WORKSPACE_ASSISTANT_LIST_CACHE_TTL_MS
      ) {
        return cached.value;
      }

      const inFlight = workspaceAssistantListRequests.get(cacheKey);
      if (inFlight) {
        return inFlight;
      }
    }

    const request = (async () => {
      try {
        const response = await fetch(
          `${API_BASE}/workspace/${workspaceSlug}/assistants`,
          {
            method: "GET",
            headers: baseHeaders(),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "获取助手列表失败");
        }

        const result = await response.json();
        workspaceAssistantListCache.set(cacheKey, {
          value: result,
          cachedAt: Date.now(),
        });
        return result;
      } catch (error) {
        console.error("获取助手列表失败:", error);
        return {
          success: false,
          error: error.message,
        };
      } finally {
        workspaceAssistantListRequests.delete(cacheKey);
      }
    })();

    if (!bypassCache) {
      workspaceAssistantListRequests.set(cacheKey, request);
    }

    return await request;
  },

  /**
   * 启用或禁用助手
   * @param {string} workspaceSlug - Workspace slug
   * @param {string} instanceId - 助手实例 ID
   * @param {boolean} enabled - 是否启用
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  toggle: async function (workspaceSlug, instanceId, enabled) {
    try {
      const response = await fetch(
        `${API_BASE}/workspace/${workspaceSlug}/assistants/${instanceId}`,
        {
          method: "PATCH",
          headers: baseHeaders(),
          body: JSON.stringify({ enabled }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "更新助手状态失败");
      }

      const result = await response.json();
      this.invalidateListCache(workspaceSlug);
      this.notifyUpdated(workspaceSlug);
      return result;
    } catch (error) {
      console.error("更新助手状态失败:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * 重命名助手
   * @param {string} workspaceSlug - Workspace slug
   * @param {string} instanceId - 助手实例 ID
   * @param {string} instanceName - 新名称
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  rename: async function (workspaceSlug, instanceId, instanceName) {
    try {
      const response = await fetch(
        `${API_BASE}/workspace/${workspaceSlug}/assistants/${instanceId}`,
        {
          method: "PATCH",
          headers: baseHeaders(),
          body: JSON.stringify({ instanceName }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "重命名助手失败");
      }

      const result = await response.json();
      this.invalidateListCache(workspaceSlug);
      this.notifyUpdated(workspaceSlug);
      return result;
    } catch (error) {
      console.error("重命名助手失败:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * 卸载助手
   * @param {string} workspaceSlug - Workspace slug
   * @param {string} instanceId - 助手实例 ID
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  uninstall: async function (workspaceSlug, instanceId) {
    try {
      const response = await fetch(
        `${API_BASE}/workspace/${workspaceSlug}/assistants/${instanceId}`,
        {
          method: "DELETE",
          headers: baseHeaders(),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "卸载助手失败");
      }

      const result = await response.json();
      this.invalidateListCache(workspaceSlug);
      this.notifyUpdated(workspaceSlug);
      return result;
    } catch (error) {
      console.error("卸载助手失败:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * 更新助手配置（包括权限模式、工具白名单等）
   * @param {string} workspaceSlug - Workspace slug
   * @param {string} instanceId - 助手实例 ID
   * @param {Object} customConfig - 自定义配置
   * @param {string} [customConfig.permissionMode] - 权限模式
   * @param {string[]} [customConfig.allowedTools] - 允许的工具
   * @param {string[]} [customConfig.autoApprovedTools] - 自动批准的工具
   * @param {string} [customConfig.overrideModel] - 覆盖模型
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  updateConfig: async function (workspaceSlug, instanceId, customConfig) {
    try {
      const response = await fetch(
        `${API_BASE}/workspace/${workspaceSlug}/assistants/${instanceId}`,
        {
          method: "PATCH",
          headers: baseHeaders(),
          body: JSON.stringify({ customConfig }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "更新助手配置失败");
      }

      const result = await response.json();
      this.invalidateListCache(workspaceSlug);
      this.notifyUpdated(workspaceSlug);
      return result;
    } catch (error) {
      console.error("更新助手配置失败:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * 获取助手详情（包括配置信息）
   * @param {string} workspaceSlug - Workspace slug
   * @param {string} instanceId - 助手实例 ID
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  get: async function (workspaceSlug, instanceId) {
    try {
      const response = await fetch(
        `${API_BASE}/workspace/${workspaceSlug}/assistants/${instanceId}`,
        {
          method: "GET",
          headers: baseHeaders(),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "获取助手详情失败");
      }

      return await response.json();
    } catch (error) {
      console.error("获取助手详情失败:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

/**
 * 权限模式选项
 */
export const PERMISSION_MODES = [
  {
    value: "default",
    label: "默认模式",
    description: "只读工具自动通过，写入/执行类需要确认",
  },
  {
    value: "acceptEdits",
    label: "接受编辑",
    description: "写入类工具自动通过，执行类仍需确认",
  },
  {
    value: "bypass",
    label: "完全信任",
    description: "所有工具自动通过（需要管理员权限）",
  },
  {
    value: "plan",
    label: "计划模式",
    description: "仅生成计划，不执行高危操作",
  },
];

export default WorkspaceAssistant;
