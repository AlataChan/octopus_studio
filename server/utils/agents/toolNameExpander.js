const AgentPlugins = require("./aibitat/plugins");
const {
  getRuntimeToolNamesForAbstract,
} = require("../permissions/toolAliases");

function uniq(items) {
  const out = [];
  for (const item of items) {
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function isSpecialIdentifier(name) {
  return typeof name === "string" && name.startsWith("@@");
}

function isCompositeIdentifier(name) {
  return typeof name === "string" && name.includes("#");
}

function isLoadableSinglePlugin(name, agentPlugins) {
  return (
    !!agentPlugins?.[name] && typeof agentPlugins[name].plugin === "function"
  );
}

function isLoadableCompositePlugin(name, agentPlugins) {
  return (
    !!agentPlugins?.[name] &&
    Array.isArray(agentPlugins[name].plugin) &&
    agentPlugins[name].plugin.every(
      (child) => child && typeof child.name === "string"
    )
  );
}

function expandCompositeIdentifier(identifier, agentPlugins) {
  const [parent, childName] = String(identifier).split("#");
  if (!parent || !childName) return [];
  const plugin = agentPlugins[parent];
  if (!plugin || !Array.isArray(plugin.plugin)) return [];
  const child = plugin.plugin.find((item) => item?.name === childName);
  if (!child) return [];
  return [`${plugin.name}#${child.name}`];
}

function expandRuntimeToolNameToFunctionIds(runtimeToolName, agentPlugins) {
  const plugin = agentPlugins[runtimeToolName];
  if (!plugin) return [];

  if (Array.isArray(plugin.plugin)) {
    return plugin.plugin
      .filter((child) => child && typeof child.name === "string")
      .map((child) => `${plugin.name}#${child.name}`);
  }

  if (typeof plugin.plugin === "function") return [plugin.name];

  return [];
}

/**
 * Expand requested tool names into loadable AIbitat function identifiers.
 *
 * - Supports abstract tool names via toolAliases (e.g. http-request -> web-browsing)
 * - Expands composite plugins to parent#child identifiers (required by AIbitat.#parseFunctionName)
 * - Keeps special identifiers (@@imported, @@flow_*, @@mcp_*) as-is
 * - Drops unknown/unloadable tools to avoid polluting functions[]
 *
 * @param {string[]} toolNames
 * @param {{ reservedTools?: string[], agentPlugins?: Object }} [options]
 * @returns {string[]}
 */
function expandToolNamesToFunctionIds(toolNames = [], options = {}) {
  const { reservedTools = [], agentPlugins = AgentPlugins } = options;

  if (!Array.isArray(toolNames) || toolNames.length === 0) return [];

  const out = [];

  for (const rawName of toolNames) {
    const name = String(rawName || "").trim();
    if (!name) continue;
    if (reservedTools.includes(name)) continue;

    // Imported/flow/mcp plugins are already in the correct identifier format.
    if (isSpecialIdentifier(name)) {
      out.push(name);
      continue;
    }

    // Allow explicit composite identifiers if valid.
    if (isCompositeIdentifier(name)) {
      out.push(...expandCompositeIdentifier(name, agentPlugins));
      continue;
    }

    // Map abstract -> runtime; if no mapping, treat as runtime.
    const mapped = getRuntimeToolNamesForAbstract(name);
    const runtimeNames = mapped.length > 0 ? mapped : [name];

    for (const runtimeName of runtimeNames) {
      if (!runtimeName) continue;
      if (reservedTools.includes(runtimeName)) continue;

      // Expand composite plugin parents to parent#child identifiers.
      if (isLoadableCompositePlugin(runtimeName, agentPlugins)) {
        out.push(
          ...expandRuntimeToolNameToFunctionIds(runtimeName, agentPlugins)
        );
        continue;
      }

      // Single-stage plugins.
      if (isLoadableSinglePlugin(runtimeName, agentPlugins)) {
        out.push(
          ...expandRuntimeToolNameToFunctionIds(runtimeName, agentPlugins)
        );
      }
    }
  }

  return uniq(out);
}

module.exports = {
  expandToolNamesToFunctionIds,
};
