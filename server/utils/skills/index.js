/**
 * Skill 系统入口
 *
 * @description
 * Skill 是一个"能力包"，包含：
 * - 绑定一组 MCP servers / Tools
 * - 提供若干 Flow 模板
 * - 附带配置 Schema（用于生成前端配置表单）
 *
 * 使用示例：
 * ```javascript
 * const { skillRegistry, BaseSkill, SkillCategory } = require('./utils/skills');
 *
 * // 获取所有可用 Skill
 * const skills = skillRegistry.getAllSkills();
 *
 * // 获取特定 Skill
 * const dbSkill = skillRegistry.getSkill('builtin:database-query');
 *
 * // 获取 Skill 定义
 * const definition = dbSkill.getDefinition();
 *
 * // 验证配置
 * const { valid, errors } = dbSkill.validateConfig(userConfig);
 * ```
 *
 * @module server/utils/skills
 */

const { BaseSkill } = require("./BaseSkill");
const { skillRegistry, SkillRegistry } = require("./SkillRegistry");
const {
  SkillCategory,
  SkillStatus,
  ConfigFieldType,
  SkillEventType,
  BUILTIN_SKILL_PREFIX,
  CUSTOM_SKILL_PREFIX,
  SKILL_CONFIG_CACHE_TTL,
} = require("./constants");

// 内置 Skill 类（用于扩展）
const { DatabaseQuerySkill } = require("./builtin/DatabaseQuerySkill");
const { DocumentSearchSkill } = require("./builtin/DocumentSearchSkill");
const { DocxSkill } = require("./builtin/DocxSkill");
const { PdfSkill } = require("./builtin/PdfSkill");
const { XlsxSkill } = require("./builtin/XlsxSkill");
const { PptxSkill } = require("./builtin/PptxSkill");
const { DocCoauthoringSkill } = require("./builtin/DocCoauthoringSkill");
const { InternalCommsSkill } = require("./builtin/InternalCommsSkill");
const { CodeExecutionSkill } = require("./builtin/CodeExecutionSkill");
const { OctopusKbSkill } = require("./builtin/OctopusKbSkill");

module.exports = {
  // 核心类
  BaseSkill,
  SkillRegistry,
  skillRegistry,

  // 常量
  SkillCategory,
  SkillStatus,
  ConfigFieldType,
  SkillEventType,
  BUILTIN_SKILL_PREFIX,
  CUSTOM_SKILL_PREFIX,
  SKILL_CONFIG_CACHE_TTL,

  // 内置 Skill 类
  DatabaseQuerySkill,
  DocumentSearchSkill,
  DocxSkill,
  PdfSkill,
  XlsxSkill,
  PptxSkill,
  DocCoauthoringSkill,
  InternalCommsSkill,
  CodeExecutionSkill,
  OctopusKbSkill,
};
