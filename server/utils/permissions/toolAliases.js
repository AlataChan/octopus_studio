/**
 * @fileoverview Tool alias mapping (abstract ↔ runtime tool names)
 *
 * Skill declarations (e.g. `skill.md` tools, BaseSkill toolBindings) should prefer
 * abstract/toolGateway-facing names. At runtime, agents load concrete AIbitat plugin
 * tool names. This module bridges the two.
 */

/**
 * Abstract tool name -> runtime tool names (AIbitat plugin/function names)
 * Keep this list minimal and explicit. Unsafe tools (shell/exec) should not be mapped by default.
 * @type {Record<string, string[]>}
 */
const TOOL_ALIAS_MAP = Object.freeze({
  // Generic external HTTP capability.
  "http-request": ["web-browsing"],

  // File system read capability (list/read via read-document-file plugin).
  "read-file": ["read-document-file"],
  "list-files": ["read-document-file"],
});

/**
 * Runtime tool name -> abstract aliases
 * @type {Map<string, string[]>}
 */
const RUNTIME_TO_ABSTRACT = (() => {
  /** @type {Map<string, string[]>} */
  const reverse = new Map();
  for (const [abstractName, runtimeNames] of Object.entries(TOOL_ALIAS_MAP)) {
    for (const runtimeName of runtimeNames) {
      const existing = reverse.get(runtimeName) || [];
      if (!existing.includes(abstractName)) existing.push(abstractName);
      reverse.set(runtimeName, existing);
    }
  }
  return reverse;
})();

/**
 * Get runtime tool names for an abstract tool name.
 * @param {string} abstractToolName
 * @returns {string[]}
 */
function getRuntimeToolNamesForAbstract(abstractToolName) {
  const key = String(abstractToolName || "").trim();
  return Array.isArray(TOOL_ALIAS_MAP[key]) ? [...TOOL_ALIAS_MAP[key]] : [];
}

/**
 * Get abstract tool aliases for a runtime tool name.
 * @param {string} runtimeToolName
 * @returns {string[]}
 */
function getAbstractToolNamesForRuntime(runtimeToolName) {
  const key = String(runtimeToolName || "").trim();
  return [...(RUNTIME_TO_ABSTRACT.get(key) || [])];
}

/**
 * Tool name candidates for policy checks:
 * - always includes the runtime tool name
 * - plus any abstract aliases that map to it
 * @param {string} runtimeToolName
 * @returns {string[]}
 */
function getToolNameCandidates(runtimeToolName) {
  const toolName = String(runtimeToolName || "").trim();
  const aliases = getAbstractToolNamesForRuntime(toolName);
  const unique = [toolName];
  for (const alias of aliases) {
    if (!unique.includes(alias)) unique.push(alias);
  }
  return unique;
}

module.exports = {
  TOOL_ALIAS_MAP,
  getRuntimeToolNamesForAbstract,
  getAbstractToolNamesForRuntime,
  getToolNameCandidates,
};
