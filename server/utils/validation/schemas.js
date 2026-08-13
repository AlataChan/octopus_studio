/**
 * @fileoverview Joi 验证 Schema 定义
 * V2 全局输入验证 - 为核心 API 端点提供结构化验证
 */
const Joi = require("joi");

/**
 * UUID v4 格式验证
 */
const uuidSchema = Joi.string().uuid({ version: "uuidv4" });
const assistantTemplateIdSchema = Joi.string()
  .trim()
  .min(1)
  .max(128)
  .pattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

/**
 * 助手库相关 Schema
 */
const assistantLibrary = {
  /**
   * 安装助手到 Workspace
   */
  install: Joi.object({
    templateId: assistantTemplateIdSchema.required().messages({
      "string.empty": "templateId 不能为空",
      "string.min": "templateId 不能为空",
      "string.max": "templateId 长度不能超过 128 个字符",
      "string.pattern.base": "templateId 格式无效",
      "any.required": "templateId 是必填字段",
    }),
    workspaceSlug: Joi.string().max(255).required().messages({
      "string.max": "workspaceSlug 长度不能超过 255 个字符",
      "any.required": "workspaceSlug 是必填字段",
    }),
    instanceName: Joi.string().max(100).allow(null, "").optional().messages({
      "string.max": "instanceName 长度不能超过 100 个字符",
    }),
    customConfig: Joi.object().allow(null).optional(),
  }),

  /**
   * 更新助手配置
   */
  update: Joi.object({
    instanceName: Joi.string().max(100).allow(null, "").optional(),
    customConfig: Joi.object().allow(null).optional(),
    enabled: Joi.boolean().optional(),
    knowledgeModeOverride: Joi.string()
      .valid("workspace", "platform", "none")
      .allow(null)
      .optional(),
  }),

  /**
   * 创建助手模板（管理员）
   */
  createTemplate: Joi.object({
    name: Joi.string().max(100).required().messages({
      "string.max": "name 长度不能超过 100 个字符",
      "any.required": "name 是必填字段",
    }),
    description: Joi.string().max(2000).required(),
    icon: Joi.string().max(500).allow(null, "").optional(),
    category: Joi.string().max(50).required(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    industry: Joi.string().max(50).allow(null, "").optional(),
    systemPrompt: Joi.string().max(10000).allow(null, "").optional(),
    agentFlowId: uuidSchema.allow(null, "").optional(),
    defaultTools: Joi.object().allow(null).optional(),
    defaultMCPServers: Joi.object().allow(null).optional(),
    recommendedModel: Joi.string().max(100).allow(null, "").optional(),
    isGlobal: Joi.boolean().default(true),
    platformType: Joi.string().valid("native", "dify").default("native"),
    knowledgeMode: Joi.string()
      .valid("workspace", "platform", "none")
      .default("workspace"),
    exampleDialogs: Joi.array().items(Joi.object()).max(10).optional(),
    requiredPermissions: Joi.array().items(Joi.string()).max(20).optional(),
    internalRoles: Joi.array().items(Joi.object()).max(10).optional(),
  }),
};

/**
 * Agent Flow 相关 Schema
 */
const agentFlows = {
  /**
   * 创建/更新 Agent Flow
   */
  saveFlow: Joi.object({
    name: Joi.string().max(100).required(),
    config: Joi.object().required(),
    uuid: uuidSchema.allow(null, "").optional(),
  }),

  /**
   * 获取/删除 Agent Flow
   */
  flowId: Joi.object({
    uuid: uuidSchema.required().messages({
      "string.guid": "uuid 必须是有效的 UUID 格式",
      "any.required": "uuid 是必填字段",
    }),
  }),
};

/**
 * Workspace 相关 Schema
 */
const workspace = {
  /**
   * 创建 Workspace
   */
  create: Joi.object({
    name: Joi.string().max(255).required(),
  }),

  /**
   * 更新 Workspace
   */
  update: Joi.object({
    name: Joi.string().max(255).optional(),
    openAiTemp: Joi.number().min(0).max(2).optional(),
    openAiHistory: Joi.number().integer().min(0).max(100).optional(),
    openAiPrompt: Joi.string().max(10000).allow(null, "").optional(),
    similarityThreshold: Joi.number().min(0).max(1).optional(),
    topN: Joi.number().integer().min(1).max(100).optional(),
    chatMode: Joi.string().valid("chat", "query").optional(),
    queryRefusalResponse: Joi.string().max(1000).allow(null, "").optional(),
  }),
};

module.exports = {
  uuidSchema,
  assistantLibrary,
  agentFlows,
  workspace,
};
