import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";
import WorkspaceAssistant from "@/models/workspaceAssistant";

/**
 * 助手库 API 调用封装
 * 提供助手模板的浏览、查询和安装功能
 */
const AssistantLibrary = {
  /**
   * 列出所有助手模板
   * @param {Object} filters - 筛选条件
   * @param {string} filters.category - 分类筛选
   * @param {string} filters.industry - 行业筛选
   * @param {string} filters.search - 搜索关键词
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  list: async function (filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.category) params.append("category", filters.category);
      if (filters.industry) params.append("industry", filters.industry);
      if (filters.search) params.append("search", filters.search);

      const queryString = params.toString();
      const url = `${API_BASE}/assistant-library/templates${
        queryString ? `?${queryString}` : ""
      }`;

      const response = await fetch(url, {
        method: "GET",
        headers: baseHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching assistant templates:", error);
      return {
        success: false,
        error: error.message || "获取助手模板失败",
      };
    }
  },

  /**
   * 获取单个助手模板详情
   * @param {string} id - 模板 ID
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  get: async function (id) {
    try {
      const response = await fetch(
        `${API_BASE}/assistant-library/templates/${id}`,
        {
          method: "GET",
          headers: baseHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching assistant template:", error);
      return {
        success: false,
        error: error.message || "获取助手详情失败",
      };
    }
  },

  // 别名方法，为了兼容 CreateAssistant 组件
  getTemplate: async function (id) {
    return this.get(id);
  },

  /**
   * 创建助手模板（仅 admin）
   * @param {Object} data - 助手模板数据
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  create: async function (data) {
    try {
      const response = await fetch(`${API_BASE}/assistant-library/templates`, {
        method: "POST",
        headers: {
          ...baseHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating assistant template:", error);
      return {
        success: false,
        error: error.message || "创建助手失败",
      };
    }
  },

  /**
   * 更新助手模板（仅 admin）
   * @param {string} id - 模板 ID
   * @param {Object} data - 更新数据
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  update: async function (id, data) {
    try {
      const response = await fetch(
        `${API_BASE}/assistant-library/templates/${id}`,
        {
          method: "PATCH",
          headers: {
            ...baseHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Error updating assistant template:", error);
      return {
        success: false,
        error: error.message || "更新助手失败",
      };
    }
  },

  /**
   * 删除助手模板（仅 admin）
   * @param {string} id - 模板 ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  delete: async function (id) {
    try {
      const response = await fetch(
        `${API_BASE}/assistant-library/templates/${id}`,
        {
          method: "DELETE",
          headers: baseHeaders(),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Error deleting assistant template:", error);
      return {
        success: false,
        error: error.message || "删除助手失败",
      };
    }
  },

  /**
   * 安装助手到 Workspace
   * @param {Object} data - 安装数据
   * @param {string} data.templateId - 模板 ID
   * @param {string} data.workspaceSlug - Workspace slug
   * @param {string} data.instanceName - 自定义名称（可选）
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  install: async function (data) {
    try {
      const response = await fetch(`${API_BASE}/assistant-library/install`, {
        method: "POST",
        headers: {
          ...baseHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      const result = await response.json();
      WorkspaceAssistant.invalidateListCache(data.workspaceSlug);
      WorkspaceAssistant.notifyUpdated(data.workspaceSlug);
      return result;
    } catch (error) {
      console.error("Error installing assistant:", error);
      return {
        success: false,
        error: error.message || "安装助手失败",
      };
    }
  },

  // ==================== 预配置模板 API ====================

  /**
   * 获取预配置模板列表（开箱即用的 AI 员工模板）
   * @param {string} category - 可选，按分类筛选
   * @returns {Promise<{success: boolean, data?: {presets: Array, categories: Array}, error?: string}>}
   */
  getPresets: async function (category = null) {
    try {
      const params = new URLSearchParams();
      if (category && category !== "全部") {
        params.append("category", category);
      }

      const queryString = params.toString();
      const url = `${API_BASE}/assistant-library/presets${
        queryString ? `?${queryString}` : ""
      }`;

      const response = await fetch(url, {
        method: "GET",
        headers: baseHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching preset templates:", error);
      return {
        success: false,
        error: error.message || "获取预配置模板失败",
      };
    }
  },

  /**
   * 从预配置模板创建 AI 员工
   * @param {string} presetId - 预配置模板 ID
   * @param {Object} customizations - 可选，自定义配置
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  createFromPreset: async function (presetId, customizations = {}) {
    try {
      const response = await fetch(
        `${API_BASE}/assistant-library/create-from-preset`,
        {
          method: "POST",
          headers: {
            ...baseHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ presetId, customizations }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating from preset:", error);
      return {
        success: false,
        error: error.message || "从预配置模板创建失败",
      };
    }
  },

  /**
   * 获取所有分类列表
   * @returns {Promise<{success: boolean, data?: Array<string>, error?: string}>}
   */
  getCategories: async function () {
    try {
      const response = await fetch(`${API_BASE}/assistant-library/categories`, {
        method: "GET",
        headers: baseHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching categories:", error);
      return {
        success: false,
        error: error.message || "获取分类列表失败",
      };
    }
  },

  /**
   * 获取所有行业列表
   * @returns {Promise<{success: boolean, data?: Array<string>, error?: string}>}
   */
  getIndustries: async function () {
    try {
      const response = await fetch(`${API_BASE}/assistant-library/industries`, {
        method: "GET",
        headers: baseHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching industries:", error);
      return {
        success: false,
        error: error.message || "获取行业列表失败",
      };
    }
  },

  /**
   * 测试外部平台连接
   * @param {Object} data - 平台配置
   * @param {string} data.platformType - 平台类型 (dify, coze, fastgpt)
   * @param {Object} data.platformConfig - 平台配置 (baseUrl, apiKey, appId 等)
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  testConnection: async function (data) {
    try {
      const response = await fetch(
        `${API_BASE}/assistant-library/test-connection`,
        {
          method: "POST",
          headers: {
            ...baseHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Error testing platform connection:", error);
      return {
        success: false,
        error: error.message || "测试连接失败",
      };
    }
  },

  /**
   * 上传助手头像
   * @param {FormData} formData - 包含文件的 FormData
   * @returns {Promise<{success: boolean, filename?: string, error?: string}>}
   */
  uploadIcon: async function (formData) {
    try {
      const response = await fetch(
        `${API_BASE}/assistant-library/upload-icon`,
        {
          method: "POST",
          body: formData,
          headers: baseHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error("上传头像失败");
      }

      return await response.json();
    } catch (error) {
      console.error("Error uploading assistant icon:", error);
      return {
        success: false,
        error: error.message || "上传头像失败",
      };
    }
  },

  /**
   * 获取助手头像 URL
   * @param {string} filename - 文件名或路径
   * @returns {string} 头像 URL
   */
  getIconUrl: function (filename) {
    if (!filename) return null;

    // 如果已经是完整 URL，直接返回
    if (filename.startsWith("http://") || filename.startsWith("https://")) {
      return filename;
    }

    // 如果是以 / 开头的相对路径（如 /ai-employees/clara.jpg），直接返回
    if (filename.startsWith("/")) {
      return filename;
    }

    // 否则构建 API 路径（上传的文件）
    return `${API_BASE}/assistant-library/icon/${filename}`;
  },

  /**
   * 获取所有可用的 Skill 能力包
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  listSkills: async function () {
    try {
      const response = await fetch(`${API_BASE}/assistant-library/skills`, {
        method: "GET",
        headers: baseHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching skills:", error);
      return {
        success: false,
        error: error.message || "获取 Skill 列表失败",
      };
    }
  },
};

export default AssistantLibrary;
