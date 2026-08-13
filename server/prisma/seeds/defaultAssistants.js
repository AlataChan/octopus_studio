/**
 * 默认 AI 助手模板 Seed 数据
 *
 * @description
 * 从 presetTemplates.js 导入企业级 AI 助手数据，保持向后兼容。
 * 数据统一存储在 presetTemplates.js 中，本文件仅作为适配层。
 *
 * 包含 4 个企业级 AI 助手：
 * 1. AI合同审核 - 法务合规
 * 2. AI票证识别 - OCR 识别
 * 3. AI简历筛选 - HR 招聘
 * 4. AI公文助手 - 行政办公
 *
 * @deprecated 建议直接使用 presetTemplates.js 中的数据
 */

const { v4: uuidv4 } = require("uuid");
const { PRESET_TEMPLATES } = require("../../data/presetTemplates.catalog");

/**
 * 企业级助手模板 ID 映射
 */
const ENTERPRISE_ASSISTANT_IDS = {
  contractReview: "employee-legal-contract-reviewer",
  documentOCR: "employee-ocr-document-scanner",
  resumeScreening: "employee-hr-resume-screener",
  officialDoc: "employee-admin-document-writer",
};

/**
 * 从 presetTemplates 中提取模板并转换为 Seed 格式
 * @param {string} templateId - 模板 ID
 * @returns {Object} Seed 格式的助手数据
 */
function convertToSeedFormat(templateId) {
  const template = PRESET_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    console.warn(`[defaultAssistants] 模板 ${templateId} 未找到`);
    return null;
  }

  const persona = template.personaTemplates?.[0]?.persona || {};

  return {
    id: uuidv4(),
    name: template.name,
    description: template.description,
    icon: template.icon,
    category: template.category,
    tags: JSON.stringify(template.tags || []),
    industry: template.industry,
    employeeName: persona.employeeName || template.employeeName,
    employeeTitle: persona.employeeTitle || template.employeeTitle,
    employeeBio: persona.employeeBio || "",
    skills: JSON.stringify(persona.skillTags || []),
    systemPrompt: template.systemPrompt,
    defaultTools: JSON.stringify(template.defaultTools || []),
    recommendedModel: template.recommendedModel,
    knowledgeModeTemplate: template.knowledgeModeTemplate || "workspace",
    isGlobal: true,
    isDefault: false,
  };
}

/**
 * AI合同审核助手
 */
const contractReviewAssistant = convertToSeedFormat(
  ENTERPRISE_ASSISTANT_IDS.contractReview
);

/**
 * AI票证识别助手
 */
const documentOCRAssistant = convertToSeedFormat(
  ENTERPRISE_ASSISTANT_IDS.documentOCR
);

/**
 * AI简历筛选助手
 */
const resumeScreeningAssistant = convertToSeedFormat(
  ENTERPRISE_ASSISTANT_IDS.resumeScreening
);

/**
 * AI公文助手
 */
const officialDocAssistant = convertToSeedFormat(
  ENTERPRISE_ASSISTANT_IDS.officialDoc
);

module.exports = {
  contractReviewAssistant,
  documentOCRAssistant,
  resumeScreeningAssistant,
  officialDocAssistant,
};
