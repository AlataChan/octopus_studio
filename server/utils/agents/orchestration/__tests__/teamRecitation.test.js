const { TeamOrchestrationService } = require("../teamOrchestrationService");

function makeService() {
  const recordedContexts = [];
  const events = [];
  const svc = new TeamOrchestrationService({
    createPlan: async () => ({ steps: [{ assistantId: "a1", subtask: "t1" }] }),
    createApprovalBroker: () => ({ requestApproval: async () => ({ decision: "approved" }) }),
    runStore: { create: async () => "run-1", update: async () => {}, finalize: async () => {}, get: async () => null },
    buildRunEmployeeMastraTool: () => ({
      execute: async ({ context }) => { recordedContexts.push(context); return { text: "out1", sources: [], artifacts: [] }; },
    }),
  });
  return { svc, recordedContexts, events };
}
const baseArgs = (onEvent) => ({
  workspace: { id: 1 }, user: { id: 1 }, thread: null,
  goal: "团队目标", employees: [{ assistantId: "a1", name: "Vera" }], onEvent,
});

describe("B3 recitation wiring", () => {
  afterEach(() => {
    delete process.env.TEAM_RECITATION_ENABLED;
    delete process.env.STORAGE_DIR;
  });

  it("flag off → employee receives raw accumulated context (passthrough)", async () => {
    process.env.TEAM_RECITATION_ENABLED = "false";
    const { svc, recordedContexts } = makeService();
    await svc.run(baseArgs(() => {}));
    expect(recordedContexts[0]).not.toContain("[团队计划]");
  });

  it("flag on → employee receives structured recitation block", async () => {
    process.env.TEAM_RECITATION_ENABLED = "true";
    process.env.STORAGE_DIR = "/tmp/alata-storage";
    const { svc, recordedContexts, events } = makeService();
    await svc.run(baseArgs((e) => events.push(e)));
    expect(recordedContexts[0]).toContain("[团队计划]");
    // plan.md 作为 fileDownload artifact 暴露（{filename,b64Content} 形状，与现有插件一致）
    const dl = events.find((e) => e.type === "fileDownload");
    expect(dl).toBeTruthy();
    expect(dl.content.filename).toBe("plan.md");
    expect(String(dl.content.b64Content)).toContain("base64,");
  });

  it("flag on → retry receives the SAME recitation stepContext", async () => {
    process.env.TEAM_RECITATION_ENABLED = "true";
    process.env.STORAGE_DIR = "/tmp/alata-storage";
    const recorded = [];
    let n = 0;
    const svc = new TeamOrchestrationService({
      createPlan: async () => ({ steps: [{ assistantId: "a1", subtask: "t1" }] }),
      createApprovalBroker: () => ({ requestApproval: async () => ({ decision: "approved" }) }),
      runStore: { create: async () => "run-1", update: async () => {}, finalize: async () => {}, get: async () => null },
      buildRunEmployeeMastraTool: () => ({
        execute: async ({ context }) => {
          recorded.push(context);
          return n++ === 0 ? { error: { code: "x" } } : { text: "ok", sources: [], artifacts: [] };
        },
      }),
    });
    await svc.run(baseArgs(() => {}));
    expect(recorded.length).toBe(2);       // 首次失败 + 重试
    expect(recorded[0]).toBe(recorded[1]); // 同一 stepContext
    expect(recorded[0]).toContain("[团队计划]");
  });
});
