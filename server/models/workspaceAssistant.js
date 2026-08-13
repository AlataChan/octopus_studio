const prisma = require("../utils/prisma");
const { v4: uuidv4 } = require("uuid");
const { AssistantTemplate } = require("./assistantTemplate");
const { WorkspaceGraph } = require("./workspaceGraph");

/**
 * @typedef {Object} WorkspaceAssistant
 * @property {string} id - UUID of the workspace assistant instance
 * @property {number} workspaceId - ID of the workspace
 * @property {string} templateId - ID of the assistant template
 * @property {string|null} instanceName - Custom name for this instance
 * @property {Object|null} customConfig - Custom configuration overrides
 * @property {boolean} enabled - Whether the assistant is enabled
 * @property {string|null} category - Seed classification (official/demo/test), null for user content
 * @property {Date} createdAt - Creation timestamp
 */

const WorkspaceAssistant = {
  /**
   * Install an assistant template to a workspace
   * @param {number} workspaceId - Workspace ID
   * @param {string} templateId - Template ID
   * @param {string|null} instanceName - Optional custom name
   * @param {Object|null} customConfig - Optional custom configuration
   * @param {string} source - Source type: "hired" | "default" | "custom"
   * @returns {Promise<{assistant: WorkspaceAssistant|null, message: string|null}>}
   */
  install: async function (
    workspaceId,
    templateId,
    instanceName = null,
    customConfig = null,
    source = "hired"
  ) {
    try {
      // Verify template exists
      const template = await AssistantTemplate.get(templateId);
      if (!template) {
        return { assistant: null, message: "Template not found" };
      }

      // Check if already installed
      const existing = await prisma.workspace_assistants.findUnique({
        where: {
          workspaceId_templateId: {
            workspaceId,
            templateId,
          },
        },
      });

      if (existing) {
        return {
          assistant: null,
          message: "Assistant already installed in this workspace",
        };
      }

      const assistant = await prisma.workspace_assistants.create({
        data: {
          id: uuidv4(),
          workspaceId,
          templateId,
          instanceName,
          customConfig: customConfig ? JSON.stringify(customConfig) : null,
          enabled: true,
          category: template.seedCategory || null,
          source, // 添加来源字段
        },
        include: {
          template: true,
        },
      });

      // 【M6】在图谱中创建 assistant 节点
      try {
        const displayName = instanceName || template.name;
        await WorkspaceGraph.upsertNode({
          workspaceId,
          nodeId: `assistant:${assistant.id}`,
          type: "assistant",
          label: displayName,
          externalId: assistant.id,
          metadata: {
            templateId: template.id,
            templateName: template.name,
            category: template.category,
            tags: template.tags || [],
            platformType: template.platformType || null,
            knowledgeMode: template.knowledgeMode || "workspace",
            skills: template.skills || [],
            source, // 添加来源信息到图谱节点
          },
        });
      } catch (graphError) {
        console.error(
          "[WorkspaceAssistant] Failed to create graph node:",
          graphError
        );
        // 不阻塞助手安装流程
      }

      return { assistant: this._formatAssistant(assistant), message: null };
    } catch (error) {
      console.error("Error installing assistant:", error);
      return { assistant: null, message: error.message };
    }
  },

  /**
   * Get workspace assistant by ID
   * @param {string} id - Assistant instance UUID
   * @returns {Promise<WorkspaceAssistant|null>}
   */
  get: async function (id) {
    try {
      const assistant = await prisma.workspace_assistants.findUnique({
        where: { id },
        include: {
          template: true,
          workspace: true,
        },
      });
      return assistant ? this._formatAssistant(assistant) : null;
    } catch (error) {
      console.error("Error getting workspace assistant:", error);
      return null;
    }
  },

  /**
   * List all assistants installed in a workspace
   * @param {number} workspaceId - Workspace ID
   * @param {boolean} enabledOnly - Only return enabled assistants
   * @returns {Promise<WorkspaceAssistant[]>}
   */
  listByWorkspace: async function (workspaceId, enabledOnly = false) {
    try {
      const where = { workspaceId };
      if (enabledOnly) {
        where.enabled = true;
      }

      const rows = await prisma.workspace_assistants.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      return await this._withOptionalTemplates(rows);
    } catch (error) {
      console.error("Error listing workspace assistants:", error);
      return [];
    }
  },

  /**
   * Compatibility accessor for team orchestration/workflow confirmation.
   * Returns installed assistants with top-level employee aliases expected by
   * orchestration callers, while preserving the normal formatted model shape.
   * @param {number} workspaceId - Workspace ID
   * @param {boolean} enabledOnly - Only return enabled assistants
   * @returns {Promise<WorkspaceAssistant[]>}
   */
  forWorkspace: async function (workspaceId, enabledOnly = false) {
    try {
      const assistants = await this.listByWorkspace(workspaceId, enabledOnly);
      return assistants.map((assistant) => {
        const template = assistant.template || {};
        return {
          ...assistant,
          name:
            assistant.instanceName ||
            template.employeeName ||
            template.name ||
            "",
          title: template.employeeTitle || template.category || "",
          capabilities: Array.isArray(template.skills)
            ? template.skills
            : Array.isArray(template.tags)
              ? template.tags
              : [],
        };
      });
    } catch (error) {
      console.error(
        "Error listing workspace assistants for orchestration:",
        error
      );
      return [];
    }
  },

  /**
   * Update workspace assistant
   * @param {string} id - Assistant instance UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{assistant: WorkspaceAssistant|null, message: string|null}>}
   */
  update: async function (id, updates = {}) {
    try {
      const data = {};
      const allowedFields = [
        "instanceName",
        "customConfig",
        "enabled",
        "knowledgeModeOverride",
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          if (field === "customConfig") {
            data[field] = updates[field]
              ? JSON.stringify(updates[field])
              : null;
          } else {
            data[field] = updates[field];
          }
        }
      }

      const assistant = await prisma.workspace_assistants.update({
        where: { id },
        data,
        include: {
          template: true,
        },
      });

      return { assistant: this._formatAssistant(assistant), message: null };
    } catch (error) {
      console.error("Error updating workspace assistant:", error);
      return { assistant: null, message: error.message };
    }
  },

  /**
   * Enable or disable an assistant
   * @param {string} id - Assistant instance UUID
   * @param {boolean} enabled - Enable or disable
   * @returns {Promise<boolean>}
   */
  setEnabled: async function (id, enabled) {
    try {
      await prisma.workspace_assistants.update({
        where: { id },
        data: { enabled },
      });
      return true;
    } catch (error) {
      console.error("Error setting assistant enabled status:", error);
      return false;
    }
  },

  /**
   * Uninstall an assistant from a workspace
   * @param {string} id - Assistant instance UUID
   * @returns {Promise<boolean>}
   */
  uninstall: async function (id) {
    try {
      // 获取助手信息用于清理图谱
      const assistant = await prisma.workspace_assistants.findUnique({
        where: { id },
      });

      if (!assistant) {
        return false;
      }

      // 删除助手
      await prisma.workspace_assistants.delete({
        where: { id },
      });

      // 【M6】清理图谱节点
      try {
        await WorkspaceGraph.deleteNode({
          workspaceId: assistant.workspaceId,
          nodeId: `assistant:${id}`,
        });
      } catch (graphError) {
        console.error(
          "[WorkspaceAssistant] Failed to delete graph node:",
          graphError
        );
        // 不阻塞删除流程
      }

      return true;
    } catch (error) {
      console.error("Error uninstalling assistant:", error);
      return false;
    }
  },

  /**
   * Get assistant by workspace and template
   * @param {number} workspaceId - Workspace ID
   * @param {string} templateId - Template ID
   * @returns {Promise<WorkspaceAssistant|null>}
   */
  getByWorkspaceAndTemplate: async function (workspaceId, templateId) {
    try {
      const assistant = await prisma.workspace_assistants.findUnique({
        where: {
          workspaceId_templateId: {
            workspaceId,
            templateId,
          },
        },
        include: {
          template: true,
        },
      });
      return assistant ? this._formatAssistant(assistant) : null;
    } catch (error) {
      console.error(
        "Error getting assistant by workspace and template:",
        error
      );
      return null;
    }
  },

  /**
   * Get merged configuration (template defaults + custom overrides)
   * @param {string} id - Assistant instance UUID
   * @returns {Promise<Object|null>}
   */
  getMergedConfig: async function (id) {
    try {
      const assistant = await this.get(id);
      if (!assistant) return null;

      const template = assistant.template;
      const customConfig = assistant.customConfig || {};

      return {
        systemPrompt: customConfig.systemPrompt || template.systemPrompt,
        agentFlowId: customConfig.agentFlowId || template.agentFlowId,
        defaultTools: customConfig.defaultTools || template.defaultTools,
        defaultMCPServers:
          customConfig.defaultMCPServers || template.defaultMCPServers,
        recommendedModel:
          customConfig.recommendedModel || template.recommendedModel,
      };
    } catch (error) {
      console.error("Error getting merged config:", error);
      return null;
    }
  },

  /**
   * Get workspace assistant by instance ID (with template info)
   * @param {string} instanceId - Assistant instance UUID
   * @returns {Promise<Object|null>}
   */
  getById: async function (instanceId) {
    try {
      const assistant = await prisma.workspace_assistants.findUnique({
        where: { id: instanceId },
        include: {
          workspace: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
          },
        },
      });

      if (!assistant) return null;

      // Get template info
      const template = await AssistantTemplate.get(assistant.templateId);

      return {
        ...assistant,
        customConfig: assistant.customConfig
          ? JSON.parse(assistant.customConfig)
          : null,
        template: template ? AssistantTemplate._formatTemplate(template) : null,
      };
    } catch (error) {
      console.error("Error getting workspace assistant by ID:", error);
      return null;
    }
  },

  /**
   * Record assistant usage - updates lastUsedAt and increments usageCount
   * @param {string} instanceId - Assistant instance UUID
   * @returns {Promise<boolean>}
   */
  recordUsage: async function (instanceId) {
    try {
      await prisma.workspace_assistants.update({
        where: { id: instanceId },
        data: {
          lastUsedAt: new Date(),
          usageCount: { increment: 1 },
        },
      });
      return true;
    } catch (error) {
      console.error("Error recording assistant usage:", error);
      return false;
    }
  },

  /**
   * Get usage statistics for an assistant
   * @param {string} instanceId - Assistant instance UUID
   * @returns {Promise<{lastUsedAt: Date|null, usageCount: number}|null>}
   */
  getUsageStats: async function (instanceId) {
    try {
      const assistant = await prisma.workspace_assistants.findUnique({
        where: { id: instanceId },
        select: {
          lastUsedAt: true,
          usageCount: true,
        },
      });
      return assistant;
    } catch (error) {
      console.error("Error getting assistant usage stats:", error);
      return null;
    }
  },

  /**
   * Format assistant object (parse JSON fields and include template)
   * @private
   * @param {Object} assistant - Raw assistant from database
   * @returns {WorkspaceAssistant}
   */
  _formatAssistant: function (assistant) {
    if (!assistant) return null;

    const formatted = {
      ...assistant,
      customConfig: assistant.customConfig
        ? JSON.parse(assistant.customConfig)
        : null,
      // 使用统计字段保持原样，无需解析
      lastUsedAt: assistant.lastUsedAt || null,
      usageCount: assistant.usageCount || 0,
    };

    // Format template if included
    if (assistant.template) {
      formatted.template = AssistantTemplate._formatTemplate(
        assistant.template
      );
    }

    return formatted;
  },

  _withOptionalTemplates: async function (assistants = []) {
    return Promise.all(
      assistants.map(async (assistant) => {
        const template =
          assistant.template !== undefined
            ? assistant.template
            : assistant.templateId
              ? await AssistantTemplate.get(assistant.templateId)
              : null;
        return this._formatAssistant({ ...assistant, template });
      })
    );
  },
};

module.exports = { WorkspaceAssistant };
