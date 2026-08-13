const { RiskLevel } = require("../../permissions/constants");

/**
 * Canonical tool description used by the runtime layer to represent built-in,
 * plugin, and MCP tools in a single format.
 */
class ToolDescriptor {
  /**
   * @param {Object} params
   * @param {string} params.name
   * @param {string} [params.description]
   * @param {Object} [params.parameters]
   * @param {Function} params.handler
   * @param {boolean} [params.isConcurrencySafe]
   * @param {boolean} [params.isReadOnly]
   * @param {boolean} [params.isDestructive]
   * @param {string} [params.riskLevel]
   * @param {"builtin"|"mcp"|"plugin"} [params.source]
   * @param {{serverName: string, toolName: string}|null} [params.mcpInfo]
   * @param {number|null} [params.timeout]
   * @param {Array} [params.examples]
   */
  constructor({
    name,
    description = "",
    parameters = {},
    handler,
    isConcurrencySafe = false,
    isReadOnly = false,
    isDestructive = false,
    riskLevel = RiskLevel.SAFE_READ,
    source = "builtin",
    mcpInfo = null,
    timeout = null,
    examples = [],
  }) {
    this.name = name;
    this.description = description;
    this.parameters = parameters || {};
    this.handler = handler;
    this.isConcurrencySafe = !!isConcurrencySafe;
    this.isReadOnly = !!isReadOnly;
    this.isDestructive = !!isDestructive;
    this.riskLevel = riskLevel || RiskLevel.SAFE_READ;
    this.source = source || "builtin";
    this.mcpInfo = mcpInfo || null;
    this.timeout = timeout ?? null;
    this.examples = Array.isArray(examples) ? examples : [];
  }

  /**
   * Convert the descriptor into the legacy AIbitat function registration shape.
   *
   * @param {Object} aibitat
   * @returns {Object}
   */
  toFunctionConfig(aibitat) {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      handler: this.handler,
      isConcurrencySafe: this.isConcurrencySafe,
      isReadOnly: this.isReadOnly,
      isDestructive: this.isDestructive,
      examples: this.examples,
      timeout: this.timeout,
      super: aibitat,
      controller: new AbortController(),
    };
  }
}

module.exports = ToolDescriptor;
