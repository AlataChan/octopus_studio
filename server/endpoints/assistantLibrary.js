const { reqBody, userFromSession, multiUserMode } = require("../utils/http");
const { AssistantTemplate } = require("../models/assistantTemplate");
const { WorkspaceAssistant } = require("../models/workspaceAssistant");
const { Workspace } = require("../models/workspace");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { EventLogs } = require("../models/eventLogs");
const DifyProvider = require("../utils/AiProviders/dify");
const RagflowProvider = require("../utils/AiProviders/ragflow");
const N8nProvider = require("../utils/AiProviders/n8n");
const { handlePfpUpload } = require("../utils/files/multer");
const path = require("path");
const fs = require("fs");
const { validate, schemas } = require("../utils/validation");
const {
  getPresetById,
  getPresetsByCategory,
  getAllCategories,
} = require("../data/presetTemplates");
const { getOfficeProjection } = require("../utils/office/singleton");

function assistantLibraryEndpoints(app) {
  if (!app) return;

  // ==================== 预配置模板 API ====================

  /**
   * GET /api/assistant-library/presets
   * @description 获取所有预配置模板列表（开箱即用的 AI 员工模板）
   * @query {string} category - 可选，按分类筛选
   * @returns {Object} { success: true, data: { presets: [...], categories: [...] } }
   */
  app.get(
    "/assistant-library/presets",
    [validatedRequest],
    async (request, response) => {
      try {
        const { category } = request.query;

        // 获取预配置模板（根据分类筛选）
        const presets = getPresetsByCategory(category);
        const categories = getAllCategories();

        response.status(200).json({
          success: true,
          data: {
            presets,
            categories,
            total: presets.length,
          },
        });
      } catch (error) {
        console.error("Error listing preset templates:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/assistant-library/presets/:presetId
   * @description 获取单个预配置模板详情
   * @param {string} presetId - 预配置模板 ID
   * @returns {Object} { success: true, data: { preset: {...} } }
   */
  app.get(
    "/assistant-library/presets/:presetId",
    [validatedRequest],
    async (request, response) => {
      try {
        const { presetId } = request.params;
        const preset = getPresetById(presetId);

        if (!preset) {
          response.status(404).json({
            success: false,
            error: "预配置模板不存在",
          });
          return;
        }

        response.status(200).json({
          success: true,
          data: { preset },
        });
      } catch (error) {
        console.error("Error getting preset template:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /api/assistant-library/create-from-preset
   * @description 从预配置模板创建 AI 员工
   * @body {string} presetId - 预配置模板 ID
   * @body {Object} customizations - 可选，自定义配置（如 name, employeeName 等）
   * @returns {Object} { success: true, data: { template: {...} } }
   */
  app.post(
    "/assistant-library/create-from-preset",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { presetId, customizations = {} } = reqBody(request);

        // 获取预配置模板
        const preset = getPresetById(presetId);
        if (!preset) {
          response.status(404).json({
            success: false,
            error: "预配置模板不存在",
          });
          return;
        }

        // 合并预配置与自定义配置
        const mergedDefaultTools = Array.from(
          new Set([
            ...(preset.defaultTools || []),
            ...(preset.defaultSkills || []),
          ])
        );
        const templateData = {
          name: customizations.name || preset.name,
          description: customizations.description || preset.description,
          icon: customizations.icon || preset.icon,
          category: preset.category,
          tags: preset.tags || [],
          industry: preset.industry,
          systemPrompt: preset.systemPrompt,
          defaultTools: mergedDefaultTools,
          recommendedModel: preset.recommendedModel,
          knowledgeModeTemplate: preset.knowledgeModeTemplate || "workspace",
          platformType: "internal",
          sourceType: "builtin",
          pluginType: "agent",

          // 员工信息
          employeeName: customizations.employeeName || preset.employeeName,
          employeeTitle: customizations.employeeTitle || preset.employeeTitle,

          // 其他自定义配置
          ...customizations,
        };

        // 创建模板
        const { template, message } =
          await AssistantTemplate.create(templateData);

        if (!template) {
          response.status(400).json({
            success: false,
            error: message || "创建失败",
          });
          return;
        }

        // 记录事件日志
        await EventLogs.logEvent(
          "assistant_created_from_preset",
          {
            presetId,
            templateId: template.id,
            templateName: template.name,
          },
          user?.id
        );

        response.status(201).json({
          success: true,
          data: { template },
          message: `AI 员工「${template.name}」已成功创建`,
        });
      } catch (error) {
        console.error("Error creating from preset:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  // ==================== 现有模板 API ====================

  /**
   * GET /api/assistant-library/templates
   * List all assistant templates with optional filters
   */
  app.get(
    "/assistant-library/templates",
    [validatedRequest],
    async (request, response) => {
      try {
        const { category, industry, search, tags } = request.query;

        const filters = {};
        if (category) filters.category = category;
        if (industry) filters.industry = industry;
        if (search) filters.search = search;
        if (tags) {
          // Parse tags from query string (comma-separated)
          filters.tags = tags.split(",").map((t) => t.trim());
        }

        const result = await AssistantTemplate.list(filters);

        response.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("Error listing assistant templates:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/assistant-library/templates/:id
   * Get detailed information about a specific template
   */
  app.get(
    "/assistant-library/templates/:id",
    [validatedRequest],
    async (request, response) => {
      try {
        const { id } = request.params;
        const template = await AssistantTemplate.get(id);

        if (!template) {
          response.status(404).json({
            success: false,
            error: "Template not found",
          });
          return;
        }

        response.status(200).json({
          success: true,
          data: template,
        });
      } catch (error) {
        console.error("Error getting assistant template:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /api/assistant-library/templates
   * Create a new assistant template (admin only)
   */
  app.post(
    "/assistant-library/templates",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const data = reqBody(request);

        // 校验 knowledgeModeTemplate
        if (data.knowledgeModeTemplate) {
          const validModes = ["workspace", "platform", "none"];
          if (!validModes.includes(data.knowledgeModeTemplate)) {
            response.status(400).json({
              success: false,
              error: `Invalid knowledgeModeTemplate. Must be one of: ${validModes.join(", ")}`,
            });
            return;
          }
        }

        const { template, message } = await AssistantTemplate.create(data);

        if (!template) {
          response.status(400).json({
            success: false,
            error: message || "Failed to create template",
          });
          return;
        }

        await EventLogs.logEvent(
          "assistant_template_created",
          {
            templateId: template.id,
            templateName: template.name,
          },
          user?.id
        );

        response.status(201).json({
          success: true,
          data: template,
          message: "Assistant template created successfully",
        });
      } catch (error) {
        console.error("Error creating assistant template:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * PATCH /api/assistant-library/templates/:id
   * Update an assistant template (admin only)
   */
  app.patch(
    "/assistant-library/templates/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { id } = request.params;
        const updates = reqBody(request);

        // 校验 knowledgeModeTemplate
        if (updates.knowledgeModeTemplate) {
          const validModes = ["workspace", "platform", "none"];
          if (!validModes.includes(updates.knowledgeModeTemplate)) {
            response.status(400).json({
              success: false,
              error: `Invalid knowledgeModeTemplate. Must be one of: ${validModes.join(", ")}`,
            });
            return;
          }
        }

        const { template, message } = await AssistantTemplate.update(
          id,
          updates
        );

        if (!template) {
          response.status(400).json({
            success: false,
            error: message || "Failed to update template",
          });
          return;
        }

        await EventLogs.logEvent(
          "assistant_template_updated",
          {
            templateId: template.id,
            templateName: template.name,
          },
          user?.id
        );

        const officeProjection = getOfficeProjection();
        if (officeProjection) {
          await officeProjection.refreshAssistants();
        }

        response.status(200).json({
          success: true,
          data: template,
          message: "Assistant template updated successfully",
        });
      } catch (error) {
        console.error("Error updating assistant template:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * DELETE /api/assistant-library/templates/:id
   * Delete an assistant template (admin only)
   */
  app.delete(
    "/assistant-library/templates/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { id } = request.params;

        const success = await AssistantTemplate.delete(id);

        if (!success) {
          response.status(400).json({
            success: false,
            error: "Failed to delete template",
          });
          return;
        }

        await EventLogs.logEvent(
          "assistant_template_deleted",
          { templateId: id },
          user?.id
        );

        response.status(200).json({
          success: true,
          message: "Assistant template deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting assistant template:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /api/assistant-library/install
   * Install an assistant template to a workspace (all roles)
   * Users can only install to workspaces they have access to
   */
  app.post(
    "/assistant-library/install",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      validate(schemas.assistantLibrary.install),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        // 数据已经过 Joi 验证，直接从 body 获取
        const { templateId, workspaceSlug, instanceName, customConfig } =
          request.body;

        // Get workspace - this automatically checks user permissions
        // For default users, only returns workspaces they have access to
        const workspace = multiUserMode(response)
          ? await Workspace.getWithUser(user, { slug: workspaceSlug })
          : await Workspace.get({ slug: workspaceSlug });

        if (!workspace) {
          response.status(403).json({
            success: false,
            error:
              "Workspace not found or you don't have permission to access it",
          });
          return;
        }

        // Install assistant
        const { assistant, message } = await WorkspaceAssistant.install(
          workspace.id,
          templateId,
          instanceName,
          customConfig
        );

        if (!assistant) {
          response.status(400).json({
            success: false,
            error: message || "Failed to install assistant",
          });
          return;
        }

        const officeProjection = getOfficeProjection();
        if (officeProjection) {
          await officeProjection.refreshAssistants();
        }

        await EventLogs.logEvent(
          "assistant_installed",
          {
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            templateId,
            assistantId: assistant.id,
          },
          user?.id
        );

        response.status(201).json({
          success: true,
          data: {
            instanceId: assistant.id,
            workspaceSlug,
            templateId,
          },
          message: "Assistant installed successfully",
        });
      } catch (error) {
        console.error("Error installing assistant:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/assistant-library/categories
   * Get all unique categories
   */
  app.get(
    "/assistant-library/categories",
    [validatedRequest],
    async (request, response) => {
      try {
        const categories = await AssistantTemplate.getCategories();
        response.status(200).json({
          success: true,
          data: categories,
        });
      } catch (error) {
        console.error("Error getting categories:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/assistant-library/industries
   * Get all unique industries
   */
  app.get(
    "/assistant-library/industries",
    [validatedRequest],
    async (request, response) => {
      try {
        const industries = await AssistantTemplate.getIndustries();
        response.status(200).json({
          success: true,
          data: industries,
        });
      } catch (error) {
        console.error("Error getting industries:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /api/assistant-library/test-connection
   * Test connection to external platform (Dify, Coze, etc.)
   * Only accessible by admin/manager
   */
  app.post(
    "/assistant-library/test-connection",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { platformType, platformConfig } = reqBody(request);

        if (!platformType || !platformConfig) {
          return response.status(400).json({
            success: false,
            error: "platformType 和 platformConfig 是必需的",
          });
        }

        let result;
        switch (platformType) {
          case "dify":
            result = await DifyProvider.testConnection(platformConfig);
            break;
          case "ragflow":
            result = await RagflowProvider.testConnection(platformConfig);
            break;
          case "n8n":
            result = await N8nProvider.testConnection(platformConfig);
            break;
          case "coze":
          case "fastgpt":
            result = {
              success: false,
              message: `平台 ${platformType} 暂未支持`,
            };
            break;
          default:
            result = {
              success: false,
              message: `未知的平台类型: ${platformType}`,
            };
        }

        response.status(200).json(result);
      } catch (error) {
        console.error("Error testing platform connection:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /api/assistant-library/upload-icon
   * Upload assistant icon/avatar
   */
  app.post(
    "/assistant-library/upload-icon",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
      handlePfpUpload,
    ],
    async function (request, response) {
      try {
        const uploadedFileName = request.randomFileName;
        if (!uploadedFileName) {
          return response.status(400).json({
            success: false,
            message: "文件上传失败",
          });
        }

        // 返回文件名，前端将使用 /api/assistant-library/icon/:filename 来访问
        return response.status(200).json({
          success: true,
          filename: uploadedFileName,
        });
      } catch (error) {
        console.error("Error uploading assistant icon:", error);
        response.status(500).json({
          success: false,
          message: "服务器内部错误",
        });
      }
    }
  );

  /**
   * GET /api/assistant-library/icon/:filename
   * Fetch assistant icon by filename
   */
  app.get(
    "/assistant-library/icon/:filename",
    async function (request, response) {
      try {
        const { filename } = request.params;
        const pfpPath =
          process.env.NODE_ENV === "development"
            ? path.resolve(__dirname, `../storage/assets/pfp/${filename}`)
            : path.resolve(process.env.STORAGE_DIR, `assets/pfp/${filename}`);

        if (!fs.existsSync(pfpPath)) {
          response.sendStatus(204);
          return;
        }

        const buffer = fs.readFileSync(pfpPath);
        response.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Content-Length": buffer.length,
        });
        response.end(buffer);
        return;
      } catch (error) {
        console.error("Error fetching assistant icon:", error);
        response.status(500).json({ message: "服务器内部错误" });
      }
    }
  );

  // ==================== Skills API ====================

  /**
   * GET /api/assistant-library/skills
   * @description 获取所有可用的 Skill 能力包列表
   * @returns {Object} { success: true, data: { skills: [...], categories: [...] } }
   */
  app.get(
    "/assistant-library/skills",
    [validatedRequest],
    async (_request, response) => {
      try {
        const { skillRegistry } = require("../utils/skills");

        // Ensure Skill Hub markdown skills are available in the runtime registry
        // so the Assistant Library can offer them as capability packages.
        try {
          await skillRegistry.refreshFromSkillHubLocalRegistry?.();
        } catch (error) {
          console.warn(
            "[AssistantLibrary] Failed to refresh Skill Hub skills:",
            error.message
          );
        }

        // 获取所有 Skill 的元数据
        const skills = skillRegistry.listSkillMetadata();
        const categories = skillRegistry.getCategories();

        response.status(200).json({
          success: true,
          data: {
            skills,
            categories,
            total: skills.length,
          },
        });
      } catch (error) {
        console.error("Error listing skills:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { assistantLibraryEndpoints };
