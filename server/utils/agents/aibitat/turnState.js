/**
 * Minimal per-turn execution state for the Phase 1 agent runtime loop.
 */
class TurnState {
  /**
   * @param {Object} params
   * @param {Array} [params.messages]
   * @param {number} [params.turnCount]
   * @param {number} [params.maxTurns]
   */
  constructor({ messages = [], turnCount = 0, maxTurns = Infinity } = {}) {
    /** @type {Array} */
    this.messages = [...messages];
    /** @type {number} */
    this.turnCount = turnCount;
    /** @type {number} */
    this.maxTurns = maxTurns;
    /** @type {Array<{toolUseId: string, name: string, args: *, timestamp: number}>} */
    this.toolCalls = [];
    /** @type {Array<{toolUseId: string, type: string, content: *}>} */
    this.toolResults = [];
    /** @type {null | "continue" | "completed" | "aborted" | "max_turns" | "direct_output" | "suspended_approval"} */
    this.transition = null;
    /** @type {boolean} */
    this.aborted = false;
  }

  /**
   * @param {string} name
   * @param {*} args
   * @param {string} toolUseId
   * @returns {{toolUseId: string, name: string, args: *, timestamp: number}}
   */
  recordToolCall(name, args, toolUseId) {
    const entry = {
      toolUseId,
      name,
      args,
      timestamp: Date.now(),
    };
    this.toolCalls.push(entry);
    return entry;
  }

  /**
   * @param {string} toolUseId
   * @param {{toolUseId: string, type: string, content: *}} result
   * @returns {boolean}
   */
  recordToolResult(toolUseId, result) {
    if (
      !toolUseId ||
      this.toolResults.some((item) => item.toolUseId === toolUseId)
    ) {
      return false;
    }

    this.toolResults.push({
      ...result,
      toolUseId,
    });
    return true;
  }

  /**
   * @returns {boolean}
   */
  hasUnpairedToolCalls() {
    return this.getUnpairedToolCalls().length > 0;
  }

  /**
   * @returns {Array<{toolUseId: string, name: string, args: *, timestamp: number}>}
   */
  getUnpairedToolCalls() {
    const pairedToolUseIds = new Set(
      this.toolResults.map((item) => item.toolUseId).filter(Boolean)
    );

    return this.toolCalls.filter(
      (call) => !pairedToolUseIds.has(call.toolUseId)
    );
  }

  /**
   * @returns {boolean}
   */
  hasReachedMaxTurns() {
    return this.turnCount >= this.maxTurns;
  }

  /**
   * @returns {TurnState}
   */
  nextTurn() {
    return new TurnState({
      messages: this.messages,
      turnCount: this.turnCount + 1,
      maxTurns: this.maxTurns,
    });
  }
}

module.exports = TurnState;
