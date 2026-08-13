const ToolDescriptor = require("./toolDescriptor");

/**
 * Registry that stores all runtime tools in ToolDescriptor form and can sync
 * them to the legacy AIbitat function registry.
 */
class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  /**
   * @param {ToolDescriptor|Object} descriptor
   * @returns {ToolRegistry}
   */
  register(descriptor) {
    const entry =
      descriptor instanceof ToolDescriptor
        ? descriptor
        : new ToolDescriptor(descriptor);
    this.tools.set(entry.name, entry);
    return this;
  }

  /**
   * @param {Array|Map<string, *>} descriptors
   * @returns {ToolRegistry}
   */
  registerAll(descriptors = []) {
    const values =
      descriptors instanceof Map
        ? [...descriptors.values()]
        : Array.isArray(descriptors)
          ? descriptors
          : Object.values(descriptors || {});

    for (const descriptor of values) {
      this.register(descriptor);
    }
    return this;
  }

  /**
   * @param {string} name
   * @returns {ToolDescriptor|undefined}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * @returns {ToolDescriptor[]}
   */
  getAll() {
    return [...this.tools.values()];
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * Sync the registry to the legacy AIbitat runtime.
   *
   * @param {Object} aibitat
   * @returns {ToolRegistry}
   */
  syncToAibitat(aibitat) {
    for (const descriptor of this.tools.values()) {
      aibitat.function(descriptor.toFunctionConfig(aibitat));
    }
    return this;
  }

  /**
   * Import already-registered AIbitat functions into the registry.
   *
   * @param {Object} aibitat
   * @returns {ToolRegistry}
   */
  importFromAibitat(aibitat) {
    for (const [name, fn] of aibitat.functions || new Map()) {
      if (this.tools.has(name)) continue;

      this.register({
        name,
        description: fn.description || "",
        parameters: fn.parameters || {},
        handler: fn.handler,
        isConcurrencySafe: fn.isConcurrencySafe ?? false,
        isReadOnly: fn.isReadOnly ?? false,
        isDestructive: fn.isDestructive ?? false,
        source: fn.source || "builtin",
      });
    }

    return this;
  }
}

module.exports = ToolRegistry;
