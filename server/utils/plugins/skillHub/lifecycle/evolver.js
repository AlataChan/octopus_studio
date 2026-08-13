const fs = require("fs");
const path = require("path");

const { mergeEvolution } = require("../format/evolutionMerger");
const { stitchEvolution } = require("../format/skillMdStitcher");
const { writeFileAtomic } = require("../format/writeFileAtomic");

function safeJsonParse(content, fallback) {
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function resolveSkillAbsolutePath(localRegistry, skill) {
  const originPath = String(skill?.originPath || "").trim();
  if (!originPath) return null;

  const baseRoot =
    skill.sourceType === "builtin"
      ? localRegistry.builtinBaseRoot
      : localRegistry.customBaseRoot;

  return path.join(baseRoot, originPath);
}

class SkillEvolver {
  constructor({ localRegistry } = {}) {
    if (!localRegistry) throw new Error("SkillEvolver requires localRegistry");
    this.localRegistry = localRegistry;
  }

  async addEvolutionEntry(skillId, entry) {
    await this.localRegistry.scan();
    const skill = this.localRegistry.get(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    if (skill.sourceType === "builtin") {
      throw new Error("Cannot evolve builtin skills (read-only)");
    }

    const skillMdPath = resolveSkillAbsolutePath(this.localRegistry, skill);
    if (!skillMdPath) throw new Error("Failed to resolve skill.md path");

    const skillDir = path.dirname(skillMdPath);
    const evolutionPath = path.join(skillDir, "evolution.json");

    const existingEvolution = fs.existsSync(evolutionPath)
      ? safeJsonParse(fs.readFileSync(evolutionPath, "utf8"), null)
      : null;

    const merged = mergeEvolution(existingEvolution, entry);
    writeFileAtomic(evolutionPath, JSON.stringify(merged, null, 2), {
      encoding: "utf8",
    });

    const originalSkillMd = fs.readFileSync(skillMdPath, "utf8");
    const stitched = stitchEvolution(originalSkillMd, merged);
    writeFileAtomic(skillMdPath, stitched, { encoding: "utf8" });

    return { skillId, evolution: merged, evolutionPath, skillMdPath };
  }

  async alignAll() {
    await this.localRegistry.scan();
    const results = [];
    for (const skill of this.localRegistry._skills || []) {
      if (skill.sourceType === "builtin") continue;
      const skillMdPath = resolveSkillAbsolutePath(this.localRegistry, skill);
      if (!skillMdPath) continue;

      const skillDir = path.dirname(skillMdPath);
      const evolutionPath = path.join(skillDir, "evolution.json");
      if (!fs.existsSync(evolutionPath)) continue;

      const evolution = safeJsonParse(
        fs.readFileSync(evolutionPath, "utf8"),
        null
      );
      if (!evolution) continue;

      const originalSkillMd = fs.readFileSync(skillMdPath, "utf8");
      const stitched = stitchEvolution(originalSkillMd, evolution);
      writeFileAtomic(skillMdPath, stitched, { encoding: "utf8" });
      results.push({ skillId: skill.skillId, skillMdPath, evolutionPath });
    }
    return results;
  }
}

module.exports = { SkillEvolver };
