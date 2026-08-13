const fs = require("fs");
const path = require("path");

const { ensureDir, sha256File } = require("./bundleTransport");

function inferSlugFromSkillId(skillId) {
  const id = String(skillId || "");
  const idx = id.indexOf(":");
  if (idx === -1) return id;
  return id.slice(idx + 1);
}

function isSafeForExport(skill) {
  const permissionMode = String(
    skill?.permissionMode || "default"
  ).toLowerCase();
  if (permissionMode === "bypass") return false;
  const autoApproved = Array.isArray(skill?.autoApprovedTools)
    ? skill.autoApprovedTools
    : [];
  if (autoApproved.length > 0) return false;
  return true;
}

async function exportGitRegistry({
  localRegistry,
  validator,
  outputDir,
  skillIds = null,
} = {}) {
  if (!localRegistry)
    throw new Error("exportGitRegistry requires localRegistry");
  if (!validator) throw new Error("exportGitRegistry requires validator");
  if (!outputDir) throw new Error("exportGitRegistry requires outputDir");

  await localRegistry.scan({ forceRefresh: true });

  const selected =
    Array.isArray(skillIds) && skillIds.length > 0
      ? new Set(skillIds.map((s) => String(s)))
      : null;

  const customSkills = (localRegistry._skills || [])
    .filter((s) => String(s?.skillId || "").startsWith("custom:"))
    .filter((s) => (selected ? selected.has(String(s.skillId)) : true));

  ensureDir(outputDir);
  const bundlesDir = path.join(outputDir, "bundles");
  ensureDir(bundlesDir);

  const skills = [];
  for (const skill of customSkills) {
    const skillId = String(skill.skillId);
    const slug = inferSlugFromSkillId(skillId);

    const validation = await validator.validate(skillId);
    if (!validation?.valid) {
      const details = Array.isArray(validation?.errors)
        ? validation.errors.join("; ")
        : "invalid";
      throw new Error(`Skill ${skillId} failed validation: ${details}`);
    }

    if (!isSafeForExport(skill)) {
      throw new Error(
        `Skill ${skillId} is not eligible for export (permissionMode/autoApprovedTools)`
      );
    }

    const baseRoot = localRegistry.customBaseRoot;
    const originPath = String(skill?.originPath || "").trim();
    if (!originPath) throw new Error(`Skill ${skillId} originPath is missing`);

    const skillMdPath = path.join(baseRoot, originPath);
    const skillDir = path.dirname(skillMdPath);

    const zipPath = path.join(bundlesDir, `${slug}.zip`);
    const AdmZip = require("adm-zip");
    const zip = new AdmZip();
    zip.addLocalFolder(skillDir, slug);
    zip.writeZip(zipPath);

    const zipHash = sha256File(zipPath);
    skills.push({
      skillId: `registry:${slug}`,
      name: skill.name || slug,
      description: skill.description || "",
      version: skill.version || "1.0.0",
      category: skill.category || "general",
      tags: Array.isArray(skill.tags) ? skill.tags : [],
      icon: skill.icon || "🧩",
      sourceType: "bundle",
      bundleUrl: `bundles/${slug}.zip`,
      installSlug: slug,
      verified: true,
      sourceHash: `sha256:${zipHash}`,
      updatedAt: new Date().toISOString(),
    });
  }

  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    skills,
  };

  const indexPath = path.join(outputDir, "registry.json");
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

  return { outputDir, bundlesDir, indexPath, skills };
}

module.exports = {
  exportGitRegistry,
};
