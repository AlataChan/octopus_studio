/**
 * Skill 注册表
 *
 * @description
 * 管理所有可用的 Skill，包括内置 Skill 和自定义 Skill。
 * 提供 Skill 的注册、查询和实例化功能。
 *
 * @module server/utils/skills/SkillRegistry
 */

const {
  BUILTIN_SKILL_PREFIX,
  CUSTOM_SKILL_PREFIX,
  SkillCategory,
} = require("./constants");
const { MarkdownSkill } = require("./MarkdownSkill");

// 内置 Skill 延迟加载
let builtinSkills = null;

/**
 * 加载内置 Skill
 * @returns {Map<string, import('./BaseSkill').BaseSkill>}
 */
function loadBuiltinSkills() {
  if (builtinSkills) return builtinSkills;

  builtinSkills = new Map();

  try {
    const { DatabaseQuerySkill } = require("./builtin/DatabaseQuerySkill");
    const dbSkill = new DatabaseQuerySkill();
    builtinSkills.set(dbSkill.id, dbSkill);
  } catch (e) {
    console.warn(
      "[SkillRegistry] Failed to load DatabaseQuerySkill:",
      e.message
    );
  }

  try {
    const { DocumentSearchSkill } = require("./builtin/DocumentSearchSkill");
    const searchSkill = new DocumentSearchSkill();
    builtinSkills.set(searchSkill.id, searchSkill);
  } catch (e) {
    console.warn(
      "[SkillRegistry] Failed to load DocumentSearchSkill:",
      e.message
    );
  }

  // 文档处理 Skills
  try {
    const { DocxSkill } = require("./builtin/DocxSkill");
    const docxSkill = new DocxSkill();
    builtinSkills.set(docxSkill.id, docxSkill);
  } catch (e) {
    console.warn("[SkillRegistry] Failed to load DocxSkill:", e.message);
  }

  try {
    const { PdfSkill } = require("./builtin/PdfSkill");
    const pdfSkill = new PdfSkill();
    builtinSkills.set(pdfSkill.id, pdfSkill);
  } catch (e) {
    console.warn("[SkillRegistry] Failed to load PdfSkill:", e.message);
  }

  try {
    const { XlsxSkill } = require("./builtin/XlsxSkill");
    const xlsxSkill = new XlsxSkill();
    builtinSkills.set(xlsxSkill.id, xlsxSkill);
  } catch (e) {
    console.warn("[SkillRegistry] Failed to load XlsxSkill:", e.message);
  }

  try {
    const { PptxSkill } = require("./builtin/PptxSkill");
    const pptxSkill = new PptxSkill();
    builtinSkills.set(pptxSkill.id, pptxSkill);
  } catch (e) {
    console.warn("[SkillRegistry] Failed to load PptxSkill:", e.message);
  }

  // 协作与沟通 Skills
  try {
    const { DocCoauthoringSkill } = require("./builtin/DocCoauthoringSkill");
    const docCoauthoringSkill = new DocCoauthoringSkill();
    builtinSkills.set(docCoauthoringSkill.id, docCoauthoringSkill);
  } catch (e) {
    console.warn(
      "[SkillRegistry] Failed to load DocCoauthoringSkill:",
      e.message
    );
  }

  try {
    const { InternalCommsSkill } = require("./builtin/InternalCommsSkill");
    const internalCommsSkill = new InternalCommsSkill();
    builtinSkills.set(internalCommsSkill.id, internalCommsSkill);
  } catch (e) {
    console.warn(
      "[SkillRegistry] Failed to load InternalCommsSkill:",
      e.message
    );
  }

  // Context Engineering Skill
  try {
    const {
      ContextEngineeringSkill,
    } = require("./builtin/ContextEngineeringSkill");
    const contextEngineeringSkill = new ContextEngineeringSkill();
    builtinSkills.set(contextEngineeringSkill.id, contextEngineeringSkill);
  } catch (e) {
    console.warn(
      "[SkillRegistry] Failed to load ContextEngineeringSkill:",
      e.message
    );
  }

  try {
    const { CodeExecutionSkill } = require("./builtin/CodeExecutionSkill");
    const codeExecutionSkill = new CodeExecutionSkill();
    builtinSkills.set(codeExecutionSkill.id, codeExecutionSkill);
  } catch (e) {
    console.warn(
      "[SkillRegistry] Failed to load CodeExecutionSkill:",
      e.message
    );
  }

  try {
    const { OctopusKbSkill } = require("./builtin/OctopusKbSkill");
    const octopusKbSkill = new OctopusKbSkill();
    builtinSkills.set(octopusKbSkill.id, octopusKbSkill);
  } catch (e) {
    console.warn("[SkillRegistry] Failed to load OctopusKbSkill:", e.message);
  }

  console.log(`[SkillRegistry] Loaded ${builtinSkills.size} builtin skills`);
  return builtinSkills;
}

/**
 * Skill 注册表
 */
class SkillRegistry {
  constructor() {
    /** @type {Map<string, import('./BaseSkill').BaseSkill>} */
    this.customSkills = new Map();

    /** @type {Set<string>} */
    this._markdownSkillIds = new Set();
  }

  /**
   * Refresh markdown-based skills from Skill Hub LocalRegistry (skill.md).
   *
   * Wave2 P0: make installed Skill Hub skills available at agent runtime for
   * tool expansion + system prompt injection.
   *
   * @param {{ forceRefresh?: boolean }} [options]
   * @returns {Promise<{ loaded: number }>}
   */
  async refreshFromSkillHubLocalRegistry(options = {}) {
    const { forceRefresh = false } = options;

    let localRegistry = null;
    try {
      ({ localRegistry } = require("../plugins/skillHub/registry"));
    } catch (error) {
      console.warn(
        "[SkillRegistry] Skill Hub registry not available:",
        error.message
      );
      return { loaded: 0 };
    }

    if (!localRegistry || typeof localRegistry.scan !== "function") {
      return { loaded: 0 };
    }

    let scanned = [];
    try {
      scanned = (await localRegistry.scan({ forceRefresh })) || [];
    } catch (error) {
      console.warn(
        "[SkillRegistry] Failed to scan Skill Hub local registry:",
        error.message
      );
      return { loaded: 0 };
    }

    /** @type {Map<string, import('./BaseSkill').BaseSkill>} */
    const nextMarkdownSkills = new Map();
    for (const meta of scanned) {
      const skillId = String(meta?.skillId || "").trim();
      if (!skillId) continue;

      // Allow custom skills AND builtin starter-pack markdown skills.
      // Code-authoritative builtins (e.g. builtin:pdf) must not be overridden.
      const isCustom = skillId.startsWith(CUSTOM_SKILL_PREFIX);
      const isBuiltinStarterPack = skillId.startsWith("builtin:starter-pack__");
      if (!isCustom && !isBuiltinStarterPack) continue;
      if (isBuiltinStarterPack && loadBuiltinSkills().has(skillId)) continue; // code wins

      try {
        nextMarkdownSkills.set(skillId, new MarkdownSkill(meta));
      } catch (error) {
        console.warn(
          `[SkillRegistry] Failed to adapt markdown skill ${skillId}:`,
          error.message
        );
      }
    }

    // Remove markdown skills that no longer exist (best-effort).
    const nextIds = new Set(nextMarkdownSkills.keys());
    for (const previousId of this._markdownSkillIds) {
      if (!nextIds.has(previousId)) {
        this.customSkills.delete(previousId);
      }
    }

    // Upsert current markdown skills.
    for (const [skillId, skill] of nextMarkdownSkills.entries()) {
      this.customSkills.set(skillId, skill);
    }

    this._markdownSkillIds = nextIds;
    return { loaded: nextMarkdownSkills.size };
  }

  /**
   * 获取所有可用的 Skill
   * @returns {import('./BaseSkill').BaseSkill[]}
   */
  getAllSkills() {
    const builtin = loadBuiltinSkills();
    return [...builtin.values(), ...this.customSkills.values()];
  }

  /**
   * 根据 ID 获取 Skill
   * @param {string} skillId - Skill ID
   * @returns {import('./BaseSkill').BaseSkill | null}
   */
  getSkill(skillId) {
    // 先查内置
    const builtin = loadBuiltinSkills();
    if (builtin.has(skillId)) {
      return builtin.get(skillId);
    }
    // 再查自定义
    if (this.customSkills.has(skillId)) {
      return this.customSkills.get(skillId);
    }
    return null;
  }

  /**
   * 注册自定义 Skill
   * @param {import('./BaseSkill').BaseSkill} skill - Skill 实例
   * @throws {Error} 如果 Skill ID 已存在
   */
  registerSkill(skill) {
    if (!skill.id.startsWith(CUSTOM_SKILL_PREFIX)) {
      skill.id = CUSTOM_SKILL_PREFIX + skill.id;
    }

    if (this.customSkills.has(skill.id)) {
      throw new Error(`Skill "${skill.id}" 已存在`);
    }

    this.customSkills.set(skill.id, skill);
    console.log(`[SkillRegistry] Registered custom skill: ${skill.id}`);
  }

  /**
   * Upsert custom Skill (no throw on duplicate).
   * @param {import('./BaseSkill').BaseSkill} skill
   * @returns {import('./BaseSkill').BaseSkill}
   */
  upsertSkill(skill) {
    if (!skill?.id) throw new Error("skill.id is required");

    if (!skill.id.startsWith(CUSTOM_SKILL_PREFIX)) {
      skill.id = CUSTOM_SKILL_PREFIX + skill.id;
    }

    this.customSkills.set(skill.id, skill);
    return skill;
  }

  /**
   * 注销自定义 Skill
   * @param {string} skillId - Skill ID
   * @returns {boolean} 是否成功注销
   */
  unregisterSkill(skillId) {
    if (skillId.startsWith(BUILTIN_SKILL_PREFIX)) {
      console.warn(
        `[SkillRegistry] Cannot unregister builtin skill: ${skillId}`
      );
      return false;
    }
    return this.customSkills.delete(skillId);
  }

  /**
   * 按分类获取 Skill
   * @param {string} category - 分类
   * @returns {import('./BaseSkill').BaseSkill[]}
   */
  getSkillsByCategory(category) {
    return this.getAllSkills().filter((skill) => skill.category === category);
  }

  /**
   * 按标签搜索 Skill
   * @param {string[]} tags - 标签数组
   * @returns {import('./BaseSkill').BaseSkill[]}
   */
  searchByTags(tags) {
    return this.getAllSkills().filter((skill) =>
      tags.some((tag) => skill.tags.includes(tag))
    );
  }

  /**
   * 获取所有 Skill 的元数据列表
   * @returns {import('./types').SkillMetadata[]}
   */
  listSkillMetadata() {
    return this.getAllSkills().map((skill) => skill.getMetadata());
  }

  /**
   * 获取所有分类
   * @returns {string[]}
   */
  getCategories() {
    const categories = new Set();
    for (const skill of this.getAllSkills()) {
      categories.add(skill.category);
    }
    return Array.from(categories);
  }

  /**
   * 获取所有标签
   * @returns {string[]}
   */
  getAllTags() {
    const tags = new Set();
    for (const skill of this.getAllSkills()) {
      for (const tag of skill.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags);
  }
}

// 单例实例
const skillRegistry = new SkillRegistry();

module.exports = { SkillRegistry, skillRegistry };
