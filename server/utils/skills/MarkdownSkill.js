/**
 * MarkdownSkill
 *
 * @description
 * Adapter that wraps a Skill Hub `skill.md` (frontmatter + markdown body)
 * into the runtime BaseSkill interface so the agent runtime can:
 * - expand tools via tool aliases
 * - inject system prompt guidance
 *
 * This is intentionally minimal for Wave2 P0 (runtime closed-loop).
 */

const { BaseSkill } = require("./BaseSkill");

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || "").trim()).filter(Boolean);
}

class MarkdownSkill extends BaseSkill {
  /**
   * @param {Object} metadata - Skill Hub local registry metadata
   */
  constructor(metadata = {}) {
    const id = String(metadata.skillId || metadata.id || "").trim();
    const name = String(metadata.name || "").trim();
    const description = String(metadata.description || "").trim();

    super({
      id,
      name: name || id || "Unnamed Skill",
      description,
      version: metadata.version,
      category: metadata.category,
      tags: Array.isArray(metadata.tags) ? metadata.tags : [],
      icon: metadata.icon,
      requires: metadata.requires,
    });

    this._metadata = metadata;
  }

  /**
   * @override
   */
  getToolBindings() {
    const tools = this._metadata?.tools;

    // MVP format: tools: ["http-request", "read-file"]
    if (Array.isArray(tools)) {
      return tools
        .map((tool) => {
          if (typeof tool === "string") {
            const toolName = tool.trim();
            return toolName ? { toolName } : null;
          }
          if (tool && typeof tool === "object") {
            const toolName = String(tool.toolName || tool.name || "").trim();
            if (!toolName) return null;
            return { ...tool, toolName };
          }
          return null;
        })
        .filter(Boolean);
    }

    // Back-compat: allow `toolBindings` in future schemas
    const toolBindings = this._metadata?.toolBindings;
    if (Array.isArray(toolBindings)) {
      return toolBindings
        .map((binding) => {
          if (!binding || typeof binding !== "object") return null;
          const toolName = String(binding.toolName || "").trim();
          if (!toolName) return null;
          return { ...binding, toolName };
        })
        .filter(Boolean);
    }

    return [];
  }

  /**
   * @override
   */
  getSystemPrompt() {
    const prompt = String(this._metadata?.systemPrompt || "").trim();
    return prompt ? prompt : null;
  }

  /**
   * @override
   *
   * NOTE: Skill Hub `skill.md` does not yet standardize MCP bindings in Wave2 P0.
   * Keep as a minimal placeholder to avoid breaking consumers.
   */
  getMCPBindings() {
    const bindings = this._metadata?.mcpBindings || this._metadata?.mcpServers;
    if (!Array.isArray(bindings)) return [];

    // Accept a minimal schema: ["serverA", "serverB"]
    if (bindings.every((v) => typeof v === "string")) {
      return bindings
        .map((serverName) => String(serverName || "").trim())
        .filter(Boolean)
        .map((serverName) => ({ serverName }));
    }

    // Accept object schema: [{ serverName, enabledTools }]
    return bindings
      .map((binding) => {
        if (!binding || typeof binding !== "object") return null;
        const serverName = String(
          binding.serverName || binding.serverId || ""
        ).trim();
        if (!serverName) return null;
        const enabledTools = normalizeStringArray(binding.enabledTools);
        return { ...binding, serverName, enabledTools };
      })
      .filter(Boolean);
  }

  /**
   * @override
   *
   * P4 scaffolding: allow skill.md to carry flowTemplates so that commands can be
   * collected by CommandRegistry without a parallel Flow universe.
   */
  getFlowTemplates() {
    const templates = this._metadata?.flowTemplates;
    if (!Array.isArray(templates)) return [];
    return templates.filter((t) => t && typeof t === "object");
  }

  /**
   * @override
   *
   * P3/P4: allow skill.md to define configSchema for dynamic UI and for future runtime validation.
   */
  getConfigSchema() {
    const schema = this._metadata?.configSchema;
    if (Array.isArray(schema)) {
      return { version: "1.0", fields: schema };
    }
    if (schema && typeof schema === "object" && Array.isArray(schema.fields)) {
      return schema;
    }
    return super.getConfigSchema();
  }
}

module.exports = { MarkdownSkill };
