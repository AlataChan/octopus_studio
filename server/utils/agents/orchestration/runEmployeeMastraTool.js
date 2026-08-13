const { createRunEmployeeTool } = require("../employeeRun/runEmployeeTool");
const { loadMastra } = require("../../workAgent/mastraLoader");

/**
 * 构造绑定运行上下文的 run_employee Mastra 工具。
 * @param {{
 *   workspace, user?, parentRunId?, depth?, maxDepth?, signal?, onEvent?,
 *   service?,         // 注入 EmployeeRunService 实例(测试用)
 *   loadMastra?,      // 注入(测试用)
 *   createRunEmployeeTool?,  // 注入(测试用)
 *   approvalDelegate?,       // T6d: 每步 ApprovalBroker，由编排器注入
 *   modelOverride?, readOnly?,
 * }} ctx
 * @returns Mastra tool
 */
function buildRunEmployeeMastraTool(ctx = {}) {
  const _loadMastra = ctx.loadMastra || loadMastra;
  const _createRunEmployeeTool = ctx.createRunEmployeeTool || createRunEmployeeTool;
  const { createTool, z } = _loadMastra();

  const callableContext = {
    workspace: ctx.workspace, user: ctx.user ?? null,
    parentRunId: ctx.parentRunId ?? null,
    depth: ctx.depth ?? 0, maxDepth: ctx.maxDepth ?? 1,
    signal: ctx.signal ?? null, onEvent: ctx.onEvent ?? null,
    service: ctx.service, // 透传(undefined → M0 默认 new EmployeeRunService())
    approvalDelegate: ctx.approvalDelegate ?? null, // T6d: 透传每步 ApprovalBroker
  };
  if (Object.prototype.hasOwnProperty.call(ctx, "modelOverride")) {
    callableContext.modelOverride = ctx.modelOverride ?? null;
  }
  if (ctx.readOnly === true) callableContext.readOnly = true;
  const callable = _createRunEmployeeTool(callableContext);

  return createTool({
    id: "run_employee",
    description:
      "Run a selected AI employee for one turn. Input: assistantId, task, optional context (prior step output). Returns the employee's text, sources, artifacts.",
    inputSchema: z.object({
      assistantId: z.string(),
      task: z.string(),
      context: z.string().optional(),
    }),
    execute: async (input) => {
      const { assistantId, task, context } = input || {};
      const result = await callable.invoke({ assistantId, task, context: context ?? null });
      // 裁剪:过程事件已经 onEvent 外发,工具结果只回精炼字段
      return {
        text: result.text ?? null,
        sources: result.sources ?? [],
        artifacts: result.artifacts ?? [],
        runId: result.runId ?? null,
        error: result.error ?? null,
      };
    },
  });
}

module.exports = { buildRunEmployeeMastraTool };
