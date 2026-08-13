const fs = require("fs");
const path = require("path");

const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { reqBody, safeJsonParse } = require("../utils/http");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const {
  skillHubExternalDownloadsEnabled,
} = require("../utils/middleware/skillHubExternalDownloadsEnabled");

const {
  unifiedSearch,
  localRegistry,
  externalRegistry,
  communityRegistry,
} = require("../utils/plugins/skillHub/registry");
const {
  creator,
  checker,
  upgrader,
  evolver,
  validator,
  installer,
  runCycle,
} = require("../utils/plugins/skillHub/lifecycle");

const { SkillCatalog } = require("../models/skillCatalog");
const { SkillInstallations } = require("../models/skillInstallations");
const { SkillHubJobs } = require("../models/skillHubJobs");
const {
  SkillAutobotAgent,
} = require("../utils/plugins/skillHub/autobot/autobotAgent");
const { EventLogs } = require("../models/eventLogs");
const { SystemSettings } = require("../models/systemSettings");
const {
  getRuntimeToolNamesForAbstract,
} = require("../utils/permissions/toolAliases");
const {
  getSchedulerStatus,
  triggerKnowledgeSync,
  triggerSkillHubDiscovery,
} = require("../utils/scheduler");
const { AgentFlows } = require("../utils/agentFlows");
const {
  upsertFlowTemplateInSkillMd,
} = require("../utils/plugins/skillHub/lifecycle/flowTemplates");

const autobot = new SkillAutobotAgent();

function toInt(value, fallback, { min = null, max = null } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (min !== null && i < min) return min;
  if (max !== null && i > max) return max;
  return i;
}

function inferSourceFromSkillId(skillId) {
  const id = String(skillId || "");
  if (id.startsWith("builtin:")) return "builtin";
  if (id.startsWith("custom:")) return "local";
  if (id.startsWith("github:")) return "github";
  return "external";
}

function buildToolMappings(tools) {
  const list = Array.isArray(tools) ? tools : [];
  return list
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .map((abstract) => {
      const runtime = getRuntimeToolNamesForAbstract(abstract);
      return { abstract, runtime: runtime.length > 0 ? runtime : [abstract] };
    });
}

function jobScopeFromAssistantId(assistantId) {
  if (assistantId === null || assistantId === undefined || assistantId === "") {
    return { scopeType: "workspace", scopeId: "__workspace__" };
  }
  return { scopeType: "assistant", scopeId: String(assistantId) };
}

function parseJobRow(row) {
  if (!row) return null;
  const result = safeJsonParse(row.resultJson, null);
  return { ...row, result };
}

function resolveSkillAbsolutePathFromRegistry(registry, skill) {
  const originPath = String(skill?.originPath || "").trim();
  if (!originPath) return null;
  const baseRoot =
    String(skill?.sourceType || "").toLowerCase() === "builtin"
      ? registry.builtinBaseRoot
      : registry.customBaseRoot;
  return path.join(baseRoot, originPath);
}

function readJsonFileIfExists(filePath, fallback = null) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return safeJsonParse(fs.readFileSync(filePath, "utf8"), fallback);
  } catch {
    return fallback;
  }
}

function listFilesSafe(dirPath) {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath).map((name) => path.join(dirPath, name));
  } catch {
    return [];
  }
}

function httpStatusFromError(error, fallback = 500) {
  const status = Number(error?.statusCode);
  if (Number.isFinite(status) && status >= 400 && status <= 599) return status;
  return fallback;
}

async function syncSkillHubRegistriesToExternalRegistry() {
  try {
    const raw = await SystemSettings.getValueOrFallback(
      { label: "skill_hub_registries" },
      "[]"
    );
    const registries = safeJsonParse(raw, []) || [];
    if (typeof externalRegistry?.setRegistries === "function") {
      externalRegistry.setRegistries(registries);
    }
    return registries;
  } catch {
    return [];
  }
}

function skillHubEndpoints(app) {
  if (!app) return;

  // ==================== Discovery ====================

  app.get(
    "/skill-hub/search",
    [validatedRequest],
    async (request, response) => {
      try {
        const q = String(request.query.q || "").trim();
        const topN = toInt(request.query.topN, 10, { min: 1, max: 50 });
        const source = String(request.query.source || "all").toLowerCase();

        const localOnly = source === "local";
        const externalOnly = source === "external";
        const communityOnly = source === "community";

        const result = await unifiedSearch.search(q, {
          topN,
          localOnly,
          externalOnly,
          communityOnly,
        });
        response.status(200).json({ success: true, ...result });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/skill-hub/recommend",
    [validatedRequest],
    async (request, response) => {
      try {
        const q = String(request.query.q || "").trim();
        const topN = toInt(request.query.topN, 10, { min: 1, max: 50 });

        const result = await unifiedSearch.search(q, { topN });
        const recommendations = [
          ...result.local.map((s) => ({ ...s, _source: "local" })),
          ...result.external.map((s) => ({ ...s, _source: "external" })),
          ...(result.community || []).map((s) => ({
            ...s,
            _source: "community",
          })),
        ].slice(0, topN);

        response.status(200).json({
          success: true,
          query: result.query,
          recommendations,
        });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/skill-hub/discover",
    [validatedRequest],
    async (request, response) => {
      try {
        const category = request.query.category
          ? String(request.query.category).toLowerCase()
          : null;
        const source = request.query.source
          ? String(request.query.source).toLowerCase()
          : "all";
        const page = toInt(request.query.page, 1, { min: 1, max: 10_000 });
        const limit = toInt(request.query.limit, 20, { min: 1, max: 100 });
        const offset = (page - 1) * limit;

        await localRegistry.scan();
        await externalRegistry.loadIndex();
        await communityRegistry?.loadIndex?.();

        const localOnly = source === "local";
        const externalOnly = source === "external";
        const communityOnly = source === "community";

        const localSkills = (localRegistry._skills || []).filter((s) => {
          if (externalOnly || communityOnly) return false;
          if (!category) return true;
          return String(s.category || "").toLowerCase() === category;
        });

        const externalSkills =
          externalOnly || (!localOnly && !communityOnly)
            ? (await externalRegistry.listSkills({ category })) || []
            : [];
        const communitySkills =
          communityOnly || (!localOnly && !externalOnly)
            ? (await communityRegistry?.listSkills?.({ category })) || []
            : [];

        const all = [
          ...localSkills.map((s) => ({ ...s, _source: "local" })),
          ...externalSkills.map((s) => ({ ...s, _source: "external" })),
          ...communitySkills.map((s) => ({ ...s, _source: "community" })),
        ];

        const items = all.slice(offset, offset + limit);

        response.status(200).json({
          success: true,
          page,
          limit,
          total: all.length,
          items,
        });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/skill-hub/skill/:skillId",
    [validatedRequest],
    async (request, response) => {
      try {
        const { skillId } = request.params;
        const skill = await unifiedSearch.get(skillId);
        if (!skill) {
          return response
            .status(404)
            .json({ success: false, error: "Skill not found" });
        }

        // Enrich with tool mappings (abstract -> runtime).
        skill.toolMappings = buildToolMappings(skill.tools);

        // Enrich with persisted catalog metadata (config/status/enablement).
        try {
          const source =
            skill?.sourceType ||
            inferSourceFromSkillId(skill?.skillId || skillId);
          const row = await SkillCatalog.get({
            skillId: skill?.skillId || skillId,
            source,
          });
          if (row) {
            const metadata = safeJsonParse(row.metadataJson, {}) || {};
            if (metadata?.config) skill.config = metadata.config;
            if (metadata?.validationStatus)
              skill.validationStatus = metadata.validationStatus;
            if (metadata?.validatedAt) skill.validatedAt = metadata.validatedAt;
            if (metadata?.status) skill.status = metadata.status;
            skill.enabled = row.enabled === false ? false : true;
          }
        } catch {
          // ignore
        }

        response.status(200).json({ success: true, skill });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/skill-hub/categories",
    [validatedRequest],
    async (_request, response) => {
      try {
        await localRegistry.scan();
        await externalRegistry.loadIndex();
        await communityRegistry?.loadIndex?.();

        const categories = new Set();
        for (const s of localRegistry._skills || []) {
          if (s?.category) categories.add(String(s.category));
        }
        for (const s of (await externalRegistry.listSkills()) || []) {
          if (s?.category) categories.add(String(s.category));
        }
        for (const s of (await communityRegistry?.listSkills?.()) || []) {
          if (s?.category) categories.add(String(s.category));
        }

        response.status(200).json({
          success: true,
          categories: Array.from(categories).sort((a, b) => a.localeCompare(b)),
        });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // ==================== Lifecycle ====================

  app.post(
    "/skill-hub/skill/:skillId/flow-templates/import",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { skillId } = request.params;
        const data = reqBody(request) || {};
        const flowUuid = String(data.flowUuid || "").trim();
        if (!flowUuid) {
          return response
            .status(400)
            .json({ success: false, error: "flowUuid is required" });
        }

        await localRegistry.scan();
        const skill = localRegistry.get(skillId);
        if (!skill) {
          return response
            .status(404)
            .json({ success: false, error: "Skill not found" });
        }

        // Do not allow editing builtin Skills via API (write barrier).
        if (
          String(skill.skillId || "").startsWith("builtin:") ||
          String(skill.sourceType || "").toLowerCase() === "builtin"
        ) {
          return response.status(422).json({
            success: false,
            error: "Builtin Skills cannot be modified via Skill Hub",
          });
        }

        const skillMdPath = resolveSkillAbsolutePathFromRegistry(
          localRegistry,
          skill
        );
        if (!skillMdPath || !fs.existsSync(skillMdPath)) {
          return response.status(404).json({
            success: false,
            error: "skill.md not found for Skill",
          });
        }

        const flow = AgentFlows.loadFlow(flowUuid);
        if (!flow) {
          return response
            .status(404)
            .json({ success: false, error: "Flow not found" });
        }

        const templateId =
          String(data.templateId || "").trim() ||
          `flow-${String(flowUuid).slice(0, 8)}`;
        const slashCommand = data.slashCommand
          ? String(data.slashCommand).trim()
          : null;

        const template = {
          id: templateId,
          name: String(flow.name || flow?.config?.name || templateId),
          description: String(flow?.config?.description || ""),
          ...(slashCommand ? { slashCommand } : {}),
          flowDefinition: flow?.config || {},
        };

        upsertFlowTemplateInSkillMd(skillMdPath, template);
        await localRegistry.scan({ forceRefresh: true });

        response.status(200).json({
          success: true,
          skillId: skill.skillId,
          template: { id: template.id, name: template.name },
        });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/skill-hub/install",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      const data = reqBody(request);
      const { scopeType, scopeId } = jobScopeFromAssistantId(data.assistantId);
      const job = await SkillHubJobs.start({
        type: "skill_hub_install",
        status: SkillHubJobs.Status.RUNNING,
        skillId: data.skillId || null,
        workspaceId: data.workspaceId ?? null,
        scopeType,
        scopeId,
        result: {
          input: {
            skillId: data.skillId ?? null,
            githubUrl: data.githubUrl ?? null,
            overwrite: data.overwrite === true,
          },
        },
      });

      try {
        const skillIdOrUrl = data.skillId || data.githubUrl;
        const result = await installer.install(skillIdOrUrl, {
          workspaceId: data.workspaceId,
          assistantId: data.assistantId,
          overwrite: data.overwrite === true,
        });

        if (job?.id && result?.skillId) {
          await SkillHubJobs.update(job.id, { skillId: result.skillId });
        }
        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.DONE,
          result: {
            ok: true,
            skillId: result.skillId,
            bound: result.bound === true,
            sourceType: result.skill?.sourceType || null,
          },
        });

        await EventLogs.logEvent(
          "skill_hub_install",
          {
            skillId: result.skillId,
            workspaceId: data.workspaceId ?? null,
            assistantId: data.assistantId ?? null,
            bound: result.bound === true,
            sourceType: result.skill?.sourceType,
            verified: result.skill?.verified === true,
            jobId: job?.id || null,
          },
          response.locals?.user?.id
        );

        response
          .status(200)
          .json({ success: true, jobId: job?.id || null, ...result });
      } catch (error) {
        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.FAILED,
          error: error.message,
          result: { ok: false },
        });
        await EventLogs.logEvent(
          "skill_hub_install_failed",
          { error: error.message, jobId: job?.id || null },
          response.locals?.user?.id
        );
        response
          .status(httpStatusFromError(error))
          .json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/skill-hub/uninstall",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      const data = reqBody(request);
      const { scopeType, scopeId } = jobScopeFromAssistantId(data.assistantId);
      const job = await SkillHubJobs.start({
        type: "skill_hub_uninstall",
        status: SkillHubJobs.Status.RUNNING,
        skillId: data.skillId || null,
        workspaceId: data.workspaceId ?? null,
        scopeType,
        scopeId,
        result: { input: { skillId: data.skillId ?? null } },
      });

      try {
        const result = await installer.uninstall(data.skillId, {
          workspaceId: data.workspaceId,
          assistantId: data.assistantId,
        });

        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.DONE,
          result: { ok: true, removed: result.removed ?? 0 },
        });

        await EventLogs.logEvent(
          "skill_hub_uninstall",
          {
            skillId: data.skillId,
            workspaceId: data.workspaceId ?? null,
            assistantId: data.assistantId ?? null,
            removed: result.removed ?? 0,
            jobId: job?.id || null,
          },
          response.locals?.user?.id
        );

        response
          .status(200)
          .json({ success: true, jobId: job?.id || null, ...result });
      } catch (error) {
        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.FAILED,
          error: error.message,
          result: { ok: false },
        });
        await EventLogs.logEvent(
          "skill_hub_uninstall_failed",
          { error: error.message, jobId: job?.id || null },
          response.locals?.user?.id
        );
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/skill-hub/create",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
      skillHubExternalDownloadsEnabled,
    ],
    async (request, response) => {
      const { githubUrl, options = {} } = reqBody(request);
      const job = await SkillHubJobs.start({
        type: "skill_hub_create",
        status: SkillHubJobs.Status.RUNNING,
        result: { input: { githubUrl: githubUrl ?? null, options } },
      });

      try {
        const result = await creator.createFromGitHub(githubUrl, options);

        if (job?.id && result?.skillId) {
          await SkillHubJobs.update(job.id, { skillId: result.skillId });
        }
        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.DONE,
          result: { ok: true, skillId: result?.skillId || null },
        });

        // P2.1: upsert catalog metadata for created skills (even before binding).
        try {
          await localRegistry.scan({ forceRefresh: true });
          const created = localRegistry.get(result?.skillId);
          if (created) {
            const source =
              created?.sourceType || inferSourceFromSkillId(result?.skillId);
            await SkillCatalog.upsert({
              skillId: result?.skillId,
              source,
              metadata: created,
            });
          }
        } catch (error) {
          console.warn(
            "[SkillHub] Failed to upsert created skill:",
            error.message
          );
        }

        await EventLogs.logEvent(
          "skill_hub_create",
          {
            githubUrl,
            skillId: result?.skillId,
            verified: options?.verified === true,
            jobId: job?.id || null,
          },
          response.locals?.user?.id
        );

        response
          .status(200)
          .json({ success: true, jobId: job?.id || null, ...result });
      } catch (error) {
        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.FAILED,
          error: error.message,
          result: { ok: false },
        });
        await EventLogs.logEvent(
          "skill_hub_create_failed",
          { error: error.message, jobId: job?.id || null },
          response.locals?.user?.id
        );
        response
          .status(httpStatusFromError(error))
          .json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/skill-hub/check-updates",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      try {
        const results = await checker.checkAll();

        // P2.1: write check results back to skill_catalog for operational visibility.
        try {
          await localRegistry.scan();
          for (const row of results || []) {
            const skillId = row?.skillId;
            if (!skillId) continue;

            const local = localRegistry.get(skillId);
            if (!local) continue;

            const source = local?.sourceType || inferSourceFromSkillId(skillId);
            const metadata = {
              ...local,
              status: row?.status || null,
              lastCheckedAt: new Date().toISOString(),
              remoteHash: row?.remoteHash || null,
              currentHash: row?.currentHash || null,
            };

            await SkillCatalog.upsert({ skillId, source, metadata });
          }
        } catch (error) {
          console.warn(
            "[SkillHub] Failed to persist check results:",
            error.message
          );
        }

        response.status(200).json({ success: true, results });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/skill-hub/upgrade/:skillId",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
      skillHubExternalDownloadsEnabled,
    ],
    async (request, response) => {
      const { skillId } = request.params;
      const { dryRun } = reqBody(request);
      const job = await SkillHubJobs.start({
        type: "skill_hub_upgrade",
        status: SkillHubJobs.Status.RUNNING,
        skillId: skillId || null,
        result: { input: { dryRun: dryRun === true } },
      });

      try {
        const result = await upgrader.upgrade(skillId, {
          dryRun: dryRun === true,
        });

        // P2.1: after upgrade, refresh registry and persist catalog metadata.
        if (dryRun !== true) {
          try {
            await localRegistry.scan({ forceRefresh: true });
            const updated = localRegistry.get(skillId);
            if (updated) {
              const source =
                updated?.sourceType || inferSourceFromSkillId(skillId);
              await SkillCatalog.upsert({ skillId, source, metadata: updated });
            }
          } catch (error) {
            console.warn(
              "[SkillHub] Failed to upsert upgraded skill:",
              error.message
            );
          }
        }

        await EventLogs.logEvent(
          "skill_hub_upgrade",
          {
            skillId,
            dryRun: dryRun === true,
            upgraded: result?.upgraded === true,
            oldHash: result?.oldHash,
            newHash: result?.newHash,
            jobId: job?.id || null,
          },
          response.locals?.user?.id
        );

        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.DONE,
          result: {
            ok: true,
            dryRun: dryRun === true,
            upgraded: result?.upgraded === true,
            oldHash: result?.oldHash,
            newHash: result?.newHash,
          },
        });

        response
          .status(200)
          .json({ success: true, jobId: job?.id || null, result });
      } catch (error) {
        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.FAILED,
          error: error.message,
          result: { ok: false },
        });
        await EventLogs.logEvent(
          "skill_hub_upgrade_failed",
          { error: error.message, skillId, jobId: job?.id || null },
          response.locals?.user?.id
        );
        response
          .status(httpStatusFromError(error))
          .json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/skill-hub/validate/:skillId",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      const { skillId } = request.params;
      const job = await SkillHubJobs.start({
        type: "skill_hub_validate",
        status: SkillHubJobs.Status.RUNNING,
        skillId: skillId || null,
      });

      try {
        const result = await validator.validate(skillId);

        // P3: persist validation status for UI badges ("valid/invalid") and auditability.
        try {
          await localRegistry.scan();
          const local = localRegistry.get(skillId);
          if (local) {
            const source =
              local?.sourceType ||
              inferSourceFromSkillId(local?.skillId || skillId);
            await SkillCatalog.upsert({
              skillId: local?.skillId || skillId,
              source,
              metadata: {
                ...local,
                validationStatus: result?.valid ? "valid" : "invalid",
                validatedAt: new Date().toISOString(),
                validationSummary: {
                  errors: Array.isArray(result?.errors)
                    ? result.errors.length
                    : 0,
                  warnings: Array.isArray(result?.warnings)
                    ? result.warnings.length
                    : 0,
                },
              },
            });
          }
        } catch (error) {
          console.warn(
            "[SkillHub] Failed to persist validation status:",
            error.message
          );
        }

        await EventLogs.logEvent(
          "skill_hub_validate",
          {
            skillId,
            valid: result?.valid === true,
            warnings: Array.isArray(result?.warnings)
              ? result.warnings.length
              : undefined,
            errors: Array.isArray(result?.errors)
              ? result.errors.length
              : undefined,
            jobId: job?.id || null,
          },
          response.locals?.user?.id
        );

        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.DONE,
          result: {
            ok: true,
            valid: result?.valid === true,
            warnings: Array.isArray(result?.warnings)
              ? result.warnings.length
              : 0,
            errors: Array.isArray(result?.errors) ? result.errors.length : 0,
          },
        });

        response
          .status(200)
          .json({ success: true, jobId: job?.id || null, result });
      } catch (error) {
        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.FAILED,
          error: error.message,
          result: { ok: false },
        });
        await EventLogs.logEvent(
          "skill_hub_validate_failed",
          { error: error.message, skillId, jobId: job?.id || null },
          response.locals?.user?.id
        );
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/skill-hub/evolve/:skillId",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      const { skillId } = request.params;
      const job = await SkillHubJobs.start({
        type: "skill_hub_evolve",
        status: SkillHubJobs.Status.RUNNING,
        skillId: skillId || null,
      });

      try {
        const { entry } = reqBody(request);
        const result = await evolver.addEvolutionEntry(skillId, entry || {});

        await EventLogs.logEvent(
          "skill_hub_evolve",
          {
            skillId,
            entry: entry ? { ...entry, details: undefined } : null,
            jobId: job?.id || null,
          },
          response.locals?.user?.id
        );

        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.DONE,
          result: { ok: true, evolutionPath: result?.evolutionPath || null },
        });

        response
          .status(200)
          .json({ success: true, jobId: job?.id || null, result });
      } catch (error) {
        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.FAILED,
          error: error.message,
          result: { ok: false },
        });
        await EventLogs.logEvent(
          "skill_hub_evolve_failed",
          { error: error.message, skillId, jobId: job?.id || null },
          response.locals?.user?.id
        );
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/skill-hub/cycle",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
      skillHubExternalDownloadsEnabled,
    ],
    async (_request, response) => {
      const job = await SkillHubJobs.start({
        type: "skill_hub_cycle",
        status: SkillHubJobs.Status.RUNNING,
      });

      try {
        const result = await runCycle();

        await EventLogs.logEvent(
          "skill_hub_cycle",
          { ...(result || {}), jobId: job?.id || null },
          response.locals?.user?.id
        );

        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.DONE,
          result: { ok: true, summary: result || null },
        });

        response
          .status(200)
          .json({ success: true, jobId: job?.id || null, result });
      } catch (error) {
        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.FAILED,
          error: error.message,
          result: { ok: false },
        });
        await EventLogs.logEvent(
          "skill_hub_cycle_failed",
          { error: error.message, jobId: job?.id || null },
          response.locals?.user?.id
        );
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // ==================== Management ====================

  app.get(
    "/skill-hub/installed",
    [validatedRequest],
    async (request, response) => {
      try {
        const workspaceId = request.query.workspaceId
          ? Number(request.query.workspaceId)
          : null;
        if (!workspaceId || !Number.isFinite(workspaceId)) {
          return response
            .status(400)
            .json({ success: false, error: "workspaceId is required" });
        }

        const installations =
          await SkillInstallations.listForWorkspace(workspaceId);
        await localRegistry.scan();

        const uniqueSkillIds = Array.from(
          new Set((installations || []).map((r) => r?.skillId).filter(Boolean))
        );

        const skills = [];
        const skillById = {};
        for (const id of uniqueSkillIds) {
          const skill = localRegistry.get(id);
          if (!skill) continue;

          const enriched = { ...skill };
          try {
            const source = skill?.sourceType || inferSourceFromSkillId(id);
            const row = await SkillCatalog.get({ skillId: id, source });
            if (row) {
              const metadata = safeJsonParse(row.metadataJson, {}) || {};
              if (metadata?.status) enriched.status = metadata.status;
              if (metadata?.validationStatus)
                enriched.validationStatus = metadata.validationStatus;
              if (metadata?.validatedAt)
                enriched.validatedAt = metadata.validatedAt;
              enriched.enabled = row.enabled === false ? false : true;
            }
          } catch {
            // ignore
          }

          skills.push(enriched);
          skillById[id] = enriched;
        }

        response.status(200).json({
          success: true,
          workspaceId,
          installations,
          skills,
          skillById,
        });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/skill-hub/jobs",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const workspaceIdRaw = request.query.workspaceId;
        const workspaceId =
          workspaceIdRaw !== undefined ? Number(workspaceIdRaw) : undefined;

        const status = request.query.status
          ? String(request.query.status)
          : undefined;
        const type = request.query.type
          ? String(request.query.type)
          : undefined;
        const skillId = request.query.skillId
          ? String(request.query.skillId)
          : undefined;
        const scopeType = request.query.scopeType
          ? String(request.query.scopeType)
          : undefined;
        const scopeId = request.query.scopeId
          ? String(request.query.scopeId)
          : undefined;

        const limit = toInt(request.query.limit, 50, { min: 1, max: 200 });
        const offset = toInt(request.query.offset, 0, { min: 0, max: 10000 });

        const jobs = await SkillHubJobs.list({
          workspaceId:
            workspaceId !== undefined && Number.isFinite(workspaceId)
              ? workspaceId
              : undefined,
          status,
          type,
          skillId,
          scopeType,
          scopeId,
          limit,
          offset,
        });

        response.status(200).json({
          success: true,
          jobs: (jobs || []).map(parseJobRow).filter(Boolean),
        });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/skill-hub/scheduler/status",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      try {
        const status = await getSchedulerStatus();
        const recentJobs = await SkillHubJobs.listByTypes(
          ["scheduler:knowledge_sync", "scheduler:skill_hub_discovery"],
          { limit: 30, offset: 0 }
        );

        response.status(200).json({
          success: true,
          status,
          recentJobs: (recentJobs || []).map(parseJobRow).filter(Boolean),
        });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/skill-hub/scheduler/run",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { task } = reqBody(request);
        const name = String(task || "")
          .trim()
          .toLowerCase();
        if (!name) {
          return response
            .status(400)
            .json({ success: false, error: "task is required" });
        }

        if (name === "knowledge-sync" || name === "knowledge_sync") {
          const result = await triggerKnowledgeSync();
          return response
            .status(200)
            .json({ success: true, task: "knowledge-sync", result });
        }

        if (name === "skill-hub-discovery" || name === "skill_hub_discovery") {
          const result = await triggerSkillHubDiscovery();
          return response
            .status(200)
            .json({ success: true, task: "skill-hub-discovery", result });
        }

        return response
          .status(400)
          .json({ success: false, error: `Unknown task: ${name}` });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/skill-hub/memory/search",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const q = String(request.query.q || "")
          .trim()
          .toLowerCase();
        const kind = String(request.query.kind || "all")
          .trim()
          .toLowerCase();
        const skillIdFilter = request.query.skillId
          ? String(request.query.skillId)
          : null;
        const workspaceIdFilter = request.query.workspaceId
          ? Number(request.query.workspaceId)
          : null;
        const limit = toInt(request.query.limit, 50, { min: 1, max: 200 });

        const truncate = (value, max = 600) => {
          const s = String(value || "");
          if (s.length <= max) return s;
          return `${s.slice(0, max)}…`;
        };

        const items = [];

        // 1) File-based assets (evolution + .evo genes/capsules)
        await localRegistry.scan();
        const skills = skillIdFilter
          ? [localRegistry.get(skillIdFilter)].filter(Boolean)
          : (localRegistry._skills || []).filter(Boolean);

        const includeEvolution = kind === "all" || kind === "evolution";
        const includeGenes = kind === "all" || kind === "gene";
        const includeCapsules = kind === "all" || kind === "capsule";

        for (const skill of skills) {
          if (
            !skill ||
            String(skill.sourceType || "").toLowerCase() === "builtin"
          )
            continue;
          const skillMdPath = resolveSkillAbsolutePathFromRegistry(
            localRegistry,
            skill
          );
          if (!skillMdPath) continue;
          const skillDir = path.dirname(skillMdPath);

          if (includeEvolution) {
            const evolution = readJsonFileIfExists(
              path.join(skillDir, "evolution.json"),
              null
            );
            const entries = Array.isArray(evolution?.entries)
              ? evolution.entries
              : [];
            for (const entry of entries) {
              const title = String(entry?.title || "Update").trim();
              const content = String(entry?.content || "").trim();
              const createdAt = entry?.createdAt
                ? String(entry.createdAt)
                : null;
              items.push({
                type: "evolution",
                skillId: skill.skillId,
                title,
                content: truncate(content, 800),
                createdAt: createdAt || null,
                meta: { id: entry?.id || null },
              });
            }
          }

          if (includeGenes) {
            const genesDir = path.join(skillDir, ".evo", "genes");
            for (const file of listFilesSafe(genesDir)) {
              if (!String(file).toLowerCase().endsWith(".json")) continue;
              const gene = readJsonFileIfExists(file, null);
              if (!gene) continue;
              items.push({
                type: "gene",
                skillId: skill.skillId,
                title: String(gene?.summary || gene?.type || "Gene"),
                content: truncate(JSON.stringify(gene, null, 2), 1200),
                createdAt: gene?.createdAt ? String(gene.createdAt) : null,
                meta: { asset_id: gene?.asset_id || null, path: file },
              });
            }
          }

          if (includeCapsules) {
            const capsulesDir = path.join(skillDir, ".evo", "capsules");
            for (const file of listFilesSafe(capsulesDir)) {
              if (!String(file).toLowerCase().endsWith(".json")) continue;
              const capsule = readJsonFileIfExists(file, null);
              if (!capsule) continue;
              items.push({
                type: "capsule",
                skillId: skill.skillId,
                title: String(capsule?.summary || capsule?.type || "Capsule"),
                content: truncate(JSON.stringify(capsule, null, 2), 1200),
                createdAt: capsule?.createdAt
                  ? String(capsule.createdAt)
                  : null,
                meta: { asset_id: capsule?.asset_id || null, path: file },
              });
            }
          }
        }

        // 2) DB-based audit logs (event_logs)
        const includeEvents = kind === "all" || kind === "event";
        if (includeEvents) {
          const clause = { event: { startsWith: "skill_hub_" } };
          const logs = await EventLogs.where(
            clause,
            200,
            { occurredAt: "desc" },
            0
          );
          for (const log of logs || []) {
            const meta = safeJsonParse(log?.metadata, {}) || {};
            const skillId = meta?.skillId ? String(meta.skillId) : null;
            const workspaceId =
              meta?.workspaceId !== undefined ? Number(meta.workspaceId) : null;
            if (skillIdFilter && skillId && skillId !== skillIdFilter) continue;
            if (workspaceIdFilter && Number.isFinite(workspaceIdFilter)) {
              if (
                !Number.isFinite(workspaceId) ||
                workspaceId !== workspaceIdFilter
              )
                continue;
            }
            items.push({
              type: "event",
              skillId,
              title: String(log?.event || "event"),
              content: truncate(JSON.stringify(meta, null, 2), 1200),
              createdAt: log?.occurredAt
                ? new Date(log.occurredAt).toISOString()
                : null,
              meta: { userId: log?.userId || null },
            });
          }
        }

        // Filter by query (best-effort)
        const filtered = !q
          ? items
          : items.filter((item) => {
              const hay =
                `${item.type || ""}\n${item.skillId || ""}\n${item.title || ""}\n${item.content || ""}`.toLowerCase();
              return hay.includes(q);
            });

        filtered.sort((a, b) => {
          const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });

        response
          .status(200)
          .json({ success: true, items: filtered.slice(0, limit) });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.put(
    "/skill-hub/skill/:skillId/config",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { skillId } = request.params;
        const { config } = reqBody(request);

        await localRegistry.scan();
        const local = localRegistry.get(skillId);
        const source = local?.sourceType || inferSourceFromSkillId(skillId);

        const existing = await SkillCatalog.get({ skillId, source });
        const existingMetadata =
          safeJsonParse(existing?.metadataJson, {}) || {};
        const updatedMetadata = { ...existingMetadata, config: config || {} };

        await SkillCatalog.upsert({
          skillId,
          source,
          metadata: updatedMetadata,
        });
        response.status(200).json({ success: true });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.put(
    "/skill-hub/skill/:skillId/toggle",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { skillId } = request.params;
        const { enabled } = reqBody(request);

        await localRegistry.scan();
        const local = localRegistry.get(skillId);
        const source = local?.sourceType || inferSourceFromSkillId(skillId);

        const row = await SkillCatalog.setEnabled({
          skillId,
          source,
          enabled: enabled === true,
        });
        response.status(200).json({ success: true, row });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/skill-hub/refresh-registry",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
      skillHubExternalDownloadsEnabled,
    ],
    async (_request, response) => {
      const job = await SkillHubJobs.start({
        type: "skill_hub_refresh_registry",
        status: SkillHubJobs.Status.RUNNING,
      });

      try {
        await syncSkillHubRegistriesToExternalRegistry();
        const count = await unifiedSearch.refreshExternal();
        let communityCount = 0;
        try {
          if (communityRegistry?.refresh) {
            communityCount = await communityRegistry.refresh();
          }
        } catch {
          communityCount = 0;
        }

        await EventLogs.logEvent(
          "skill_hub_refresh_registry",
          { count, communityCount, jobId: job?.id || null },
          response.locals?.user?.id
        );

        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.DONE,
          result: { ok: true, count, communityCount },
        });

        response.status(200).json({
          success: true,
          jobId: job?.id || null,
          count,
          communityCount,
        });
      } catch (error) {
        await SkillHubJobs.finish(job?.id, {
          status: SkillHubJobs.Status.FAILED,
          error: error.message,
          result: { ok: false },
        });
        await EventLogs.logEvent(
          "skill_hub_refresh_registry_failed",
          { error: error.message, jobId: job?.id || null },
          response.locals?.user?.id
        );
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/skill-hub/registries",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      try {
        const raw = await SystemSettings.getValueOrFallback(
          { label: "skill_hub_registries" },
          "[]"
        );
        const registries = safeJsonParse(raw, []) || [];
        response.status(200).json({ success: true, registries });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/skill-hub/registries",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { registries = [] } = reqBody(request);
        const result = await SystemSettings.updateSettings({
          skill_hub_registries: JSON.stringify(registries || []),
        });
        if (result?.error) throw new Error(result.error);

        await syncSkillHubRegistriesToExternalRegistry();

        await EventLogs.logEvent(
          "skill_hub_update_registries",
          { count: Array.isArray(registries) ? registries.length : 0 },
          response.locals?.user?.id
        );

        response.status(200).json({ success: true });
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/skill-hub/git-registry/export",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { skillIds = null } = reqBody(request);
        const storageDir =
          process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
        const outputDir = path.join(
          storageDir,
          "skill-hub",
          "git-registry-exports",
          `export-${Date.now()}`
        );

        const {
          exportGitRegistry,
        } = require("../utils/plugins/skillHub/gitRegistry/exporter");

        const result = await exportGitRegistry({
          localRegistry,
          validator,
          outputDir,
          skillIds: Array.isArray(skillIds) ? skillIds : null,
        });

        await EventLogs.logEvent(
          "skill_hub_git_registry_export",
          { outputDir: result.outputDir, count: (result.skills || []).length },
          response.locals?.user?.id
        );

        response.status(200).json({
          success: true,
          export: {
            outputDir: result.outputDir,
            indexPath: result.indexPath,
            bundlesDir: result.bundlesDir,
            count: (result.skills || []).length,
          },
        });
      } catch (error) {
        response
          .status(httpStatusFromError(error))
          .json({ success: false, error: error.message });
      }
    }
  );

  // ==================== Autobot ====================

  app.post(
    "/skill-hub/autobot",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { message, context = {} } = reqBody(request);
        const result = await autobot.handle({ message, context });
        response.status(200).json(result);
      } catch (error) {
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );
}

module.exports = { skillHubEndpoints };
