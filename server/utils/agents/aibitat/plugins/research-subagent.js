const RESEARCH_DIRECTIVE =
  "你是只读研究员。调查下面的问题，只返回简洁综合（关键结论/事实/引用），不要倾倒原文或大段抓取内容。问题：";

const researchSubagent = {
  name: "research-subagent",
  startupConfig: { params: {} },
  plugin: function (deps = {}) {
    const getService = deps.EmployeeRunService
      ? () => new deps.EmployeeRunService()
      : () => new (require("../../employeeRun/index").EmployeeRunService)();
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: "research",
          isReadOnly: true,
          description:
            "Delegate a read-only research subtask to an isolated sub-agent (read/search only, returns a concise synthesis). Use to investigate without flooding your own context.",
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: { query: { type: "string", description: "The research question." } },
            required: ["query"], additionalProperties: false,
          },
          handler: async function ({ query }) {
            const hp = this.super?.handlerProps || {};
            const inv = hp.invocation || {};
            const depth = Number(hp.depth ?? inv.depth ?? 0);
            const maxDepth = Number(hp.maxDepth ?? 1);
            if (depth >= maxDepth) return "research unavailable at this depth (anti-recursion).";
            // workspace 在主 agent 路径上挂 hp.workspace，员工子运行挂 inv.workspace —— 都兜住
            const workspace = hp.workspace || inv.workspace || (inv.workspace_id ? { id: inv.workspace_id } : null);
            const res = await getService().run({
              workspace, user: hp.user ?? null,
              assistantId: inv.assistant_id ?? hp.assistant_id, task: RESEARCH_DIRECTIVE + String(query || ""),
              readOnly: true, depth: depth + 1, maxDepth: depth + 1,
              parentRunId: hp.runId ?? null,
            });
            if (res?.error) return JSON.stringify({ success: false, error: res.error });
            return res?.text || "(研究无结果)";
          },
        });
      },
    };
  },
};

module.exports = { researchSubagent };
