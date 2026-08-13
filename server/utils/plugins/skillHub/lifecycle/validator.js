const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const AgentPlugins = require("../../../agents/aibitat/plugins");
const { isValidPermissionMode } = require("../../../permissions/constants");
const {
  getRuntimeToolNamesForAbstract,
} = require("../../../permissions/toolAliases");

function isLoadableRuntimeTool(toolName) {
  const plugin = AgentPlugins?.[toolName];
  if (!plugin) return false;
  if (Array.isArray(plugin.plugin)) return true;
  return typeof plugin.plugin === "function";
}

function isSpecialRuntimeIdentifier(toolName) {
  const name = String(toolName || "").trim();
  if (!name) return false;
  // Special identifiers are loaded dynamically at runtime:
  // - @@flow_{uuid}
  // - @@mcp_{serverName}
  // - @@{importedPluginHubId}
  return name.startsWith("@@") && name.length > 2;
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

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSort(value[key]);
  }
  return out;
}

function sha256Hex(content) {
  return crypto
    .createHash("sha256")
    .update(String(content), "utf8")
    .digest("hex");
}

function computeAssetId(payload, { ignoreKeys = [] } = {}) {
  const clone = JSON.parse(JSON.stringify(payload || {}));
  for (const key of ignoreKeys) {
    delete clone[key];
  }
  delete clone.asset_id;
  return `sha256:${sha256Hex(JSON.stringify(stableSort(clone)))}`;
}

function countLines(text) {
  const s = String(text || "");
  if (!s) return 0;
  return s.split(/\r?\n/).length;
}

class SkillValidator {
  constructor({ localRegistry } = {}) {
    if (!localRegistry)
      throw new Error("SkillValidator requires localRegistry");
    this.localRegistry = localRegistry;
  }

  async validate(skillId) {
    await this.localRegistry.scan();
    const skill = this.localRegistry.get(skillId);
    if (!skill) {
      return { valid: false, errors: [`Skill not found: ${skillId}`] };
    }

    const errors = [];
    const warnings = [];

    const name = String(skill.name || "").trim();
    const description = String(skill.description || "").trim();
    if (!name) errors.push("Missing required field: name");
    if (!description) errors.push("Missing required field: description");

    const tools = Array.isArray(skill.tools) ? skill.tools : [];
    if (!Array.isArray(skill.tools))
      errors.push("Field tools must be an array");
    if (tools.length === 0) errors.push("Field tools must not be empty");

    // Validate tools are mappable to runtime.
    for (const tool of tools) {
      const toolName = String(tool || "").trim();
      if (!toolName) {
        errors.push("Tool name must be a non-empty string");
        continue;
      }

      if (isSpecialRuntimeIdentifier(toolName)) {
        continue;
      }

      const runtime = getRuntimeToolNamesForAbstract(toolName);
      const isMapped = runtime.length > 0;
      const isRuntimeTool = isLoadableRuntimeTool(toolName);

      if (!isMapped && !isRuntimeTool) {
        errors.push(
          `Tool "${toolName}" has no runtime mapping and is not a loadable runtime tool`
        );
      }
    }

    const permissionMode =
      String(skill.permissionMode || "").trim() || "default";
    if (!isValidPermissionMode(permissionMode)) {
      errors.push(`Invalid permissionMode: ${permissionMode}`);
    }

    if (skill.allowedTools && !Array.isArray(skill.allowedTools)) {
      errors.push("allowedTools must be an array");
    }
    if (skill.autoApprovedTools && !Array.isArray(skill.autoApprovedTools)) {
      errors.push("autoApprovedTools must be an array");
    }

    if (skill.resourceScopes && typeof skill.resourceScopes !== "object") {
      errors.push("resourceScopes must be an object");
    }

    const valid = errors.length === 0;

    // P2.5: generate a minimal evolution capsule after validation passes (best-effort).
    let capsule = null;
    if (valid && String(skill.sourceType || "").toLowerCase() !== "builtin") {
      try {
        const skillMdPath = resolveSkillAbsolutePath(this.localRegistry, skill);
        if (!skillMdPath) throw new Error("Failed to resolve skill.md path");

        const skillDir = path.dirname(skillMdPath);
        const evoDir = path.join(skillDir, ".evo");
        const genesDir = path.join(evoDir, "genes");
        const capsulesDir = path.join(evoDir, "capsules");
        ensureDir(genesDir);
        ensureDir(capsulesDir);

        const gene = {
          type: "Gene",
          schema_version: "0.1.0",
          category: "repair",
          signals_match: ["skill_validator_pass"],
          summary: "Baseline Skill Hub validation gate",
        };
        gene.asset_id = computeAssetId(gene);

        const genePath = path.join(genesDir, "skillhub_validator_v1.json");
        if (!fs.existsSync(genePath)) {
          fs.writeFileSync(genePath, JSON.stringify(gene, null, 2), "utf8");
        }

        const skillMdContent = fs.readFileSync(skillMdPath, "utf8");
        const stat = fs.statSync(skillMdPath);

        capsule = {
          type: "Capsule",
          schema_version: "0.1.0",
          skillId: String(skillId),
          gene: gene.asset_id,
          trigger: ["skill_validator_pass"],
          summary: "Validated skill snapshot",
          validation: {
            valid: true,
            errors: [],
            warnings: [],
          },
          env_fingerprint: {
            node_version: process.version,
            platform: process.platform,
            arch: process.arch,
          },
          blast_radius: {
            files: 1,
            bytes: stat?.size || 0,
            lines: countLines(skillMdContent),
          },
          skill_snapshot: {
            contentHash: skill.contentHash || null,
            sourceHash: skill.sourceHash || null,
            version: skill.version || null,
          },
          createdAt: new Date().toISOString(),
        };

        capsule.asset_id = computeAssetId(capsule, {
          ignoreKeys: ["createdAt"],
        });
        const capsuleFile = `${String(capsule.asset_id).replace(/^sha256:/i, "")}.json`;
        const capsulePath = path.join(capsulesDir, capsuleFile);
        if (!fs.existsSync(capsulePath)) {
          fs.writeFileSync(
            capsulePath,
            JSON.stringify(capsule, null, 2),
            "utf8"
          );
        }
      } catch (error) {
        warnings.push(`Capsule generation skipped: ${error.message}`);
      }
    }

    return { valid, errors, warnings, skill, capsule };
  }

  async validateAll() {
    await this.localRegistry.scan();
    const results = [];
    for (const skill of this.localRegistry._skills || []) {
      results.push(await this.validate(skill.skillId));
    }
    return results;
  }
}

module.exports = { SkillValidator };
