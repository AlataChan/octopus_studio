const { EmployeeRunService } = require("../index");

function fakeAibitat() {
  return {
    functions: new Map([
      ["search", { isReadOnly: true }],
      ["done", { isReadOnly: false }],        // 完成控制工具：只读运行必须保留（否则子运行无法收尾）
      ["write_file", { isReadOnly: false }],
      ["research", { isReadOnly: true }],     // 保留名：即便只读也要剔除
      ["run_employee", { isReadOnly: false }],
    ]),
    handlerProps: null,
    function() {}, agent() {}, use() {}, setPermissionConfig() {},
    onAbort() {}, onTerminate() {},
  };
}

describe("EmployeeRunService readOnly filtering", () => {
  it("readOnly=true keeps only isReadOnly && non-reserved tools", async () => {
    const ab = fakeAibitat();
    const svc = new EmployeeRunService({
      AgentRuntimeFactory: {
        resolveProviderModel: () => ({ provider: "openai", model: "x" }),
        assemble: async () => ({ permissionConfig: {}, userAgentDef: {}, workspaceAgentDef: {}, funcsToLoad: [] }),
      },
      attachAgentPlugins: async () => {},
      createAibitat: (opts) => { ab.handlerProps = opts?.handlerProps || ab.handlerProps; return ab; }, // 捕获构造 opts
      httpSocket: { plugin: () => ({}) },
    });
    await svc.run({ workspace: { id: 1 }, assistantId: "a1", task: "t", readOnly: true, depth: 1, maxDepth: 1 }).catch(() => {});
    const names = [...ab.functions.keys()];
    expect(names).toEqual(["search", "done"]); // 只读 + done 保留；write_file/research/run_employee 剔除
    // depth 注入 handlerProps（来自真实 createAibitat payload）
    expect(ab.handlerProps?.depth).toBe(1);
  });
});
