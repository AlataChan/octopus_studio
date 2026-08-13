const { researchSubagent } = require("../research-subagent");

function fakeAibitat(depth = 0, maxDepth = 1) {
  const fns = {};
  return {
    handlerProps: { invocation: { workspace: { id: 1 }, workspace_id: 1, assistant_id: "a1", user_id: 1 }, runId: "r0", depth, maxDepth },
    function(cfg) { fns[cfg.name] = cfg; },
    _fns: fns,
  };
}

describe("research-subagent plugin", () => {
  it("registers 'research' (isReadOnly) and runs read-only sub-run with depth+1", async () => {
    const calls = [];
    const fakeService = { run: async (a) => { calls.push(a); return { text: "结论：X", error: null }; } };
    const ab = fakeAibitat(0, 1);
    researchSubagent.plugin({ EmployeeRunService: function () { return fakeService; } }).setup(ab);
    const tool = ab._fns["research"];
    expect(tool.isReadOnly).toBe(true);
    const out = await tool.handler.call({ super: ab }, { query: "调查市场" });
    expect(String(out)).toContain("结论：X");
    expect(calls[0].readOnly).toBe(true);
    expect(calls[0].depth).toBe(1);
    expect(String(calls[0].task)).toContain("调查市场");
  });

  it("refuses when depth >= maxDepth (anti-recursion)", async () => {
    const fakeService = { run: async () => { throw new Error("should not run"); } };
    const ab = fakeAibitat(1, 1); // depth==maxDepth
    researchSubagent.plugin({ EmployeeRunService: function () { return fakeService; } }).setup(ab);
    const out = await ab._fns["research"].handler.call({ super: ab }, { query: "x" });
    expect(String(out)).toMatch(/unavailable|拒绝|depth/i);
  });

  it("resolves workspace from handlerProps.workspace (main agent path)", async () => {
    const calls = [];
    const fakeService = { run: async (a) => { calls.push(a); return { text: "ok", error: null }; } };
    // workspace 在 hp.workspace，而 invocation 不含 workspace（主 agent 路径）
    const ab = {
      handlerProps: { workspace: { id: 7 }, invocation: { assistant_id: "a1" }, depth: 0, maxDepth: 1 },
      function(cfg) { this._fns = this._fns || {}; this._fns[cfg.name] = cfg; },
    };
    researchSubagent.plugin({ EmployeeRunService: function () { return fakeService; } }).setup(ab);
    await ab._fns["research"].handler.call({ super: ab }, { query: "q" });
    expect(calls[0].workspace).toEqual({ id: 7 });
  });
});
