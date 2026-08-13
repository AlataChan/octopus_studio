/**
 * Structured tool result wrapper used by the Phase 1 turn-state runtime.
 */
class ToolResult {
  /**
   * @param {Object} params
   * @param {string} params.type
   * @param {string} params.toolUseId
   * @param {string} params.toolName
   * @param {*} params.content
   * @param {boolean} [params.isError]
   * @param {Object|null} [params.originalFunctionCall]
   * @param {Object} [params.meta]
   */
  constructor({
    type,
    toolUseId,
    toolName,
    content,
    isError = false,
    originalFunctionCall = null,
    meta = {},
  }) {
    this.type = type;
    this.toolUseId = toolUseId;
    this.toolName = toolName;
    this.content = content;
    this.isError = isError;
    this.originalFunctionCall = originalFunctionCall;
    this.meta = meta;
  }

  /**
   * @param {string} toolUseId
   * @param {string} toolName
   * @param {*} content
   * @param {Object} [options]
   * @returns {ToolResult}
   */
  static success(toolUseId, toolName, content, options = {}) {
    return new ToolResult({
      type: options.directOutput ? "direct_output" : "success",
      toolUseId,
      toolName,
      content,
      isError: false,
      originalFunctionCall: options.originalFunctionCall || null,
      meta: {
        directOutput: !!options.directOutput,
      },
    });
  }

  /**
   * @param {string} toolUseId
   * @param {string} toolName
   * @param {string} message
   * @param {Object} [options]
   * @returns {ToolResult}
   */
  static inputError(toolUseId, toolName, message, options = {}) {
    return new ToolResult({
      type: "inputError",
      toolUseId,
      toolName,
      content: String(message || "Tool execution failed."),
      isError: true,
      originalFunctionCall: options.originalFunctionCall || null,
    });
  }

  /**
   * @param {string} toolUseId
   * @param {string} toolName
   * @param {string} reason
   * @param {Object} [options]
   * @returns {ToolResult}
   */
  static permissionDenied(toolUseId, toolName, reason, options = {}) {
    return new ToolResult({
      type: "permissionDenied",
      toolUseId,
      toolName,
      content:
        options.message ||
        `工具 "${toolName}" 无法执行: ${reason}。请尝试其他方式完成任务。`,
      isError: true,
      originalFunctionCall: options.originalFunctionCall || null,
    });
  }

  /**
   * @param {string} toolUseId
   * @param {string} toolName
   * @param {number} durationMs
   * @param {Object} [options]
   * @returns {ToolResult}
   */
  static timeout(toolUseId, toolName, durationMs, options = {}) {
    return new ToolResult({
      type: "timeout",
      toolUseId,
      toolName,
      content:
        options.message ||
        `工具 "${toolName}" 执行超时（${durationMs}ms）。请调整方案后重试。`,
      isError: true,
      originalFunctionCall: options.originalFunctionCall || null,
      meta: { durationMs },
    });
  }

  /**
   * @param {string} toolUseId
   * @param {string} toolName
   * @param {string} reason
   * @param {Object} [options]
   * @returns {ToolResult}
   */
  static cancelled(toolUseId, toolName, reason, options = {}) {
    return new ToolResult({
      type: "cancelled",
      toolUseId,
      toolName,
      content: reason || `工具 "${toolName}" 已取消。`,
      isError: true,
      originalFunctionCall: options.originalFunctionCall || null,
    });
  }

  /**
   * @param {string} toolUseId
   * @param {string} toolName
   * @param {*} args
   * @param {Object} [options]
   * @returns {ToolResult}
   */
  static planOnly(toolUseId, toolName, args, options = {}) {
    const serializedArgs =
      typeof args === "string" ? args : JSON.stringify(args || {});

    return new ToolResult({
      type: "planOnly",
      toolUseId,
      toolName,
      content: `[计划模式] 工具 "${toolName}" 已添加到执行计划中，参数: ${serializedArgs}。请继续规划其他步骤，或告知用户当前的执行计划。`,
      isError: false,
      originalFunctionCall: options.originalFunctionCall || null,
    });
  }

  /**
   * 工具因需人工审批而挂起（编排 HITL）。isError:false → 不被 streamingToolExecutor 当失败。
   * @param {string} toolUseId
   * @param {string} toolName
   * @param {string} confirmationId
   * @param {Object} [options]
   * @returns {ToolResult}
   */
  static approvalSuspended(toolUseId, toolName, confirmationId, options = {}) {
    return new ToolResult({
      type: "approvalSuspended",
      toolUseId,
      toolName,
      content:
        options.message ||
        `⏸️ 工具 "${toolName}" 需人工审批后继续（审批ID: ${confirmationId}）。`,
      isError: false,
      originalFunctionCall: options.originalFunctionCall || null,
      meta: { confirmationId, suspended: true },
    });
  }

  /**
   * @returns {{name: string, role: string, content: *, originalFunctionCall?: Object}}
   */
  toFunctionMessage() {
    return {
      name: this.toolName,
      role: "function",
      content: this.content,
      ...(this.originalFunctionCall
        ? { originalFunctionCall: this.originalFunctionCall }
        : {}),
    };
  }

  /**
   * @returns {string}
   */
  serialize() {
    return JSON.stringify({
      type: this.type,
      toolUseId: this.toolUseId,
      toolName: this.toolName,
      content: this.content,
      isError: this.isError,
      meta: this.meta,
    });
  }
}

module.exports = ToolResult;
