const { TeamOrchestrationService } = require("../teamOrchestrationService");

function makeService({ brokerDecision, brokerThrows = false }) {
  const updates = [];
  const svc = new TeamOrchestrationService({
    createPlan: async () => ({ steps: [{ assistantId: "a1", subtask: "t1" }, { assistantId: "a2", subtask: "t2" }] }),
    createApprovalBroker: () => ({
      requestApproval: async () => {
        if (brokerThrows) throw new Error("plan gate must NOT be called on resume");
        return brokerDecision === "suspend" ? { decision: "suspend", confirmationId: "c1" }
          : brokerDecision === "rejected" ? { decision: "rejected" }
          : { decision: "approved" };
      },
    }),
    runStore: { create: async () => "run-1", update: async (id, patch) => { updates.push(patch); }, finalize: async () => {}, get: async () => null },
    buildRunEmployeeMastraTool: () => ({ execute: async () => ({ text: "ok", sources: [], artifacts: [] }) }),
  });
  svc.__updates = updates;
  return svc;
}
const baseArgs = { workspace: { id: 1 }, user: { id: 1 }, thread: null, goal: "做团队任务", employees: [{ assistantId: "a1" }, { assistantId: "a2" }], onEvent: () => {} };

describe("B1 plan approval gate", () => {
  afterEach(() => { delete process.env.TEAM_PLAN_APPROVAL_ENABLED; });

  it("flag off → no suspend", async () => {
    process.env.TEAM_PLAN_APPROVAL_ENABLED = "false";
    const res = await makeService({ brokerDecision: "approved" }).run({ ...baseArgs });
    expect(res.status).not.toBe("suspended");
  });
  it("flag on + suspend → suspended, zero steps, persists resume contract", async () => {
    process.env.TEAM_PLAN_APPROVAL_ENABLED = "true";
    const svc = makeService({ brokerDecision: "suspend" });
    const res = await svc.run({ ...baseArgs });
    expect(res.status).toBe("suspended");
    expect(res.steps).toEqual([]);
    // 核心 resume 契约：cursor:0 / status:suspended / pendingConfirmationId 已持久化
    const sus = svc.__updates.find((p) => p.status === "suspended");
    expect(sus).toBeTruthy();
    expect(sus.cursor).toBe(0);
    expect(sus.pendingConfirmationId).toBe("c1");
    expect(sus).toHaveProperty("accumulatedContext"); // resume 契约：上下文也持久化
  });
  it("flag on + rejected → rejected, zero steps", async () => {
    process.env.TEAM_PLAN_APPROVAL_ENABLED = "true";
    const res = await makeService({ brokerDecision: "rejected" }).run({ ...baseArgs });
    expect(res.status).toBe("rejected");
    expect(res.steps).toEqual([]);
  });
  it("flag on + resumeState → plan gate bypassed (broker not called)", async () => {
    process.env.TEAM_PLAN_APPROVAL_ENABLED = "true";
    const svc = makeService({ brokerThrows: true });
    const res = await svc.run({
      ...baseArgs,
      resumeState: { runId: "run-1", plan: [{ assistantId: "a1", subtask: "t1" }], cursor: 0, accumulatedContext: "ctx" },
    });
    expect(res.status).not.toBe("suspended"); // 未因 plan 门 throw / suspend
  });
});
