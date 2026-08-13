const prisma = require("../utils/prisma");
const { v4: uuidv4 } = require("uuid");

/**
 * @typedef {Object} AssistantTemplate
 * @property {string} id - ID of the template
 * @property {string} name - Name of the assistant
 * @property {string} description - Description of the assistant
 * @property {string|null} icon - Icon URL or emoji
 * @property {string} category - Category (e.g., 营销, 研发, 客服)
 * @property {string|null} seedCategory - Seed classification (official/demo/test), null for user content
 * @property {string[]|null} tags - Tags array
 * @property {string|null} industry - Industry (e.g., 金融, 医疗, 制造)
 * @property {string|null} systemPrompt - System prompt for the assistant
 * @property {string|null} agentFlowId - Associated Agent Flow ID
 * @property {Object|null} defaultTools - Default tools configuration
 * @property {Object|null} defaultMCPServers - Default MCP servers
 * @property {string|null} recommendedModel - Recommended model type
 * @property {string|null} sourceUrl - Source markdown URL
 * @property {string|null} sourceLicense - Source content license
 * @property {string|null} sourceCommit - Source repository commit hash
 * @property {string|null} vibe - Persona subtitle
 * @property {string|null} color - Theme color hex
 * @property {{type: string, url: string|null, license: string|null, commit: string|null, originPath: string|null, contentHash: string|null}} source - Structured source metadata
 * @property {boolean} isGlobal - Whether template is global
 * @property {string|null} tenantId - Tenant ID (reserved for V2)
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 */

const AssistantTemplate = {
  // Writable fields for create/update operations
  writable: [
    "name",
    "description",
    "icon",
    "category",
    "tags",
    "industry",
    "systemPrompt",
    "agentFlowId",
    "internalRoles",
    "defaultTools",
    "defaultMCPServers",
    "recommendedModel",
    "sourceUrl",
    "sourceLicense",
    "sourceCommit",
    "vibe",
    "color",
    "platformType",
    "platformConfig",
    "knowledgeModeTemplate", // 新增：知识模式
    "isGlobal",
    "isDefault", // 是否为默认助手
    "tenantId",
    // AI 员工相关字段
    "avatarUrl",
    "employeeName",
    "employeeTitle",
    "employeeBio",
    "skills",
    "workExperience",
    "certifications",
  ],

  jsonFields: [
    "tags",
    "internalRoles",
    "defaultTools",
    "defaultMCPServers",
    "defaultAllowedTools",
    "defaultAutoApprovedTools",
    "resourceScopes",
    "platformConfig",
    "skills",
    "workExperience",
    "certifications",
  ],

  /**
   * Serialize model write data so JSON-capable fields can accept objects/arrays.
   * Undefined keys are stripped so update/upsert paths can stay partial.
   *
   * @param {Object} data
   * @param {{withDefaults?: boolean, allowId?: boolean}} [options]
   * @returns {Object}
   */
  _prepareWriteData: function (
    data = {},
    { withDefaults = false, allowId = false } = {}
  ) {
    const payload = {
      id: allowId ? data.id || uuidv4() : undefined,
      name: withDefaults ? data.name || "未命名助手" : data.name,
      description: withDefaults ? data.description || "" : data.description,
      icon: data.icon ?? (withDefaults ? null : undefined),
      category: withDefaults ? data.category || "通用" : data.category,
      tags: data.tags,
      industry: data.industry ?? (withDefaults ? null : undefined),
      systemPrompt: data.systemPrompt ?? (withDefaults ? null : undefined),
      agentFlowId: data.agentFlowId ?? (withDefaults ? null : undefined),
      internalRoles: data.internalRoles ?? (withDefaults ? null : undefined),
      defaultTools: data.defaultTools ?? (withDefaults ? null : undefined),
      defaultMCPServers:
        data.defaultMCPServers ?? (withDefaults ? null : undefined),
      recommendedModel:
        data.recommendedModel ?? (withDefaults ? null : undefined),
      sourceType: data.sourceType ?? (withDefaults ? "builtin" : undefined),
      pluginType: data.pluginType ?? (withDefaults ? "agent" : undefined),
      version: data.version ?? (withDefaults ? null : undefined),
      contentHash: data.contentHash ?? (withDefaults ? null : undefined),
      originPath: data.originPath ?? (withDefaults ? null : undefined),
      defaultPermissionMode:
        data.defaultPermissionMode ?? (withDefaults ? "default" : undefined),
      defaultAllowedTools:
        data.defaultAllowedTools ?? (withDefaults ? null : undefined),
      defaultAutoApprovedTools:
        data.defaultAutoApprovedTools ?? (withDefaults ? null : undefined),
      resourceScopes: data.resourceScopes ?? (withDefaults ? null : undefined),
      avatarUrl: data.avatarUrl ?? (withDefaults ? null : undefined),
      employeeName: data.employeeName ?? (withDefaults ? null : undefined),
      employeeTitle: data.employeeTitle ?? (withDefaults ? null : undefined),
      employeeBio: data.employeeBio ?? (withDefaults ? null : undefined),
      skills: data.skills ?? (withDefaults ? null : undefined),
      workExperience: data.workExperience ?? (withDefaults ? null : undefined),
      certifications: data.certifications ?? (withDefaults ? null : undefined),
      platformType:
        data.platformType ?? (withDefaults ? "internal" : undefined),
      platformConfig: data.platformConfig ?? (withDefaults ? null : undefined),
      knowledgeModeTemplate:
        data.knowledgeModeTemplate ?? (withDefaults ? "workspace" : undefined),
      sourceUrl: data.sourceUrl ?? (withDefaults ? null : undefined),
      sourceLicense: data.sourceLicense ?? (withDefaults ? null : undefined),
      sourceCommit: data.sourceCommit ?? (withDefaults ? null : undefined),
      vibe: data.vibe ?? (withDefaults ? null : undefined),
      color: data.color ?? (withDefaults ? null : undefined),
      isGlobal:
        data.isGlobal !== undefined
          ? data.isGlobal
          : withDefaults
            ? true
            : undefined,
      isDefault:
        data.isDefault !== undefined
          ? data.isDefault
          : withDefaults
            ? false
            : undefined,
      tenantId: data.tenantId ?? (withDefaults ? null : undefined),
    };

    return Object.entries(payload).reduce((acc, [key, value]) => {
      if (typeof value === "undefined") return acc;

      if (this.jsonFields.includes(key)) {
        if (value === null) {
          acc[key] = null;
          return acc;
        }

        acc[key] = typeof value === "object" ? JSON.stringify(value) : value;
        return acc;
      }

      acc[key] = value;
      return acc;
    }, {});
  },

  /**
   * Create a new assistant template
   * @param {Object} data - Template data
   * @returns {Promise<{template: AssistantTemplate|null, message: string}>}
   */
  create: async function (data = {}) {
    try {
      const template = await prisma.assistant_templates.create({
        data: this._prepareWriteData(data, {
          withDefaults: true,
          allowId: true,
        }),
      });

      return { template: this._formatTemplate(template), message: null };
    } catch (error) {
      console.error("Error creating assistant template:", error);
      return { template: null, message: error.message };
    }
  },

  /**
   * Get template by ID
   * @param {string} id - Template ID
   * @returns {Promise<AssistantTemplate|null>}
   */
  get: async function (id) {
    try {
      const template = await prisma.assistant_templates.findUnique({
        where: { id },
      });
      return template ? this._formatTemplate(template) : null;
    } catch (error) {
      console.error("Error getting assistant template:", error);
      return null;
    }
  },

  /**
   * List all templates with optional filters
   * @param {Object} filters - Filter options
   * @param {string} filters.category - Filter by category
   * @param {string[]} filters.tags - Filter by tags
   * @param {string} filters.search - Search in name/description
   * @param {string} filters.industry - Filter by industry
   * @param {boolean} filters.isGlobal - Filter by global status
   * @returns {Promise<{templates: AssistantTemplate[], categories: string[], total: number}>}
   */
  list: async function (filters = {}) {
    try {
      const where = {};

      // Filter by category
      if (filters.category) {
        where.category = filters.category;
      }

      // Filter by industry
      if (filters.industry) {
        where.industry = filters.industry;
      }

      // Filter by global status
      if (filters.isGlobal !== undefined) {
        where.isGlobal = filters.isGlobal;
      }

      // Search in name and description
      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search } },
          { description: { contains: filters.search } },
        ];
      }

      const templates = await prisma.assistant_templates.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      // Filter by tags if provided (since tags are stored as JSON string)
      let filteredTemplates = templates;
      if (filters.tags && filters.tags.length > 0) {
        filteredTemplates = templates.filter((template) => {
          if (!template.tags) return false;
          const templateTags = JSON.parse(template.tags);
          return filters.tags.some((tag) => templateTags.includes(tag));
        });
      }

      // Get unique categories
      const categories = [
        ...new Set(templates.map((t) => t.category).filter(Boolean)),
      ];

      return {
        templates: filteredTemplates.map((t) => this._formatTemplate(t)),
        categories,
        total: filteredTemplates.length,
      };
    } catch (error) {
      console.error("Error listing assistant templates:", error);
      return { templates: [], categories: [], total: 0 };
    }
  },

  /**
   * Update template by ID
   * @param {string} id - Template ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{template: AssistantTemplate|null, message: string|null}>}
   */
  update: async function (id, updates = {}) {
    try {
      // Filter only writable fields
      const writableUpdates = {};
      Object.keys(updates).forEach((key) => {
        if (this.writable.includes(key)) {
          writableUpdates[key] = updates[key];
        }
      });

      const data = this._prepareWriteData(writableUpdates);

      const template = await prisma.assistant_templates.update({
        where: { id },
        data,
      });

      return { template: this._formatTemplate(template), message: null };
    } catch (error) {
      console.error("Error updating assistant template:", error);
      return { template: null, message: error.message };
    }
  },

  /**
   * Delete template by ID
   * @param {string} id - Template UUID
   * @returns {Promise<boolean>}
   */
  delete: async function (id) {
    try {
      await prisma.assistant_templates.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      console.error("Error deleting assistant template:", error);
      return false;
    }
  },

  /**
   * Get templates by category
   * @param {string} category - Category name
   * @returns {Promise<AssistantTemplate[]>}
   */
  getByCategory: async function (category) {
    try {
      const templates = await prisma.assistant_templates.findMany({
        where: { category },
        orderBy: { createdAt: "desc" },
      });
      return templates.map((t) => this._formatTemplate(t));
    } catch (error) {
      console.error("Error getting templates by category:", error);
      return [];
    }
  },

  /**
   * Get all default templates (isDefault = true)
   * @returns {Promise<AssistantTemplate[]>}
   */
  getDefaultTemplates: async function () {
    try {
      const templates = await prisma.assistant_templates.findMany({
        where: { isDefault: true },
        orderBy: { createdAt: "desc" },
      });
      return templates.map((t) => this._formatTemplate(t));
    } catch (error) {
      console.error("Error getting default templates:", error);
      return [];
    }
  },

  /**
   * Format template object (parse JSON fields)
   * @private
   * @param {Object} template - Raw template from database
   * @returns {AssistantTemplate}
   */
  _formatTemplate: function (template) {
    if (!template) return null;

    // 安全的 JSON 解析函数
    const safeJsonParse = (value, defaultValue = null) => {
      // 如果值为空,返回默认值
      if (!value) return defaultValue;

      // 如果已经是对象,直接返回
      if (typeof value === "object") return value;

      // 如果不是字符串,返回默认值
      if (typeof value !== "string") return defaultValue;

      // 尝试解析 JSON 字符串
      try {
        return JSON.parse(value);
      } catch (e) {
        console.warn(
          "[AssistantTemplate] Failed to parse JSON:",
          value,
          e.message
        );
        return defaultValue;
      }
    };

    return {
      ...template,
      tags: safeJsonParse(template.tags, []),
      internalRoles: safeJsonParse(template.internalRoles, []),
      defaultTools: safeJsonParse(template.defaultTools, null),
      defaultMCPServers: safeJsonParse(template.defaultMCPServers, null),
      defaultAllowedTools: safeJsonParse(template.defaultAllowedTools, []),
      defaultAutoApprovedTools: safeJsonParse(
        template.defaultAutoApprovedTools,
        []
      ),
      resourceScopes: safeJsonParse(template.resourceScopes, null),
      platformConfig: safeJsonParse(template.platformConfig, null),
      // AI 员工相关 JSON 字段
      skills: safeJsonParse(template.skills, []),
      workExperience: safeJsonParse(template.workExperience, []),
      certifications: safeJsonParse(template.certifications, []),
      source: {
        type: template.sourceType || "builtin",
        url: template.sourceUrl || null,
        license: template.sourceLicense || null,
        commit: template.sourceCommit || null,
        originPath: template.originPath || null,
        contentHash: template.contentHash || null,
      },
    };
  },

  /**
   * Upsert template rows imported from markdown/remote sources using originPath
   * as the durable identity key and contentHash for change detection.
   *
   * @param {Object} data
   * @returns {Promise<{template: AssistantTemplate|null, action: "create"|"update"|"skip"|"error", message?: string}>}
   */
  upsertByOriginPath: async function (data = {}) {
    try {
      if (!data.originPath) {
        return {
          template: null,
          action: "error",
          message: "originPath is required",
        };
      }

      const existing = await prisma.assistant_templates.findFirst({
        where: { originPath: data.originPath },
      });

      if (!existing) {
        const created = await prisma.assistant_templates.create({
          data: this._prepareWriteData(data, { allowId: true }),
        });
        return {
          template: this._formatTemplate(created),
          action: "create",
        };
      }

      if (existing.contentHash && existing.contentHash === data.contentHash) {
        return {
          template: this._formatTemplate(existing),
          action: "skip",
        };
      }

      const updated = await prisma.assistant_templates.update({
        where: { id: existing.id },
        data: this._prepareWriteData(data),
      });

      return {
        template: this._formatTemplate(updated),
        action: "update",
      };
    } catch (error) {
      console.error("Error upserting assistant template by originPath:", error);
      return {
        template: null,
        action: "error",
        message: error.message,
      };
    }
  },

  /**
   * Get all unique categories
   * @returns {Promise<string[]>}
   */
  getCategories: async function () {
    try {
      const templates = await prisma.assistant_templates.findMany({
        select: { category: true },
        distinct: ["category"],
      });
      return templates.map((t) => t.category).filter(Boolean);
    } catch (error) {
      console.error("Error getting categories:", error);
      return [];
    }
  },

  /**
   * Get all unique industries
   * @returns {Promise<string[]>}
   */
  getIndustries: async function () {
    try {
      const templates = await prisma.assistant_templates.findMany({
        select: { industry: true },
        distinct: ["industry"],
      });
      return templates.map((t) => t.industry).filter(Boolean);
    } catch (error) {
      console.error("Error getting industries:", error);
      return [];
    }
  },
};

module.exports = { AssistantTemplate };
