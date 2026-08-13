const ToolResult = require("./toolResult");

/**
 * Coordinates queued tool calls for the streaming runtime so queued/executing
 * calls can be discarded without changing result ordering.
 */
class StreamingToolExecutor {
  /**
   * @param {Map<string, Object>} functions
   * @param {(call: Object, toolUseId: string, trackedTool: Object) => Promise<ToolResult>} executorFn
   * @param {Object} [options]
   * @param {number} [options.maxConcurrency]
   * @param {(trackedTool: Object) => void} [options.onQueued]
   * @param {(trackedTool: Object, result: ToolResult) => void} [options.onDiscarded]
   */
  constructor(functions, executorFn, options = {}) {
    this.functions = functions;
    this.executorFn = executorFn;
    this.tools = [];
    this._dedupeSet = new Set();
    this._abortController = new AbortController();
    this._maxConcurrency = Math.max(
      1,
      options.maxConcurrency ||
        parseInt(process.env.AGENT_MAX_TOOL_CONCURRENCY || "5", 10) ||
        1
    );
    this._onQueued =
      typeof options.onQueued === "function" ? options.onQueued : () => {};
    this._onDiscarded =
      typeof options.onDiscarded === "function"
        ? options.onDiscarded
        : () => {};
  }

  /**
   * @param {{name: string, arguments: *}} toolCall
   * @param {string} toolUseId
   * @returns {boolean}
   */
  addTool(toolCall, toolUseId) {
    if (!toolUseId || this._dedupeSet.has(toolUseId)) {
      return false;
    }

    const fn = this.functions.get(toolCall?.name);
    const trackedTool = {
      call: toolCall,
      toolUseId,
      isConcurrencySafe: !!fn?.isConcurrencySafe,
      status: "queued",
      result: null,
      promise: null,
    };

    this._dedupeSet.add(toolUseId);
    this.tools.push(trackedTool);
    this._onQueued(trackedTool);
    this._processQueue();
    return true;
  }

  /**
   * @private
   * @param {ToolResult} result
   * @returns {boolean}
   */
  _shouldAbortSiblings(result) {
    if (!result?.isError || this._abortController.signal.aborted) {
      return false;
    }

    if (["permissionDenied", "cancelled", "planOnly"].includes(result.type)) {
      return false;
    }

    if (
      result.type === "inputError" &&
      /already executed/i.test(String(result.content || ""))
    ) {
      return false;
    }

    return true;
  }

  /**
   * @private
   */
  _processQueue() {
    if (this._abortController.signal.aborted) {
      return;
    }

    let executingCount = this.tools.filter(
      (tool) => tool.status === "executing"
    ).length;

    for (const tool of this.tools) {
      if (tool.status !== "queued") {
        continue;
      }

      if (executingCount >= this._maxConcurrency) {
        break;
      }

      if (!tool.isConcurrencySafe && executingCount > 0) {
        break;
      }

      if (
        this.tools.some(
          (item) =>
            item.status === "executing" && item.isConcurrencySafe === false
        )
      ) {
        break;
      }

      tool.status = "executing";
      executingCount += 1;
      tool.promise = Promise.resolve(
        this.executorFn(tool.call, tool.toolUseId, tool)
      )
        .then((result) => {
          if (tool.status === "discarded") {
            return tool.result;
          }

          tool.result = result;
          tool.status = "completed";

          if (this._shouldAbortSiblings(result)) {
            this.discard(`sibling_abort:${tool.call.name}`, {
              excludeToolUseIds: [tool.toolUseId],
            });
          }

          this._processQueue();
          return tool.result;
        })
        .catch((error) => {
          if (tool.status === "discarded") {
            return tool.result;
          }

          const errorResult = ToolResult.inputError(
            tool.toolUseId,
            tool.call.name,
            error?.message || String(error || "Tool execution failed.")
          );
          tool.result = errorResult;
          tool.status = "completed";

          if (this._shouldAbortSiblings(errorResult)) {
            this.discard(`sibling_abort:${tool.call.name}`, {
              excludeToolUseIds: [tool.toolUseId],
            });
          }

          this._processQueue();
          return tool.result;
        });
    }
  }

  /**
   * @param {Object} [options]
   * @param {boolean} [options.includeDiscarded=false]
   * @returns {Promise<ToolResult[]>}
   */
  async getResults(options = {}) {
    const includeDiscarded = !!options.includeDiscarded;
    const results = [];

    for (const tool of this.tools) {
      if (tool.status === "discarded" && !includeDiscarded) {
        continue;
      }

      if (tool.promise && tool.status !== "discarded") {
        await tool.promise;
      }

      if (tool.result) {
        results.push(tool.result);
      }
    }

    return results;
  }

  /**
   * @param {string} [reason]
   * @param {Object} [options]
   * @param {string[]} [options.excludeToolUseIds]
   * @returns {void}
   */
  discard(reason = "streaming_fallback", options = {}) {
    const excluded = new Set(options.excludeToolUseIds || []);

    if (!this._abortController.signal.aborted) {
      this._abortController.abort(reason);
    }

    for (const tool of this.tools) {
      if (excluded.has(tool.toolUseId)) {
        continue;
      }

      if (!["queued", "executing"].includes(tool.status)) {
        continue;
      }

      tool.status = "discarded";
      if (!tool.result) {
        tool.result = ToolResult.cancelled(
          tool.toolUseId,
          tool.call.name,
          reason
        );
        this._onDiscarded(tool, tool.result);
      }
    }
  }

  get stats() {
    return {
      total: this.tools.length,
      queued: this.tools.filter((tool) => tool.status === "queued").length,
      executing: this.tools.filter((tool) => tool.status === "executing")
        .length,
      completed: this.tools.filter((tool) => tool.status === "completed")
        .length,
      discarded: this.tools.filter((tool) => tool.status === "discarded")
        .length,
    };
  }
}

module.exports = StreamingToolExecutor;
