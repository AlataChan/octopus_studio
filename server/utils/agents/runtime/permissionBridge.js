const { evaluateToolCall } = require("../../permissions");

/**
 * Shared adapter that routes runtime-tool permission checks through the
 * existing tool gateway without changing current AIbitat behavior.
 */
class PermissionBridge {
  /**
   * @param {Object} permissionConfig
   */
  constructor(permissionConfig = {}) {
    this.permissionConfig = permissionConfig;
  }

  /**
   * @param {Object} toolDescriptor
   * @param {*} _args
   * @param {Object} [context]
   * @returns {{decision: string, reason: string, code?: string}}
   */
  evaluate(toolDescriptor, _args, context = {}) {
    return evaluateToolCall({
      toolName: toolDescriptor.name,
      riskLevel: toolDescriptor.riskLevel,
      permissionMode:
        context.permissionMode || this.permissionConfig.permissionMode,
      allowedTools:
        context.allowedTools || this.permissionConfig.allowedTools || [],
      autoApprovedTools:
        context.autoApprovedTools ||
        this.permissionConfig.autoApprovedTools ||
        [],
      toolRegistry:
        context.toolRegistry || this.permissionConfig.toolRegistry || {},
    });
  }
}

module.exports = PermissionBridge;
