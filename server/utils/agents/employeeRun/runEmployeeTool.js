const { EmployeeRunService } = require("./index");

/**
 * 创建绑定运行上下文的 run_employee 可调用。M1 用 @mastra createTool 包 .invoke。
 * @param {{
 *   workspace, user?, parentRunId?, depth?, maxDepth?, signal?, onEvent?, service?,
 *   approvalDelegate?   // T6d: 每步 ApprovalBroker，由编排器注入
 *   modelOverride?, readOnly?
 * }} boundContext
 */
function createRunEmployeeTool(boundContext = {}) {
  const hasModelOverride = Object.prototype.hasOwnProperty.call(
    boundContext,
    "modelOverride"
  );
  const hasReadOnly = Object.prototype.hasOwnProperty.call(
    boundContext,
    "readOnly"
  );
  const {
    workspace, user = null, parentRunId = null,
    depth = 0, maxDepth = 1, signal = null, onEvent = null,
    service = new EmployeeRunService(),
    approvalDelegate = null,
    modelOverride = null,
    readOnly = false,
  } = boundContext;

  return {
    name: "run_employee",
    description:
      "Run a selected AI employee for one turn and return its text/artifacts/sources.",
    inputSchema: {
      assistantId: "string (required) — the AI employee to run",
      task: "string (required) — the subtask for the employee",
      context: "string|object (optional) — prior-step output / injected context",
    },
    async invoke({ assistantId, task, context = null } = {}) {
      // 防递归(B5 的边界冗余守卫):depth>=maxDepth 不应再起子运行
      if (depth >= maxDepth) {
        return {
          text: null, artifacts: [], sources: [], events: [], runId: null,
          usage: { inputTokens: 0, outputTokens: 0 },
          error: {
            code: "depth_exceeded",
            message: `run_employee disabled at depth ${depth} (maxDepth ${maxDepth})`,
          },
        };
      }
      const runArgs = {
        workspace, user, assistantId, task, context,
        parentRunId, signal, onEvent,
        maxDepth,
        depth: depth + 1, // 子运行深度 +1
        approvalDelegate: approvalDelegate ?? null, // T6d: 透传每步 ApprovalBroker
      };
      if (hasModelOverride) runArgs.modelOverride = modelOverride ?? null;
      if (hasReadOnly) runArgs.readOnly = readOnly === true;
      return service.run(runArgs);
    },
  };
}

module.exports = { createRunEmployeeTool };
