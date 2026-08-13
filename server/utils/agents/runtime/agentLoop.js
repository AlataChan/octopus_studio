/**
 * Thin wrapper around AIbitat execution so SessionEngine can target a stable
 * loop abstraction without reimplementing the turn machine in Phase 4.
 */
class AgentLoop {
  /**
   * @param {{
   * aibitat: Object,
   * route: {from: string, to: string},
   * messages?: Array,
   * tools?: Map<string, Object>|Array,
   * eventLog?: Object|null,
   * options?: Object
   * }} params
   */
  constructor({
    aibitat,
    route,
    messages = [],
    tools = new Map(),
    eventLog = null,
    options = {},
  }) {
    this.aibitat = aibitat;
    this.route = route;
    this.messages = messages;
    this.tools = tools;
    this.eventLog = eventLog;
    this.options = options;
    this.maxTurns = options.maxTurns || 100;
    this._result = null;
    this._aborted = false;
  }

  /**
   * @private
   * @returns {string|null}
   */
  _extractResult() {
    const chats = Array.isArray(this.aibitat?._chats)
      ? [...this.aibitat._chats]
      : [];
    const directMatch = chats
      .reverse()
      .find(
        (chat) =>
          chat?.from === this.route?.to &&
          chat?.to === this.route?.from &&
          typeof chat?.content !== "undefined"
      );

    if (directMatch) {
      return directMatch.content;
    }

    return chats.length ? (chats.at(-1)?.content ?? null) : null;
  }

  /**
   * @param {string} content
   * @returns {AsyncGenerator<{type: string, content: string|null}, void, void>}
   */
  async *run(content) {
    if (this._aborted) return;

    await this.aibitat.start({
      ...this.route,
      content,
    });

    this._result = this._extractResult();
    yield {
      type: "result",
      content: this._result,
    };
  }

  /**
   * @returns {string|null}
   */
  getResult() {
    return this._result;
  }

  /**
   * @param {string} [_reason]
   */
  abort(_reason) {
    this._aborted = true;
    this.aibitat?.abort?.();
  }
}

module.exports = AgentLoop;
