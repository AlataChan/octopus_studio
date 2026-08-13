"use strict";

/**
 * AgentRuntimeFactory — 装配 agent 运行时计划的共享工厂
 *
 * 职责：把原来散落在 AgentHandler#loadAgents / #providerSetupAndCheck 里的
 * "provider/model 解析 + assistant 装配 + skill 绑定 + 权限应用" 逻辑
 * 集中到一个无状态、可依赖注入的工厂，供 AgentHandler 和 EmployeeRunService 复用。
 *
 * 铁律：本文件的行为必须与原 AgentHandler 私有逻辑保持逐字节等价。
 */

const AgentPlugins = require("../aibitat/plugins");
const { safeJsonParse } = require("../../http");
const { USER_AGENT, WORKSPACE_AGENT } = require("../defaults");
const { PermissionMode } = require("../../permissions");
// Note: WorkspaceAssistant and SkillInstallations are require()'d lazily
// inside methods to allow jest.mock() to intercept them in tests.

// ──────────────────────────────────────────────────────────────────────────────
// 本地 helpers（与 AgentHandler 顶层 helpers 完全等价，不复制、统一维护在此）
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 去重字符串数组（保序，忽略空串）。
 * 与 AgentHandler / defaults.js 里同名函数语义完全一致。
 * @param {string[]} items
 * @returns {string[]}
 */
function uniqStrings(items) {
  const out = [];
  for (const raw of items || []) {
    const value = String(raw || "").trim();
    if (!value) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * 把 SYSTEM_TOOLS / OUTPUT_TOOLS 自动并入 allowedTools。
 * 空数组语义是"放行所有"（见 toolGateway.isToolAllowed），保持原样。
 * @param {string[]} allowedTools
 * @returns {string[]}
 */
function withSystemToolsAllowed(allowedTools = []) {
  if (!Array.isArray(allowedTools)) return allowedTools;
  if (allowedTools.length === 0) return allowedTools;
  const systemAndOutput = [
    ...(AgentPlugins.SYSTEM_TOOLS || []),
    ...(AgentPlugins.OUTPUT_TOOLS || []),
  ];
  return uniqStrings([...allowedTools, ...systemAndOutput]);
}

// ──────────────────────────────────────────────────────────────────────────────
// Factory
// ──────────────────────────────────────────────────────────────────────────────

class AgentRuntimeFactory {
  /**
   * provider → 默认 model 的 switch。
   * 完整搬自 AgentHandler.providerDefault（保留所有 case）。
   * @param {string} provider
   * @returns {string|null}
   */
  static providerDefault(provider) {
    switch (provider) {
      case "openai":
        return process.env.OPEN_MODEL_PREF ?? "gpt-4o";
      case "anthropic":
        return process.env.ANTHROPIC_MODEL_PREF ?? "claude-3-sonnet-20240229";
      case "lmstudio":
        return process.env.LMSTUDIO_MODEL_PREF ?? "server-default";
      case "ollama":
        return process.env.OLLAMA_MODEL_PREF ?? "llama3:latest";
      case "groq":
        return process.env.GROQ_MODEL_PREF ?? "llama3-70b-8192";
      case "togetherai":
        return (
          process.env.TOGETHER_AI_MODEL_PREF ??
          "mistralai/Mixtral-8x7B-Instruct-v0.1"
        );
      case "azure":
        return process.env.OPEN_MODEL_PREF;
      case "koboldcpp":
        return process.env.KOBOLD_CPP_MODEL_PREF ?? null;
      case "localai":
        return process.env.LOCAL_AI_MODEL_PREF ?? null;
      case "openrouter":
        return process.env.OPENROUTER_MODEL_PREF ?? "openrouter/auto";
      case "mistral":
        return process.env.MISTRAL_MODEL_PREF ?? "mistral-medium";
      case "generic-openai":
        return process.env.GENERIC_OPEN_AI_MODEL_PREF ?? null;
      case "aihubmix":
        return process.env.AIHUBMIX_MODEL_PREF ?? null;
      case "perplexity":
        return process.env.PERPLEXITY_MODEL_PREF ?? "sonar-small-online";
      case "textgenwebui":
        return "text-generation-webui";
      case "bedrock":
        return process.env.AWS_BEDROCK_LLM_MODEL_PREFERENCE ?? null;
      case "fireworksai":
        return process.env.FIREWORKS_AI_LLM_MODEL_PREF ?? null;
      case "deepseek":
        return process.env.DEEPSEEK_MODEL_PREF ?? "deepseek-chat";
      case "litellm":
        return process.env.LITE_LLM_MODEL_PREF ?? null;
      case "moonshotai":
        return process.env.MOONSHOT_AI_MODEL_PREF ?? "moonshot-v1-32k";
      case "apipie":
        return process.env.APIPIE_LLM_MODEL_PREF ?? null;
      case "xai":
        return process.env.XAI_LLM_MODEL_PREF ?? "grok-beta";
      case "novita":
        return process.env.NOVITA_LLM_MODEL_PREF ?? "deepseek/deepseek-r1";
      case "nvidia-nim":
        return process.env.NVIDIA_NIM_LLM_MODEL_PREF ?? null;
      case "ppio":
        return process.env.PPIO_MODEL_PREF ?? "qwen/qwen2.5-32b-instruct";
      case "gemini":
        return process.env.GEMINI_LLM_MODEL_PREF ?? "gemini-2.0-flash-lite";
      case "dpais":
        return process.env.DPAIS_LLM_MODEL_PREF;
      case "cometapi":
        return process.env.COMETAPI_LLM_MODEL_PREF ?? "gpt-5-mini";
      case "foundry":
        return process.env.FOUNDRY_MODEL_PREF ?? null;
      default:
        return null;
    }
  }

  /**
   * provider / model 解析（等价 AgentHandler #providerSetupAndCheck 的 provider/model 求值部分）。
   * 不含 checkSetup / log —— 这两个留在 AgentHandler。
   *
   * 求值顺序（等价原 #getFallbackProvider + #fetchModel）：
   *  1. workspace.agentProvider 存在 → provider = agentProvider；
   *     model = agentModel 或 providerDefault(agentProvider)
   *  2. workspace.agentProvider 为空 →
   *     a. chatProvider + chatModel 都存在 → fallback 到 chat
   *     b. 系统 LLM_PROVIDER 存在且 providerDefault 有结果 → system fallback
   *     c. 否则 provider = null
   *
   * @param {{ workspace: { agentProvider?: string|null, agentModel?: string|null, chatProvider?: string|null, chatModel?: string|null } }} params
   * @returns {{ provider: string|null, model: string|null }}
   */
  static resolveProviderModel({ workspace }) {
    const agentProvider = workspace.agentProvider ?? null;

    if (agentProvider) {
      // provider 明确设置 → 只需确定 model
      const model = workspace.agentModel
        ? workspace.agentModel
        : AgentRuntimeFactory.providerDefault(agentProvider);
      return { provider: agentProvider, model };
    }

    // provider 未设置 → 走 fallback 逻辑（等价 #getFallbackProvider）
    if (workspace.chatProvider && workspace.chatModel) {
      return {
        provider: workspace.chatProvider,
        model: workspace.chatModel,
      };
    }

    const systemProvider = process.env.LLM_PROVIDER;
    if (systemProvider) {
      const systemModel = AgentRuntimeFactory.providerDefault(systemProvider);
      if (systemModel) {
        return { provider: systemProvider, model: systemModel };
      }
    }

    return { provider: null, model: null };
  }

  /**
   * 装配 assistantConfig + permissionConfig（等价 #loadAgents :630–727）。
   * 依赖注入 log（可为 no-op），内部 require WorkspaceAssistant。
   *
   * @param {{ assistantId: string|number|null, log?: (msg: string) => void }} params
   * @returns {Promise<{ assistantConfig: object|null, permissionConfig: object|null }>}
   */
  static async assembleAssistantConfig({ assistantId, log = () => {} }) {
    if (!assistantId) {
      return { assistantConfig: null, permissionConfig: null };
    }

    try {
      const { WorkspaceAssistant } = require("../../../models/workspaceAssistant");
      const assistant = await WorkspaceAssistant.getById(assistantId);
      if (!assistant || !assistant.enabled) {
        return { assistantConfig: null, permissionConfig: null };
      }

      const template = assistant.template;
      if (!template) {
        return { assistantConfig: null, permissionConfig: null };
      }

      const customConfig = assistant.customConfig || {};

      // 从 defaultTools 中提取 Skills（builtin:* / custom:* 格式）和普通工具
      const allTools = safeJsonParse(template.defaultTools, []);
      const toolsFromDefaultTools = allTools.filter(
        (t) => !t.startsWith("builtin:") && !t.startsWith("custom:")
      );

      // Phase 6.1: also support template.skills as capability Skill IDs
      const templateSkills = Array.isArray(template.skills)
        ? template.skills
        : [];
      const skillsFromTemplateField = templateSkills.filter(
        (t) =>
          typeof t === "string" &&
          (t.startsWith("builtin:") || t.startsWith("custom:"))
      );

      const skills = uniqStrings([
        ...allTools.filter(
          (t) => t.startsWith("builtin:") || t.startsWith("custom:")
        ),
        ...skillsFromTemplateField,
      ]);

      const assistantConfig = {
        name: assistant.instanceName || template.name,
        systemPrompt: template.systemPrompt || null,
        tools: toolsFromDefaultTools,
        skills: skills,
        mcpServers: safeJsonParse(template.defaultMCPServers, {}),
        agentFlowId: template.agentFlowId || null,
      };

      log(`[Agent] Loaded assistant config: ${assistantConfig.name}`);
      log(
        `[Agent] Template systemPrompt: ${assistantConfig.systemPrompt ? `EXISTS (${assistantConfig.systemPrompt.length} chars)` : "NULL"}`
      );
      if (assistantConfig.agentFlowId) {
        log(`[Agent] Bound Flow ID: ${assistantConfig.agentFlowId} (will force call)`);
      }
      if (assistantConfig.skills.length > 0) {
        log(`[Agent] Skills loaded: ${assistantConfig.skills.join(", ")}`);
      }
      if (assistantConfig.tools.length > 0) {
        log(`[Agent] Tools loaded: ${assistantConfig.tools.join(", ")}`);
      }

      // 构建权限配置（实例覆盖模板默认值）
      const permissionConfig = {
        permissionMode:
          customConfig.permissionMode ||
          template.defaultPermissionMode ||
          "default",
        allowedTools: withSystemToolsAllowed(
          customConfig.allowedTools ||
            safeJsonParse(template.defaultAllowedTools, [])
        ),
        autoApprovedTools:
          customConfig.autoApprovedTools ||
          safeJsonParse(template.defaultAutoApprovedTools, []),
      };

      log(
        `[Agent] Permission config: mode=${permissionConfig.permissionMode}, allowedTools=${permissionConfig.allowedTools.length}, autoApproved=${permissionConfig.autoApprovedTools.length}`
      );

      return { assistantConfig, permissionConfig };
    } catch (error) {
      console.error(
        "Error loading assistant configuration for agent:",
        error
      );
      return { assistantConfig: null, permissionConfig: null };
    }
  }

  /**
   * runtime skill 绑定（等价 #loadAgents :729–769 的 SkillInstallations 逻辑）。
   *
   * @param {{ workspaceId: number, assistantId: string|null, log?: (msg: string) => void }} params
   * @returns {Promise<string[]>}
   */
  static async resolveRuntimeSkills({ workspaceId, assistantId, log = () => {} }) {
    const { SkillInstallations } = require("../../../models/skillInstallations");

    const wid = Number(workspaceId);
    if (!Number.isFinite(wid)) {
      return [];
    }

    try {
      const installations = (await SkillInstallations.listForWorkspace(wid)) || [];
      const asstId = assistantId != null ? String(assistantId) : null;

      const workspaceSkills = installations
        .filter(
          (row) =>
            row &&
            row.scopeType === "workspace" &&
            row.scopeId === "__workspace__"
        )
        .map((row) => row.skillId);

      const assistantSkills =
        asstId === null
          ? []
          : installations
              .filter(
                (row) =>
                  row &&
                  row.scopeType === "assistant" &&
                  String(row.scopeId) === asstId
              )
              .map((row) => row.skillId);

      return uniqStrings([...workspaceSkills, ...assistantSkills]);
    } catch (error) {
      log(`[Agent] Failed to load runtime skill bindings: ${error.message}`);
      return [];
    }
  }

  /**
   * authorizationMode 解析（等价 #loadAgents :784–794）。
   *
   * @param {{ invocationMetadata: object|null }} params
   * @returns {"full_authorize" | "hitl"}
   */
  static resolveAuthorizationMode({ invocationMetadata }) {
    const meta = invocationMetadata || {};
    const requested = String(meta.authorizationMode || "")
      .trim()
      .toLowerCase();
    return requested === "full_authorize" || requested === "full-authorize"
      ? "full_authorize"
      : "hitl";
  }

  /**
   * 把 auth-mode 应用到 permissionConfig（等价 #loadAgents :796–815）。
   * 无 permissionConfig 时按 :798–804 兜底创建对象。
   *
   * @param {{ permissionConfig: object|null, authorizationMode: "full_authorize"|"hitl" }} params
   * @returns {object} 返回应用后的 permissionConfig（已变更）
   */
  static applyAuthorizationMode({ permissionConfig, authorizationMode }) {
    // 确保始终有 permissionConfig 对象（等价 :798–804）
    if (!permissionConfig) {
      permissionConfig = {
        permissionMode: PermissionMode.DEFAULT,
        allowedTools: [],
        autoApprovedTools: [],
      };
    }

    // 应用 auth-mode（等价 :806–815）
    // - full_authorize => bypass（仍受 allowedTools allowlist 约束）
    // - hitl => force default（防止意外 bypass 配置）
    if (authorizationMode === "full_authorize") {
      permissionConfig.permissionMode = PermissionMode.BYPASS;
    } else {
      if (permissionConfig.permissionMode === PermissionMode.BYPASS) {
        permissionConfig.permissionMode = PermissionMode.DEFAULT;
      }
    }

    return permissionConfig;
  }

  /**
   * 顶层装配：产出"可执行运行时计划"。
   * 组合上面所有步骤 + 调 USER_AGENT/WORKSPACE_AGENT.getDefinition + 计算 funcsToLoad。
   *
   * @param {{
   *   workspace: object,
   *   user: object|null,
   *   assistantId: string|number|null,
   *   workspaceId: number,
   *   invocationMetadata: object|null,
   *   provider: string,     // AgentHandler 在 init() 已解析好的 this.provider
   *   log?: (msg: string) => void
   * }} params
   * @returns {Promise<{
   *   provider: string,
   *   assistantConfig: object|null,
   *   permissionConfig: object,
   *   runtimeSkillIds: string[],
   *   authorizationMode: "full_authorize"|"hitl",
   *   userAgentDef: object,
   *   workspaceAgentDef: object,
   *   funcsToLoad: string[]
   * }>}
   */
  static async assemble({
    workspace,
    user,
    assistantId,
    workspaceId,
    invocationMetadata,
    provider,
    log = () => {},
  }) {
    // Step 1: 装配 assistantConfig + permissionConfig
    let { assistantConfig, permissionConfig } =
      await AgentRuntimeFactory.assembleAssistantConfig({
        assistantId,
        log,
      });

    // Step 2: runtime skill 绑定
    const runtimeSkillIds = await AgentRuntimeFactory.resolveRuntimeSkills({
      workspaceId,
      assistantId,
      log,
    });

    // Step 3: 合并 runtimeSkillIds 到 assistantConfig.skills（等价 :771–777）
    if (assistantConfig) {
      assistantConfig.skills = uniqStrings([
        ...(assistantConfig.skills || []),
        ...runtimeSkillIds,
      ]);
    }

    if (runtimeSkillIds.length > 0) {
      log(`[Agent] Runtime bound skills: ${runtimeSkillIds.join(", ")}`);
    }

    // Step 4: authorizationMode 解析
    const authorizationMode = AgentRuntimeFactory.resolveAuthorizationMode({
      invocationMetadata,
    });

    // Step 5: 应用 authorizationMode（同时处理 permissionConfig 兜底）
    permissionConfig = AgentRuntimeFactory.applyAuthorizationMode({
      permissionConfig,
      authorizationMode,
    });

    log(
      `[Agent] Authorization mode: ${authorizationMode} (permissionMode=${permissionConfig.permissionMode})`
    );

    // Step 6: 取得 agent 定义
    const userAgentDef = await USER_AGENT.getDefinition();
    const workspaceAgentDef = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      user,
      assistantConfig,
      runtimeSkillIds
    );

    // Step 7: 计算 funcsToLoad（等价 :840–843）
    const funcsToLoad = [
      ...(userAgentDef?.functions || []),
      ...(workspaceAgentDef?.functions || []),
    ];

    return {
      provider,
      assistantConfig,
      permissionConfig,
      runtimeSkillIds,
      authorizationMode,
      userAgentDef,
      workspaceAgentDef,
      funcsToLoad,
    };
  }
}

module.exports = { AgentRuntimeFactory, uniqStrings, withSystemToolsAllowed };
