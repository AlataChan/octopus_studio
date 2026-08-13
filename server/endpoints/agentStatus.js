const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const AgentPlugins = require("../utils/agents/aibitat/plugins");
const { SystemSettings } = require("../models/systemSettings");
const { safeJsonParse } = require("../utils/http");
const { AgentFlows } = require("../utils/agentFlows");
const MCPCompatibilityLayer = require("../utils/MCP");
const ImportedPlugin = require("../utils/agents/imported");
const { toolStats } = require("../utils/agents/toolStats");

/**
 * Agent 状态查询端点
 * 用于 Slash Command 查询工具、Flow、MCP 状态
 */
function agentStatusEndpoints(app) {
  if (!app) return;

  /**
   * GET /agent-status/tools
   * 获取当前可用的 Agent 工具列表
   */
  app.get(
    "/agent-status/tools",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (_request, response) => {
      try {
        const tools = await getAvailableTools();
        return response.status(200).json({
          success: true,
          tools,
        });
      } catch (error) {
        console.error("Error getting agent tools:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /agent-status/flows
   * 获取已激活的 Agent Flow 列表
   */
  app.get(
    "/agent-status/flows",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (_request, response) => {
      try {
        const flows = getActiveFlows();
        return response.status(200).json({
          success: true,
          flows,
        });
      } catch (error) {
        console.error("Error getting agent flows:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /agent-status/mcp
   * 获取 MCP 服务器状态
   */
  app.get(
    "/agent-status/mcp",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (_request, response) => {
      try {
        const servers = await getMCPStatus();
        return response.status(200).json({
          success: true,
          servers,
        });
      } catch (error) {
        console.error("Error getting MCP status:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /agent-status/summary
   * 获取 Agent 状态汇总（工具 + Flow + MCP）
   */
  app.get(
    "/agent-status/summary",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (_request, response) => {
      try {
        const [tools, flows, mcp] = await Promise.all([
          getAvailableTools(),
          getActiveFlows(),
          getMCPStatus(),
        ]);

        return response.status(200).json({
          success: true,
          summary: {
            tools: { count: tools.length, items: tools },
            flows: { count: flows.length, items: flows },
            mcp: { count: mcp.length, items: mcp },
          },
        });
      } catch (error) {
        console.error("Error getting agent status summary:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /agent-status/stats
   * 获取工具调用统计信息
   */
  app.get(
    "/agent-status/stats",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (_request, response) => {
      try {
        const stats = toolStats.getAllStats();
        return response.status(200).json({
          success: true,
          stats,
        });
      } catch (error) {
        console.error("Error getting tool stats:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /agent-status/stats/top
   * 获取热门工具统计
   */
  app.get(
    "/agent-status/stats/top",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const limit = parseInt(request.query.limit) || 5;
        const topTools = toolStats.getTopTools(limit);
        return response.status(200).json({
          success: true,
          topTools,
        });
      } catch (error) {
        console.error("Error getting top tools:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /agent-status/stats/reset
   * 重置工具调用统计（仅管理员）
   */
  app.post(
    "/agent-status/stats/reset",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        toolStats.reset();
        return response.status(200).json({
          success: true,
          message: "工具调用统计已重置",
        });
      } catch (error) {
        console.error("Error resetting tool stats:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

/**
 * 获取可用的 Agent 工具列表
 */
async function getAvailableTools() {
  const tools = [];

  // 1. 内建工具
  const builtInTools = Object.keys(AgentPlugins).filter(
    (key) =>
      AgentPlugins[key]?.name && typeof AgentPlugins[key].plugin === "function"
  );

  // 2. 获取系统配置的默认技能
  const defaultSkills = safeJsonParse(
    await SystemSettings.getValueOrFallback(
      { label: "default_agent_skills" },
      "[]"
    ),
    []
  );

  // 3. 获取禁用的技能
  const disabledSkills = safeJsonParse(
    await SystemSettings.getValueOrFallback(
      { label: "disabled_agent_skills" },
      "[]"
    ),
    []
  );

  // 处理内建工具
  for (const toolKey of builtInTools) {
    const plugin = AgentPlugins[toolKey];
    if (!plugin.name) continue;

    const isEnabled =
      defaultSkills.includes(toolKey) ||
      ["memory", "document-summarizer", "web-scraping"].includes(plugin.name);
    const isDisabled = disabledSkills.includes(plugin.name);

    tools.push({
      name: plugin.name,
      type: "builtin",
      enabled: isEnabled && !isDisabled,
      description: plugin.startupConfig?.params
        ? `内建工具: ${plugin.name}`
        : plugin.name,
    });
  }

  // 4. 导入的插件
  const importedPlugins = ImportedPlugin.listImportedPlugins();
  for (const plugin of importedPlugins) {
    tools.push({
      name: plugin.name || plugin.hubId,
      type: "imported",
      enabled: plugin.active === true,
      description: plugin.description || `导入插件: ${plugin.name}`,
    });
  }

  return tools;
}

/**
 * 获取已激活的 Agent Flow 列表
 */
function getActiveFlows() {
  const allFlows = AgentFlows.getAllFlows();
  const flows = [];

  for (const [uuid, flow] of Object.entries(allFlows)) {
    flows.push({
      uuid,
      name: flow.name,
      active: flow.active !== false,
      description: flow.description || `工作流: ${flow.name}`,
      blockCount: flow.steps?.length || 0,
    });
  }

  return flows;
}

/**
 * 获取 MCP 服务器状态
 */
async function getMCPStatus() {
  try {
    const mcp = new MCPCompatibilityLayer();
    const servers = await mcp.servers();

    return servers.map((server) => ({
      name: server.name,
      running: server.running === true,
      transport: server.transport || "unknown",
      toolCount: server.tools?.length || 0,
    }));
  } catch (error) {
    console.error("Error getting MCP servers:", error);
    return [];
  }
}

module.exports = { agentStatusEndpoints };
