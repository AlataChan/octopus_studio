const AgentPlugins = require("./aibitat/plugins");
const { SystemSettings } = require("../../models/systemSettings");
const { safeJsonParse } = require("../http");
const Provider = require("./aibitat/providers/ai-provider");
const ImportedPlugin = require("./imported");
const { AgentFlows } = require("../agentFlows");
const MCPCompatibilityLayer = require("../MCP");
const { COT_MODES } = require("./cot");
const { skillRegistry } = require("../skills");
const { expandToolNamesToFunctionIds } = require("./toolNameExpander");

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
 * 工具层级架构
 *
 * Layer 1: 系统级工具 - 解决 LLM 固有限制（如时间感知）
 * Layer 2: 输出级工具 - 通用文档输出能力（Excel/PPT/PDF/Word）
 * Layer 3: 业务级工具 - 员工专属技能（可被 Flow 绑定或配置限制）
 *
 * Layer 1 和 Layer 2 始终可用，不可被 Flow 或员工配置屏蔽
 */
const SYSTEM_TOOLS = AgentPlugins.SYSTEM_TOOLS || [];
const OUTPUT_TOOLS = AgentPlugins.OUTPUT_TOOLS || [];

// This is a list of skills that are built-in and default enabled.
const DEFAULT_SKILLS = [
  AgentPlugins.memory.name,
  AgentPlugins.docSummarizer.name,
  AgentPlugins.webScraping.name,
  AgentPlugins.orchestrator.name, // 智能编排器 - 自动分析复杂任务并生成执行计划
];

if (AgentPlugins.duckdbAgent) {
  DEFAULT_SKILLS.push(AgentPlugins.duckdbAgent.name); // DuckDB - 临时分析层文件查询（CSV/Excel）
}

if (process.env.MOLT_ENABLED === "true" && AgentPlugins.moltAgent) {
  DEFAULT_SKILLS.push(AgentPlugins.moltAgent.name);
}

if (process.env.READONLY_SUBAGENT_ENABLED === "true" && AgentPlugins.researchSubagent) {
  DEFAULT_SKILLS.push(AgentPlugins.researchSubagent.name);
}

/**
 * 从 Skills 配置中获取 Skill IDs
 * Skills 主要通过 System Prompt 提供能力指导，而不是可执行工具
 * 在 #attachPlugins 中会被识别并跳过（因为它们不是 AgentPlugins）
 * @param {string[]} skillIds - Skill ID 数组
 * @param {string[]} reservedTools - 需要排除的工具列表（系统工具/输出工具）
 * @returns {string[]} 可加载的工具函数标识符数组（AIbitat plugin/function identifiers）
 */
function expandToolPluginsFromSkills(skillIds, reservedTools = []) {
  if (!skillIds || !Array.isArray(skillIds) || skillIds.length === 0) {
    return [];
  }

  const toolNames = [];
  for (const skillId of skillIds) {
    const skill = skillRegistry.getSkill(skillId);
    if (!skill) {
      console.warn(`[Agent] Skill not found: ${skillId}`);
      continue;
    }

    const bindings = skill.getToolBindings?.() || [];
    for (const binding of bindings) {
      const toolName = String(binding?.toolName || "").trim();
      if (!toolName) continue;
      if (!toolNames.includes(toolName)) toolNames.push(toolName);
    }
  }

  return expandToolNamesToFunctionIds(toolNames, { reservedTools });
}

/**
 * 从 Skills 配置中获取聚合的 System Prompt
 * @param {string[]} skillIds - Skill ID 数组
 * @returns {string} 聚合后的 System Prompt
 */
function getSkillSystemPrompts(skillIds) {
  if (!skillIds || !Array.isArray(skillIds) || skillIds.length === 0) {
    return "";
  }

  const prompts = [];
  for (const skillId of skillIds) {
    const skill = skillRegistry.getSkill(skillId);
    if (!skill) continue;

    const systemPrompt = skill.getSystemPrompt();
    if (systemPrompt) {
      prompts.push(`## ${skill.name}\n${systemPrompt}`);
    }
  }

  if (prompts.length === 0) return "";

  return `\n\n# 专业技能指南\n\n${prompts.join("\n\n")}`;
}

/**
 * 从 Skills 配置中获取 MCP 服务器列表
 * @param {string[]} skillIds - Skill ID 数组
 * @returns {string[]} MCP 服务器名称数组
 */
function getMCPServersFromSkills(skillIds) {
  if (!skillIds || !Array.isArray(skillIds) || skillIds.length === 0) {
    return [];
  }

  const mcpServers = [];
  for (const skillId of skillIds) {
    const skill = skillRegistry.getSkill(skillId);
    if (!skill) continue;

    const mcpBindings = skill.getMCPBindings();
    for (const binding of mcpBindings) {
      if (binding.serverName && !mcpServers.includes(binding.serverName)) {
        mcpServers.push(binding.serverName);
      }
    }
  }
  return mcpServers;
}

/**
 * 合并 MCP 服务器列表
 * 简化设计：Workspace 中启用的 MCP 服务器对所有 AI 员工自动可用
 * Skills 中定义的 MCP 服务器也会被添加进来
 *
 * @param {string[]} allMCPServers - 所有可用的 MCP 服务器 (@@mcp_xxx 格式)
 * @param {string[]} skillMCPServers - 从 Skills 中获取的 MCP 服务器名称
 * @returns {string[]} 合并后的 MCP 服务器列表
 */
function mergeMCPServers(allMCPServers, skillMCPServers = []) {
  // 从 Workspace 获取的所有 MCP 服务器
  const merged = [...allMCPServers];

  // 添加 Skills 中定义的 MCP 服务器（如果不在列表中）
  for (const serverName of skillMCPServers) {
    const mcpPluginName = `@@mcp_${serverName}`;
    if (
      !merged.includes(mcpPluginName) &&
      allMCPServers.includes(mcpPluginName)
    ) {
      merged.push(mcpPluginName);
    }
  }

  return merged;
}

const USER_AGENT = {
  name: "USER",
  getDefinition: () => {
    return {
      interrupt: "ALWAYS",
      role: "I am the human monitor and oversee this chat. Any questions on action or decision making should be directed to me.",
    };
  },
};

const WORKSPACE_AGENT = {
  name: "@agent",
  /**
   * Get the definition for the workspace agent with its role (prompt) and functions in Aibitat format
   * @param {string} provider
   * @param {import("@prisma/client").workspaces | null} workspace
   * @param {import("@prisma/client").users | null} user
   * @param {Object | null} assistantConfig - AI员工配置(包含 tools, skills, mcpServers 等)
   * @param {string[]} [runtimeSkillIds] - 运行时绑定的 Skills（来自 skill_installations 等）
   * @returns {Promise<{ role: string, functions: object[] }>}
   */
  getDefinition: async (
    provider = null,
    workspace = null,
    user = null,
    assistantConfig = null,
    runtimeSkillIds = []
  ) => {
    let functions = [];
    let availableTools = [];
    let availableFlows = [];

    // Ensure Skill Hub skill.md entries are available to the runtime SkillRegistry
    // before we try to expand tool bindings or system prompts.
    try {
      await skillRegistry.refreshFromSkillHubLocalRegistry?.();
    } catch (error) {
      console.warn(
        "[Agent] Failed to refresh Skill Hub runtime skills:",
        error.message
      );
    }

    const effectiveSkillIds = uniqStrings([
      ...(assistantConfig?.skills || []),
      ...(runtimeSkillIds || []),
    ]);

    // 获取 Agent Flows 列表（带名称）
    const activeFlowPlugins = AgentFlows.activeFlowPlugins() || [];
    const flowsWithNames = activeFlowPlugins.map((flowId) => {
      const uuid = flowId.replace("@@flow_", "");
      const flow = AgentFlows.loadFlow(uuid);
      return flow ? `${flow.name} (${flowId})` : flowId;
    });
    availableFlows = flowsWithNames;

    // 获取所有可用的 MCP 服务器
    const allMCPServers = await new MCPCompatibilityLayer().activeMCPServers();

    // 如果有AI员工配置,使用员工的专属技能
    // 注意：空数组也是 truthy，所以需要检查 length
    const hasAssistantTools =
      assistantConfig &&
      ((Array.isArray(assistantConfig.tools) &&
        assistantConfig.tools.length > 0) ||
        (Array.isArray(assistantConfig.skills) &&
          assistantConfig.skills.length > 0));
    console.log(`[Agent] assistantConfig:`, JSON.stringify(assistantConfig));
    console.log(`[Agent] hasAssistantTools:`, hasAssistantTools);
    if (hasAssistantTools) {
      // 1. 从 tools 配置获取工具（排除系统工具和输出工具，避免重复）
      const reservedTools = [...SYSTEM_TOOLS, ...OUTPUT_TOOLS];
      const rawToolNames = Array.isArray(assistantConfig.tools)
        ? assistantConfig.tools.filter((t) => !reservedTools.includes(t))
        : assistantConfig.tools
          ? Object.keys(assistantConfig.tools).filter(
              (t) => !reservedTools.includes(t)
            )
          : [];

      // 1.1 展开抽象工具别名 + 复合插件（如 sql-agent）
      const toolNames = expandToolNamesToFunctionIds(rawToolNames, {
        reservedTools,
      });

      // 2. 从 skills 配置展开工具
      const skillToolPlugins = expandToolPluginsFromSkills(
        effectiveSkillIds,
        reservedTools
      );
      for (const toolId of skillToolPlugins) {
        if (!toolNames.includes(toolId) && !reservedTools.includes(toolId)) {
          toolNames.push(toolId);
        }
      }

      // 3. 获取 Skills 中定义的 MCP 服务器
      const skillMCPServers = getMCPServersFromSkills(effectiveSkillIds);

      // 4. 合并 MCP 服务器（Workspace 级别 + Skills 级别）
      // 简化设计：Workspace 中启用的 MCP 对所有员工自动可用
      const mergedMCPServers = mergeMCPServers(allMCPServers, skillMCPServers);

      // 5. 合并所有工具（三层架构：系统级 → 输出级 → 业务级）
      const importedPlugins = ImportedPlugin.activeImportedPlugins?.() || [];
      functions = [
        ...SYSTEM_TOOLS, // Layer 1: 系统级工具（始终可用）
        ...OUTPUT_TOOLS, // Layer 2: 输出级工具（始终可用，不可被 Flow 屏蔽）
        ...toolNames, // Layer 3: 业务级工具（员工专属，复合插件已展开）
        ...importedPlugins,
        ...activeFlowPlugins,
        ...mergedMCPServers, // Workspace MCP 对所有员工可用
      ];

      availableTools = [...SYSTEM_TOOLS, ...OUTPUT_TOOLS, ...toolNames];
      console.log(`[Agent] Layer 1 (System): ${SYSTEM_TOOLS.join(", ")}`);
      console.log(`[Agent] Layer 2 (Output): ${OUTPUT_TOOLS.join(", ")}`);
      console.log(`[Agent] Layer 3 (Business): ${toolNames.join(", ")}`);
      if (mergedMCPServers.length > 0) {
        console.log(
          `[Agent] MCP servers (Workspace): ${mergedMCPServers.join(", ")}`
        );
      }
      if (assistantConfig.skills && assistantConfig.skills.length > 0) {
        console.log(
          `[Agent] Loaded skills: ${assistantConfig.skills.join(", ")}`
        );
      }
    } else {
      // 使用系统默认技能
      const systemSkills = (await agentSkillsFromSystemSettings()) || [];
      const importedPlugins = ImportedPlugin.activeImportedPlugins() || [];

      console.log(`[Agent] systemSkills from settings:`, systemSkills);
      console.log(`[Agent] importedPlugins:`, importedPlugins);

      const reservedTools = [...SYSTEM_TOOLS, ...OUTPUT_TOOLS];
      const skillToolPlugins = expandToolPluginsFromSkills(
        effectiveSkillIds,
        reservedTools
      );

      functions = [
        ...SYSTEM_TOOLS, // Layer 1: 系统级工具
        ...OUTPUT_TOOLS, // Layer 2: 输出级工具
        ...systemSkills,
        ...skillToolPlugins,
        ...importedPlugins,
        ...activeFlowPlugins,
        ...allMCPServers,
      ];

      availableTools = [
        ...SYSTEM_TOOLS,
        ...OUTPUT_TOOLS,
        ...systemSkills,
        ...skillToolPlugins,
        ...importedPlugins,
        ...allMCPServers,
      ];
      console.log(`[Agent] System + Output tools injected`);
      console.log(`[Agent] All functions (${functions.length}):`, functions);
    }

    // 获取 Skills 的专业指导（System Prompts）
    const skillPrompts = getSkillSystemPrompts(effectiveSkillIds);

    // 构建最终的 Assistant System Prompt（助手 + Skills）
    let finalAssistantPrompt = assistantConfig?.systemPrompt || null;
    if (skillPrompts && finalAssistantPrompt) {
      finalAssistantPrompt = `${finalAssistantPrompt}\n${skillPrompts}`;
    } else if (skillPrompts) {
      finalAssistantPrompt = skillPrompts;
    }

    // 构建系统提示词（带 CoT 增强）
    // 优先使用 AI 员工的专属提示词
    const role = await Provider.systemPrompt({
      provider,
      workspace,
      user,
      cotMode: COT_MODES.STANDARD,
      availableTools,
      availableFlows,
      assistantSystemPrompt: finalAssistantPrompt,
    });

    return {
      role,
      functions,
    };
  },
};

/**
 * Fetches and preloads the names/identifiers for plugins that will be dynamically
 * loaded later
 * @returns {Promise<string[]>}
 */
async function agentSkillsFromSystemSettings() {
  const systemFunctions = [];

  // Load non-imported built-in skills that are configurable, but are default enabled.
  const _disabledDefaultSkills = safeJsonParse(
    await SystemSettings.getValueOrFallback(
      { label: "disabled_agent_skills" },
      "[]"
    ),
    []
  );
  DEFAULT_SKILLS.forEach((skill) => {
    if (_disabledDefaultSkills.includes(skill)) return;

    const plugin = AgentPlugins[skill];
    if (!plugin) return;

    // 处理多子插件模式（如 duckdb-agent, sql-agent）
    if (Array.isArray(plugin.plugin)) {
      for (const subPlugin of plugin.plugin) {
        systemFunctions.push(`${plugin.name}#${subPlugin.name}`);
      }
      return;
    }

    // 普通单一插件
    systemFunctions.push(plugin.name);
  });

  // Load non-imported built-in skills that are configurable.
  const _setting = safeJsonParse(
    await SystemSettings.getValueOrFallback(
      { label: "default_agent_skills" },
      "[]"
    ),
    []
  );
  _setting.forEach((skillName) => {
    if (!AgentPlugins.hasOwnProperty(skillName)) return;

    // This is a plugin module with many sub-children plugins who
    // need to be named via `${parent}#${child}` naming convention
    if (Array.isArray(AgentPlugins[skillName].plugin)) {
      for (const subPlugin of AgentPlugins[skillName].plugin) {
        systemFunctions.push(
          `${AgentPlugins[skillName].name}#${subPlugin.name}`
        );
      }
      return;
    }

    // This is normal single-stage plugin
    systemFunctions.push(AgentPlugins[skillName].name);
  });
  return systemFunctions;
}

module.exports = {
  USER_AGENT,
  WORKSPACE_AGENT,
  DEFAULT_SKILLS,
  agentSkillsFromSystemSettings,
};
