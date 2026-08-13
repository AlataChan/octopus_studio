const fs = require("fs");
const path = require("path");

const { SkillCatalog } = require("../../../../models/skillCatalog");
const { SkillInstallations } = require("../../../../models/skillInstallations");
const { SkillCreator } = require("./creator");
const {
  assertExternalDownloadsEnabled,
  assertVerifiedOrAllowAll,
  SkillHubPolicyError,
} = require("../security/externalDownloadPolicy");
const {
  ensureDir,
  safeSlug,
  resolveUrlMaybeRelative,
  sha256File,
  downloadToFile,
  safeExtractZip,
  findSkillRoot,
  writeSkillFrontmatterOverrides,
} = require("../gitRegistry/bundleTransport");

function isProbablyUrl(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  return (
    v.startsWith("http://") || v.startsWith("https://") || v.startsWith("git@")
  );
}

function inferSourceFromSkillId(skillId) {
  const id = String(skillId || "");
  if (id.startsWith("builtin:")) return "builtin";
  if (id.startsWith("custom:")) return "local";
  if (id.startsWith("github:")) return "github";
  return "external";
}

function assertExternalInstallAllowed(externalSkill) {
  assertExternalDownloadsEnabled({ operation: "install external Skills" });
  assertVerifiedOrAllowAll(externalSkill, { operation: "installation" });
}

function assertCommunityHubBundleDownloadsEnabled(item) {
  if (!("COMMUNITY_HUB_BUNDLE_DOWNLOADS_ENABLED" in process.env)) {
    throw new SkillHubPolicyError(
      "Community Hub bundle downloads are not enabled. Set COMMUNITY_HUB_BUNDLE_DOWNLOADS_ENABLED (or allow_all) to allow importing community bundles.",
      { code: "COMMUNITY_HUB_BUNDLE_DOWNLOADS_DISABLED", statusCode: 422 }
    );
  }

  const mode = String(process.env.COMMUNITY_HUB_BUNDLE_DOWNLOADS_ENABLED || "");
  if (mode === "allow_all") return;
  if (item?.verified === true) return;
  if (String(item?.visibility || "").toLowerCase() === "private") return;

  throw new SkillHubPolicyError(
    "Community Hub bundle downloads are limited to verified public items or private team items only. Set COMMUNITY_HUB_BUNDLE_DOWNLOADS_ENABLED=allow_all to allow unverified items.",
    { code: "COMMUNITY_HUB_VERIFIED_ONLY", statusCode: 422 }
  );
}

class SkillInstaller {
  constructor({
    localRegistry,
    externalRegistry,
    communityRegistry = null,
    skillCatalog = SkillCatalog,
    skillInstallations = SkillInstallations,
    creator = null,
    agentFlows = null,
    mcpLayer = null,
  } = {}) {
    if (!localRegistry)
      throw new Error("SkillInstaller requires localRegistry");
    if (!externalRegistry)
      throw new Error("SkillInstaller requires externalRegistry");
    this.localRegistry = localRegistry;
    this.externalRegistry = externalRegistry;
    this.communityRegistry = communityRegistry;
    this.skillCatalog = skillCatalog;
    this.skillInstallations = skillInstallations;
    this.creator = creator || new SkillCreator();
    this.agentFlows = agentFlows;
    this.mcpLayer = mcpLayer;
  }

  _getAgentFlows() {
    if (this.agentFlows) return this.agentFlows;
    try {
      const { AgentFlows } = require("../../../agentFlows");
      return AgentFlows;
    } catch {
      return null;
    }
  }

  _getMCPLayer() {
    if (this.mcpLayer) return this.mcpLayer;
    try {
      const MCPCompatibilityLayer = require("../../../MCP");
      return new MCPCompatibilityLayer();
    } catch {
      return null;
    }
  }

  _readMcpConfig(filePath) {
    const fp = String(filePath || "").trim();
    if (!fp) return { mcpServers: {} };

    try {
      const dir = path.dirname(fp);
      ensureDir(dir);
      if (!fs.existsSync(fp)) {
        fs.writeFileSync(
          fp,
          JSON.stringify({ mcpServers: {} }, null, 2),
          "utf8"
        );
      }
      const raw = fs.readFileSync(fp, "utf8");
      const parsed = JSON.parse(raw || "{}");
      if (!parsed || typeof parsed !== "object") return { mcpServers: {} };
      if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
        parsed.mcpServers = {};
      }
      return parsed;
    } catch {
      return { mcpServers: {} };
    }
  }

  _writeMcpConfig(filePath, config) {
    const fp = String(filePath || "").trim();
    if (!fp) return false;
    try {
      const dir = path.dirname(fp);
      ensureDir(dir);
      fs.writeFileSync(fp, JSON.stringify(config, null, 2), "utf8");
      return true;
    } catch {
      return false;
    }
  }

  _extractMcpServerNames(skill) {
    const raw = skill?.mcpBindings || skill?.mcpServers;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const out = [];
    for (const entry of raw) {
      if (typeof entry === "string") {
        const name = entry.trim();
        if (name) out.push(name);
        continue;
      }
      if (entry && typeof entry === "object") {
        const name = String(entry.serverName || entry.serverId || "").trim();
        if (name) out.push(name);
      }
    }
    return Array.from(new Set(out));
  }

  async _ensureMCPServersManaged(skill) {
    const serverNames = this._extractMcpServerNames(skill);
    if (serverNames.length === 0) {
      return {
        added: [],
        existing: [],
        skipped: [],
        started: [],
        startErrors: [],
      };
    }

    const mcp = this._getMCPLayer();
    const configPath = String(mcp?.mcpServerJSONPath || "").trim();
    if (!configPath) {
      return {
        added: [],
        existing: [],
        skipped: serverNames.map((name) => ({
          serverName: name,
          reason: "mcp_config_path_unavailable",
        })),
        started: [],
        startErrors: [],
      };
    }

    const { getTemplate } = require("../../../MCP/templates");
    const config = this._readMcpConfig(configPath);

    const added = [];
    const existing = [];
    const skipped = [];

    let changed = false;
    for (const serverName of serverNames) {
      const current = config.mcpServers[serverName];
      if (current) {
        existing.push(serverName);
        const any =
          current.anythingllm && typeof current.anythingllm === "object"
            ? current.anythingllm
            : {};
        if (any.skillHubManaged === true) {
          const requiredBy = Array.isArray(any.requiredBySkills)
            ? any.requiredBySkills
            : [];
          if (!requiredBy.includes(skill.skillId)) {
            any.requiredBySkills = [...requiredBy, skill.skillId];
            current.anythingllm = any;
            changed = true;
          }
        }
        continue;
      }

      const tpl = getTemplate(serverName);
      if (!tpl || !tpl.config) {
        skipped.push({ serverName, reason: "unknown_template" });
        continue;
      }

      const any = {
        ...(tpl.anythingllm && typeof tpl.anythingllm === "object"
          ? tpl.anythingllm
          : {}),
        skillHubManaged: true,
        requiredBySkills: [skill.skillId],
      };

      config.mcpServers[serverName] = {
        command: tpl.config.command,
        args: tpl.config.args,
        env: tpl.config.env,
        anythingllm: any,
      };
      added.push(serverName);
      changed = true;
    }

    if (changed) this._writeMcpConfig(configPath, config);

    const started = [];
    const startErrors = [];
    if (mcp && typeof mcp.startMCPServer === "function") {
      for (const name of serverNames) {
        try {
          const res = await mcp.startMCPServer(name);
          if (res?.success) started.push(name);
          else if (res?.error)
            startErrors.push({ serverName: name, error: res.error });
        } catch (error) {
          startErrors.push({ serverName: name, error: error.message });
        }
      }
    }

    return { added, existing, skipped, started, startErrors };
  }

  async _cleanupUnusedMCPServersForSkill(skillId, removedServerNames = []) {
    if (!Array.isArray(removedServerNames) || removedServerNames.length === 0)
      return { removed: [], kept: [] };

    const mcp = this._getMCPLayer();
    const configPath = String(mcp?.mcpServerJSONPath || "").trim();
    if (!configPath) return { removed: [], kept: [] };

    // If we can't determine remaining installations, do nothing (safe default).
    if (
      !this.skillInstallations ||
      typeof this.skillInstallations.listAll !== "function"
    ) {
      return { removed: [], kept: [] };
    }

    await this.localRegistry.scan();
    const rows = await this.skillInstallations.listAll();
    const remainingSkillIds = Array.from(
      new Set(
        (rows || []).map((r) => String(r.skillId || "").trim()).filter(Boolean)
      )
    );

    const requiredServers = new Set();
    for (const sid of remainingSkillIds) {
      const sk = this.localRegistry.get(sid);
      if (!sk) continue;
      for (const name of this._extractMcpServerNames(sk))
        requiredServers.add(name);
    }

    const config = this._readMcpConfig(configPath);
    let changed = false;
    const removed = [];
    const kept = [];

    for (const serverName of removedServerNames) {
      if (requiredServers.has(serverName)) {
        kept.push(serverName);
        const current = config.mcpServers[serverName];
        if (current?.anythingllm?.skillHubManaged === true) {
          const prev = Array.isArray(current.anythingllm.requiredBySkills)
            ? current.anythingllm.requiredBySkills
            : [];
          const next = prev.filter((v) => String(v) !== String(skillId));
          if (next.length !== prev.length) {
            current.anythingllm.requiredBySkills = next;
            changed = true;
          }
        }
        continue;
      }

      const current = config.mcpServers[serverName];
      if (current?.anythingllm?.skillHubManaged !== true) {
        kept.push(serverName);
        continue;
      }

      delete config.mcpServers[serverName];
      removed.push(serverName);
      changed = true;

      if (mcp && typeof mcp.pruneMCPServer === "function") {
        try {
          mcp.pruneMCPServer(serverName);
        } catch {
          // ignore
        }
      }
    }

    if (changed) this._writeMcpConfig(configPath, config);
    return { removed, kept };
  }

  _findExistingFlowUuidForTemplate(allFlows, { skillId, templateId }) {
    const flows = allFlows && typeof allFlows === "object" ? allFlows : {};
    for (const [uuid, cfg] of Object.entries(flows)) {
      const sh = cfg?.skillHub;
      if (!sh || typeof sh !== "object") continue;
      if (
        String(sh.skillId) === String(skillId) &&
        String(sh.templateId) === String(templateId)
      ) {
        return uuid;
      }
    }
    return null;
  }

  async _ensureFlowTemplatesInstantiated(skill) {
    const templates = Array.isArray(skill?.flowTemplates)
      ? skill.flowTemplates
      : [];
    if (templates.length === 0) {
      return { added: [], existing: [], skipped: [], errors: [] };
    }

    const AgentFlows = this._getAgentFlows();
    if (!AgentFlows || typeof AgentFlows.saveFlow !== "function") {
      return {
        added: [],
        existing: [],
        skipped: templates.map((t) => ({
          templateId: String(t?.id || "").trim() || null,
          reason: "agent_flows_unavailable",
        })),
        errors: [],
      };
    }

    const allFlows =
      typeof AgentFlows.getAllFlows === "function"
        ? AgentFlows.getAllFlows()
        : {};

    const added = [];
    const existing = [];
    const skipped = [];
    const errors = [];

    for (const template of templates) {
      const templateId = String(template?.id || "").trim();
      if (!templateId) {
        skipped.push({ templateId: null, reason: "missing_template_id" });
        continue;
      }

      const foundUuid = this._findExistingFlowUuidForTemplate(allFlows, {
        skillId: skill.skillId,
        templateId,
      });
      if (foundUuid) {
        existing.push({ templateId, uuid: foundUuid });
        continue;
      }

      const flowDefinition = template?.flowDefinition;
      if (!flowDefinition || typeof flowDefinition !== "object") {
        skipped.push({ templateId, reason: "missing_flow_definition" });
        continue;
      }

      const name = String(
        template?.name || flowDefinition?.name || templateId
      ).trim();
      const config = {
        ...flowDefinition,
        description:
          flowDefinition.description ||
          template?.description ||
          flowDefinition?.description,
        active:
          flowDefinition.active === undefined ? true : flowDefinition.active,
        steps: Array.isArray(flowDefinition.steps) ? flowDefinition.steps : [],
        skillHub: {
          skillId: skill.skillId,
          templateId,
        },
      };

      try {
        const res = AgentFlows.saveFlow(name, config);
        if (!res || res.success !== true || !res.uuid) {
          errors.push({
            templateId,
            error: res?.error || "Failed to save flow from template",
          });
          continue;
        }
        added.push({ templateId, uuid: res.uuid });
      } catch (error) {
        errors.push({ templateId, error: error.message });
      }
    }

    return { added, existing, skipped, errors };
  }

  async _installBundle(external, options = {}) {
    const bundleUrl = resolveUrlMaybeRelative(
      external?.bundleUrl,
      external?.sourceUrl
    );
    if (!bundleUrl) throw new Error("Invalid bundleUrl for external Skill");

    const installSlug =
      String(external?.installSlug || "").trim() ||
      safeSlug(external?.name) ||
      safeSlug(external?.skillId) ||
      "skill";

    ensureDir(this.localRegistry.customSkillsDir);

    const finalDir = path.join(this.localRegistry.customSkillsDir, installSlug);
    if (fs.existsSync(finalDir) && options.overwrite !== true) {
      throw new Error(`Skill directory already exists: ${finalDir}`);
    }

    const workDir = fs.mkdtempSync(
      path.join(
        this.localRegistry.customSkillsDir,
        `.tmp-bundle-${installSlug}-`
      )
    );
    const zipPath = path.join(workDir, "bundle.zip");
    const extractDir = path.join(workDir, "extract");
    ensureDir(extractDir);

    let backupDir = null;
    try {
      await downloadToFile(bundleUrl, zipPath);

      const expected = String(external?.sourceHash || "").trim();
      if (expected) {
        const hex = expected.replace(/^sha256:/i, "");
        const actual = sha256File(zipPath);
        if (hex && hex !== actual) {
          throw new Error(
            "Bundle hash mismatch (sourceHash verification failed)"
          );
        }
      }

      safeExtractZip(zipPath, extractDir);
      const root = findSkillRoot(extractDir);
      if (!root)
        throw new Error("Bundle did not contain a valid skill.md root");

      const skillMdPath = path.join(root, "skill.md");
      writeSkillFrontmatterOverrides(skillMdPath, {
        sourceType: "registry",
        sourceUrl: bundleUrl,
        sourceHash: String(
          external?.sourceHash || `sha256:${sha256File(zipPath)}`
        ),
        verified: external?.verified === true,
      });

      // Replace final directory atomically (best-effort backup).
      if (fs.existsSync(finalDir)) {
        backupDir = path.join(
          this.localRegistry.customSkillsDir,
          `.backup-bundle-${installSlug}-${Date.now()}`
        );
        fs.renameSync(finalDir, backupDir);
      }

      fs.renameSync(root, finalDir);

      if (backupDir) {
        try {
          fs.rmSync(backupDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }

      return { skillId: `custom:${installSlug}`, skillDir: finalDir };
    } catch (error) {
      // Best-effort rollback when overwrite was used.
      try {
        if (backupDir && fs.existsSync(backupDir) && !fs.existsSync(finalDir)) {
          fs.renameSync(backupDir, finalDir);
          backupDir = null;
        }
      } catch {
        // ignore
      }
      throw error;
    } finally {
      try {
        if (backupDir && fs.existsSync(backupDir)) {
          fs.rmSync(backupDir, { recursive: true, force: true });
        }
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  async _installFromCommunityHub(external, options = {}) {
    const importId = String(
      external?.importId || external?.sourceUrl || ""
    ).trim();
    if (!importId) throw new Error("Invalid importId for community Skill");

    assertExternalDownloadsEnabled({
      operation: "import Community Hub bundles",
    });
    assertVerifiedOrAllowAll(external, { operation: "installation" });

    const { CommunityHub } = require("../../../../models/communityHub");
    const ImportedPlugin = require("../../../agents/imported");

    const { url, item, error } = await CommunityHub.getBundleItem(importId);
    if (error) throw new Error(error);
    if (!url || !item) throw new Error("Failed to fetch community bundle URL");

    assertCommunityHubBundleDownloadsEnabled(item);

    const { success, error: importError } = await CommunityHub.importBundleItem(
      {
        url,
        item,
      }
    );
    if (!success)
      throw new Error(importError || "Failed to import community bundle");

    // Activate imported plugin so the tool is immediately loadable at runtime.
    try {
      ImportedPlugin.updateImportedPlugin(item.id, { active: true });
    } catch {
      // best-effort only
    }

    const hubId = String(item.id || "").trim();
    if (!hubId) throw new Error("Community bundle item missing id");

    const base =
      safeSlug(String(item.name || external?.name || "")) || "community-skill";
    const idSlug = safeSlug(hubId) || hubId;
    const installSlug = `${base}__${idSlug}`;

    ensureDir(this.localRegistry.customSkillsDir);
    const finalDir = path.join(this.localRegistry.customSkillsDir, installSlug);
    if (fs.existsSync(finalDir) && options.overwrite !== true) {
      throw new Error(`Skill directory already exists: ${finalDir}`);
    }

    const workDir = fs.mkdtempSync(
      path.join(
        this.localRegistry.customSkillsDir,
        `.tmp-community-${installSlug}-`
      )
    );
    const nextDir = path.join(workDir, installSlug);
    ensureDir(nextDir);

    let backupDir = null;
    try {
      const toolId = `@@${hubId}`;
      const name = String(item.name || external?.name || hubId);
      const description = String(
        item.description || external?.description || ""
      );
      const tags = Array.isArray(item.tags)
        ? item.tags
        : Array.isArray(external?.tags)
          ? external.tags
          : [];
      const icon = item.icon || external?.icon || "🌐";
      const category = item.category || external?.category || "general";

      const skillMd = `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\nversion: ${JSON.stringify("1.0.0")}\ncategory: ${JSON.stringify(category)}\ntags: ${JSON.stringify(tags)}\nicon: ${JSON.stringify(icon)}\nsourceType: community\nsourceUrl: ${JSON.stringify(importId)}\nverified: ${item.verified === true}\ntools: ${JSON.stringify([toolId])}\npermissionMode: default\nallowedTools: ${JSON.stringify([toolId])}\nautoApprovedTools: []\n---\n\n# ${name}\n\n${description}\n\n## Usage\n\n- Tool: ${toolId}\n`;

      fs.writeFileSync(path.join(nextDir, "skill.md"), skillMd, "utf8");

      const evolution = {
        schema_version: "0.1.0",
        entries: [
          {
            type: "import",
            source: "community-hub",
            importId,
            hubId,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      fs.writeFileSync(
        path.join(nextDir, "evolution.json"),
        JSON.stringify(evolution, null, 2),
        "utf8"
      );

      if (fs.existsSync(finalDir)) {
        backupDir = path.join(
          this.localRegistry.customSkillsDir,
          `.backup-community-${installSlug}-${Date.now()}`
        );
        fs.renameSync(finalDir, backupDir);
      }

      fs.renameSync(nextDir, finalDir);

      if (backupDir) {
        try {
          fs.rmSync(backupDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }

      return { skillId: `custom:${installSlug}`, skillDir: finalDir };
    } catch (error) {
      try {
        if (backupDir && fs.existsSync(backupDir) && !fs.existsSync(finalDir)) {
          fs.renameSync(backupDir, finalDir);
          backupDir = null;
        }
      } catch {
        // ignore
      }
      throw error;
    } finally {
      try {
        if (backupDir && fs.existsSync(backupDir)) {
          fs.rmSync(backupDir, { recursive: true, force: true });
        }
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  async install(skillIdOrUrl, options = {}) {
    const input = String(skillIdOrUrl || "").trim();
    if (!input) throw new Error("skillIdOrUrl is required");

    if (input.startsWith("sga:")) {
      throw new Error(
        "Legacy SGA Hub/Market skill installation was removed in Phase 0; Molt native integration is pending Phase 1."
      );
    }

    const workspaceId =
      options.workspaceId === undefined ? null : Number(options.workspaceId);
    const assistantId =
      options.assistantId === undefined ? null : options.assistantId;

    await this.localRegistry.scan();

    let resolvedSkillId = input;
    let created = null;

    if (isProbablyUrl(input)) {
      // Arbitrary GitHub URL installs are only allowed in allow_all (enforced by SkillCreator).
      created = await this.creator.createFromGitHub(input, {
        outputDir: this.localRegistry.customSkillsDir,
        overwrite: options.overwrite === true,
        readmeMaxChars: options.readmeMaxChars,
      });
      resolvedSkillId = created.skillId;
      await this.localRegistry.scan({ forceRefresh: true });
    } else {
      const local = this.localRegistry.get(input);
      if (!local) {
        const external =
          (await this.externalRegistry.get(input)) ||
          (await this.communityRegistry?.get?.(input));
        if (!external) throw new Error(`Skill not found: ${input}`);

        const externalType = String(external.sourceType || "").toLowerCase();
        if (externalType === "github" && external.sourceUrl) {
          assertExternalInstallAllowed(external);
          created = await this.creator.createFromGitHub(
            String(external.sourceUrl),
            {
              outputDir: this.localRegistry.customSkillsDir,
              overwrite: options.overwrite === true,
              readmeMaxChars: options.readmeMaxChars,
              verified: external.verified === true,
            }
          );
          resolvedSkillId = created.skillId;
          await this.localRegistry.scan({ forceRefresh: true });
        } else if (
          (externalType === "bundle" || externalType === "registry") &&
          external.bundleUrl
        ) {
          assertExternalInstallAllowed(external);
          created = await this._installBundle(external, options);
          resolvedSkillId = created.skillId;
          await this.localRegistry.scan({ forceRefresh: true });
        } else if (
          externalType === "community" &&
          (external.importId || external.sourceUrl)
        ) {
          assertExternalInstallAllowed(external);
          created = await this._installFromCommunityHub(external, options);
          resolvedSkillId = created.skillId;
          await this.localRegistry.scan({ forceRefresh: true });
        } else {
          throw new Error(
            "Unsupported external Skill sourceType for installation"
          );
        }
      }
    }

    const skill = this.localRegistry.get(resolvedSkillId);
    if (!skill)
      throw new Error(
        `Installed skill could not be found locally: ${resolvedSkillId}`
      );

    const source = String(
      skill.sourceType || inferSourceFromSkillId(resolvedSkillId)
    );
    if (this.skillCatalog?.upsert) {
      await this.skillCatalog.upsert({
        skillId: resolvedSkillId,
        source,
        metadata: skill,
        enabledDefault: true,
      });
    }

    let bound = false;
    let binding = null;
    if (workspaceId !== null && Number.isFinite(workspaceId)) {
      if (this.skillInstallations?.bind) {
        binding = await this.skillInstallations.bind({
          skillId: resolvedSkillId,
          workspaceId,
          assistantId,
        });
        bound = !!binding;
      }
    }

    let flowTemplates = null;
    try {
      flowTemplates = await this._ensureFlowTemplatesInstantiated(skill);
    } catch {
      flowTemplates = null;
    }

    let mcp = null;
    try {
      mcp = await this._ensureMCPServersManaged(skill);
    } catch {
      mcp = null;
    }

    return {
      installed: true,
      skillId: resolvedSkillId,
      skill,
      bound,
      binding,
      created,
      flowTemplates,
      mcp,
    };
  }

  async uninstall(skillId, options = {}) {
    const id = String(skillId || "").trim();
    if (!id) throw new Error("skillId is required");

    const workspaceId =
      options.workspaceId === undefined ? null : Number(options.workspaceId);
    const assistantId =
      options.assistantId === undefined ? null : options.assistantId;

    let removed = 0;
    if (workspaceId !== null && Number.isFinite(workspaceId)) {
      removed = await this.unbindFromWorkspace(id, workspaceId, assistantId);
    } else if (this.skillInstallations?.removeSkillEverywhere) {
      removed = await this.skillInstallations.removeSkillEverywhere(id);
    }

    // Best-effort: clean up auto-managed MCP servers if no longer required.
    try {
      await this.localRegistry.scan();
      const skill = this.localRegistry.get(id);
      if (skill) {
        const serverNames = this._extractMcpServerNames(skill);
        await this._cleanupUnusedMCPServersForSkill(id, serverNames);
      }
    } catch {
      // ignore
    }

    // Best-effort: disable in catalog when uninstalling globally (not per-workspace).
    if (
      (workspaceId === null || !Number.isFinite(workspaceId)) &&
      this.skillCatalog?.setEnabled
    ) {
      const source = inferSourceFromSkillId(id);
      await this.skillCatalog.setEnabled({
        skillId: id,
        source,
        enabled: false,
      });
    }

    return { success: true, skillId: id, removed };
  }

  async bindToWorkspace(skillId, workspaceId, assistantId = null) {
    if (!this.skillInstallations?.bind) return null;
    return await this.skillInstallations.bind({
      skillId: String(skillId),
      workspaceId: Number(workspaceId),
      assistantId,
    });
  }

  async unbindFromWorkspace(skillId, workspaceId, assistantId = null) {
    if (!this.skillInstallations?.unbind) return 0;
    return await this.skillInstallations.unbind({
      skillId: String(skillId),
      workspaceId: Number(workspaceId),
      assistantId,
    });
  }
}

module.exports = { SkillInstaller };
