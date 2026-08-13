const AgentPlugins = require("../aibitat/plugins");
const { AgentFlows } = require("../../agentFlows");
const MCPCompatibilityLayer = require("../../MCP");
const ImportedPlugin = require("../imported");

/**
 * 从 AgentHandler.parseCallOptions 搬来的纯函数(原逻辑用 this.log → 改为注入 log)
 * @param {Object} args - 运行时参数
 * @param {Object} config - 插件启动配置 params
 * @param {string} pluginName - 插件名（用于日志）
 * @param {Function} log - 日志函数（注入）
 * @returns {Object} callOpts
 */
function parseCallOptions(args, config = {}, pluginName, log = () => {}) {
  const callOpts = {};
  for (const [param, definition] of Object.entries(config)) {
    if (
      definition.required &&
      (!Object.prototype.hasOwnProperty.call(args, param) ||
        args[param] === null)
    ) {
      log(
        `'${param}' required parameter for '${pluginName}' plugin is missing. Plugin may not function or crash agent.`
      );
      continue;
    }
    callOpts[param] = Object.prototype.hasOwnProperty.call(args, param)
      ? args[param]
      : definition.default || null;
  }
  return callOpts;
}

/**
 * 把 funcsToLoad 里的插件全部挂到 aibitat 上(逐字节搬移自 AgentHandler.#attachPlugins)
 * deps 经参数注入,不读 this。
 * @param {Object} params
 * @param {Object} params.aibitat - aibitat 实例
 * @param {string[]} params.funcsToLoad - 要加载的插件名列表
 * @param {Object} params.args - 运行时参数
 * @param {Function} params.log - 日志函数
 */
async function attachAgentPlugins({ aibitat, funcsToLoad, args, log = () => {} }) {
  for (const name of funcsToLoad) {
    // Skip Skills (builtin:* format) - they provide System Prompts, not executable plugins
    // Skills are handled via assistantConfig.systemPrompt in defaults.js
    if (name.startsWith("builtin:") || name.startsWith("custom:")) {
      log(
        `${name} is a Skill (provides System Prompt guidance). Skipping plugin attachment.`
      );
      continue;
    }

    // Load child plugin
    if (name.includes("#")) {
      const [parent, childPluginName] = name.split("#");
      log(
        `[DEBUG] Loading child plugin: parent=${parent}, child=${childPluginName}`
      );

      if (!Object.prototype.hasOwnProperty.call(AgentPlugins, parent)) {
        log(
          `[ERROR] ${parent} is not a valid plugin. Skipping inclusion to agent cluster.`
        );
        continue;
      }

      if (!Array.isArray(AgentPlugins[parent].plugin)) {
        log(
          `[ERROR] ${parent}.plugin is not an array. Type: ${typeof AgentPlugins[parent].plugin}`
        );
        continue;
      }

      const childPlugin = AgentPlugins[parent].plugin.find(
        (child) => child.name === childPluginName
      );
      if (!childPlugin) {
        log(
          `[ERROR] ${parent} does not have child plugin named ${childPluginName}. Available: ${AgentPlugins[parent].plugin.map((p) => p.name).join(", ")}`
        );
        continue;
      }

      const callOpts = parseCallOptions(
        args,
        childPlugin?.startupConfig?.params,
        name,
        log
      );
      aibitat.use(childPlugin.plugin(callOpts));
      log(
        `[OK] Attached ${parent}:${childPluginName} plugin to Agent cluster`
      );
      continue;
    }

    // Load flow plugin. This is marked by `@@flow_` in the array of functions to load.
    if (name.startsWith("@@flow_")) {
      const uuid = name.replace("@@flow_", "");
      const plugin = AgentFlows.loadFlowPlugin(uuid, aibitat);
      if (!plugin) {
        log(
          `Flow ${uuid} not found in flows directory. Skipping inclusion to agent cluster.`
        );
        continue;
      }

      aibitat.use(plugin.plugin());
      log(
        `Attached flow ${plugin.name} (${plugin.flowName}) plugin to Agent cluster`
      );
      continue;
    }

    // Load MCP plugin. This is marked by `@@mcp_` in the array of functions to load.
    // All sub-tools are loaded here and are denoted by `pluginName:toolName` as their identifier.
    // This will replace the parent MCP server plugin with the sub-tools as child plugins so they
    // can be called directly by the agent when invoked.
    // Since to get to this point, the `activeMCPServers` method has already been called, we can
    // safely assume that the MCP server is running and the tools are available/loaded.
    if (name.startsWith("@@mcp_")) {
      const mcpPluginName = name.replace("@@mcp_", "");
      const plugins =
        await new MCPCompatibilityLayer().convertServerToolsToPlugins(
          mcpPluginName,
          aibitat
        );
      if (!plugins) {
        log(
          `MCP ${mcpPluginName} not found in MCP server config. Skipping inclusion to agent cluster.`
        );
        continue;
      }

      // Remove the old function from the agent functions directly
      // and push the new ones onto the end of the array so that they are loaded properly.
      aibitat.agents.get("@agent").functions = aibitat.agents
        .get("@agent")
        .functions.filter((f) => f.name !== name);
      for (const plugin of plugins)
        aibitat.agents.get("@agent").functions.push(plugin.name);

      plugins.forEach((plugin) => {
        aibitat.use(plugin.plugin());
        log(
          `Attached MCP::${plugin.toolName} MCP tool to Agent cluster`
        );
      });
      continue;
    }

    // Load imported plugin. This is marked by `@@` in the array of functions to load.
    // and is the @@hubID of the plugin.
    if (name.startsWith("@@")) {
      const hubId = name.replace("@@", "");
      const valid = ImportedPlugin.validateImportedPluginHandler(hubId);
      if (!valid) {
        log(
          `Imported plugin by hubId ${hubId} not found in plugin directory. Skipping inclusion to agent cluster.`
        );
        continue;
      }

      const plugin = ImportedPlugin.loadPluginByHubId(hubId);
      const callOpts = plugin.parseCallOptions();
      aibitat.use(plugin.plugin(callOpts));
      log(
        `Attached ${plugin.name} (${hubId}) imported plugin to Agent cluster`
      );
      continue;
    }

    // Load single-stage plugin.
    if (!Object.prototype.hasOwnProperty.call(AgentPlugins, name)) {
      log(
        `${name} is not a valid plugin. Skipping inclusion to agent cluster.`
      );
      continue;
    }

    const AIbitatPlugin = AgentPlugins[name];

    // 处理复合插件（plugin 是数组的情况，如 sql-agent）
    // 复合插件需要使用 `pluginName#childName` 语法来加载特定子插件
    // 如果直接加载父插件名，则加载其所有子插件
    if (Array.isArray(AIbitatPlugin.plugin)) {
      log(
        `${name} is a composite plugin with ${AIbitatPlugin.plugin.length} sub-plugins. Loading all sub-plugins.`
      );
      for (const childPlugin of AIbitatPlugin.plugin) {
        if (typeof childPlugin.plugin !== "function") {
          log(
            `${name}:${childPlugin.name} does not have a valid plugin function. Skipping.`
          );
          continue;
        }
        const callOpts = parseCallOptions(
          args,
          childPlugin?.startupConfig?.params,
          `${name}#${childPlugin.name}`,
          log
        );
        aibitat.use(childPlugin.plugin(callOpts));
        log(
          `Attached ${name}:${childPlugin.name} plugin to Agent cluster`
        );
      }
      continue;
    }

    // 标准单一插件
    if (typeof AIbitatPlugin.plugin !== "function") {
      log(
        `${name} plugin does not have a valid plugin function. Skipping inclusion to agent cluster.`
      );
      continue;
    }

    const callOpts = parseCallOptions(
      args,
      AgentPlugins[name].startupConfig.params,
      undefined,
      log
    );
    aibitat.use(AIbitatPlugin.plugin(callOpts));
    log(`Attached ${name} plugin to Agent cluster`);
  }
}

module.exports = { attachAgentPlugins, parseCallOptions };
