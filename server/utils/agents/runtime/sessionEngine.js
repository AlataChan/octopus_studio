const AgentLoop = require("./agentLoop");
const ToolRegistry = require("./toolRegistry");
const PermissionBridge = require("./permissionBridge");

/**
 * Holds agent-session state, transcript persistence, and result wrapping for
 * the Phase 4 runtime layering work.
 */
class SessionEngine {
  /**
   * @param {{
   * sessionId?: string|null,
   * workspaceId?: number|string|null,
   * agentConfig?: Object,
   * tools?: Map<string, Object>|Array,
   * transcript: Object,
   * eventLog?: Object|null,
   * aibitat?: Object|null,
   * route?: {from: string, to: string}|null,
   * options?: Object,
   * createAgentLoop?: Function|null
   * }} params
   */
  constructor({
    sessionId = null,
    workspaceId = null,
    agentConfig = {},
    tools = new Map(),
    transcript,
    eventLog = null,
    aibitat = null,
    route = null,
    options = {},
    createAgentLoop = null,
  }) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.agentConfig = agentConfig;
    this.tools = tools;
    this.transcript = transcript;
    this.eventLog = eventLog;
    this.options = options;
    this.aibitat = aibitat;
    this.route = route;
    this.mutableMessages = [];
    this.usage = { inputTokens: 0, outputTokens: 0 };
    this.permissionDenials = [];
    this.result = null;
    this._agentLoop = null;
    this.toolRegistry = null;
    this.permissionBridge = null;
    this._toolRegistrySynced = false;
    this._createAgentLoop =
      typeof createAgentLoop === "function"
        ? createAgentLoop
        : (params) => new AgentLoop(params);

    if (this.isToolRegistryEnabled()) {
      this.toolRegistry =
        tools instanceof ToolRegistry
          ? tools
          : new ToolRegistry().registerAll(tools);

      if (this.aibitat) {
        this.toolRegistry.importFromAibitat(this.aibitat);
      }

      this.permissionBridge = new PermissionBridge({
        ...(this.options.permissionConfig || {}),
        ...(this.agentConfig.permissionConfig || {}),
        toolRegistry: Object.fromEntries(
          this.toolRegistry.getAll().map((tool) => [tool.name, tool])
        ),
      });
    }
  }

  /**
   * @returns {boolean}
   */
  isToolRegistryEnabled() {
    return process.env.USE_TOOL_REGISTRY === "true";
  }

  /**
   * @private
   */
  #syncToolRegistryToAibitat() {
    if (!this.toolRegistry || !this.aibitat || this._toolRegistrySynced) return;
    this.toolRegistry.syncToAibitat(this.aibitat);
    this._toolRegistrySynced = true;
  }

  /**
   * @param {string} userMessage
   * @returns {AsyncGenerator<Object, void, void>}
   */
  async *submitMessage(userMessage) {
    const entry = { role: "user", content: userMessage };
    this.mutableMessages.push(entry);
    await this.transcript.append(entry);

    this.#syncToolRegistryToAibitat();

    const agentLoop = this._createAgentLoop({
      aibitat: this.aibitat,
      route: this.route,
      messages: this.mutableMessages,
      tools: this.toolRegistry ? this.toolRegistry.getAll() : this.tools,
      eventLog: this.eventLog,
      options: {
        ...this.options,
        ...this.agentConfig,
      },
    });
    this._agentLoop = agentLoop;

    try {
      for await (const event of agentLoop.run(userMessage)) {
        if (event?.type === "result") {
          const assistantEntry = {
            role: "assistant",
            content: event.content,
          };
          this.mutableMessages.push(assistantEntry);
          await this.transcript.append(assistantEntry);
        }
        yield event;
      }

      this.result = { type: "success", content: agentLoop.getResult() };
    } catch (error) {
      this.result = {
        type: "error",
        content: error?.message || String(error),
      };
      throw error;
    } finally {
      await this.transcript.flush();
      this._agentLoop = null;
    }
  }

  /**
   * @param {Object} event
   * @param {Function|null} formatter
   * @returns {*}
   */
  formatEvent(event, formatter = null) {
    if (typeof formatter !== "function") return event;
    return formatter(event, this);
  }

  /**
   * @param {string} userMessage
   * @param {Function|null} formatter
   * @returns {AsyncGenerator<*, void, void>}
   */
  async *streamFormattedEvents(userMessage, formatter = null) {
    for await (const event of this.submitMessage(userMessage)) {
      const formatted = this.formatEvent(event, formatter);
      if (typeof formatted === "undefined" || formatted === null) continue;
      yield formatted;
    }
  }

  /**
   * @returns {string}
   */
  getResultContent() {
    return String(this.result?.content || "");
  }

  /**
   * @param {string} reason
   */
  abort(reason) {
    this._agentLoop?.abort(reason);
  }
}

module.exports = SessionEngine;
