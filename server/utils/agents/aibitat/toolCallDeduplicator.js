/**
 * Deduplicates tool calls by name + stable argument fingerprint so fallback
 * and retry paths do not execute the same completed call twice.
 */
class ToolCallDeduplicator {
  constructor() {
    /** @type {Map<string, {completedToolUseId: string|null, inFlightToolUseIds: Set<string>}>} */
    this._executed = new Map();
  }

  /**
   * @private
   * @param {*} value
   * @returns {string}
   */
  #stableStringify(value) {
    if (value === null || value === undefined) return JSON.stringify(value);
    if (typeof value !== "object") return JSON.stringify(value);

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.#stableStringify(item)).join(",")}]`;
    }

    const keys = Object.keys(value).sort();
    return `{${keys
      .map(
        (key) => `${JSON.stringify(key)}:${this.#stableStringify(value[key])}`
      )
      .join(",")}}`;
  }

  /**
   * @param {string} toolName
   * @param {*} args
   * @returns {string}
   */
  fingerprint(toolName, args) {
    const argsStr =
      typeof args === "string" ? args : this.#stableStringify(args || {});
    return `${toolName}:${argsStr}`;
  }

  /**
   * @param {string} toolName
   * @param {*} args
   * @param {string} toolUseId
   * @returns {{isDuplicate: boolean, previousToolUseId?: string}}
   */
  check(toolName, args, toolUseId) {
    const fp = this.fingerprint(toolName, args);
    const existing = this._executed.get(fp);

    if (existing?.completedToolUseId) {
      return {
        isDuplicate: true,
        previousToolUseId: existing.completedToolUseId,
      };
    }

    if (existing) {
      existing.inFlightToolUseIds.add(toolUseId);
    } else {
      this._executed.set(fp, {
        completedToolUseId: null,
        inFlightToolUseIds: new Set([toolUseId]),
      });
    }

    return { isDuplicate: false };
  }

  /**
   * @param {string} toolUseId
   */
  markCompleted(toolUseId) {
    for (const entry of this._executed.values()) {
      if (entry.inFlightToolUseIds.has(toolUseId)) {
        entry.inFlightToolUseIds.delete(toolUseId);
        entry.completedToolUseId = toolUseId;
        break;
      }
    }
  }

  discardIncomplete() {
    for (const [fp, entry] of this._executed.entries()) {
      entry.inFlightToolUseIds.clear();

      if (!entry.completedToolUseId) {
        this._executed.delete(fp);
      }
    }
  }

  reset() {
    this._executed.clear();
  }
}

module.exports = ToolCallDeduplicator;
