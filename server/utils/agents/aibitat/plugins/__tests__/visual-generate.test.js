jest.mock("../../../../visualProduction", () => ({
  visualProductionClient: {
    isAvailable: jest.fn(),
    getConfig: jest.fn(),
    estimate: jest.fn(),
    submit: jest.fn(),
    getJob: jest.fn(),
  },
}));

const { visualProductionClient } = require("../../../../visualProduction");
const { visualGenerate } = require("../visual-generate");

function collectFn() {
  let def = null;
  const aibitat = {
    function: (d) => {
      def = d;
    },
    introspect: () => {},
    handlerProps: { log: () => {} },
  };
  visualGenerate.plugin().setup(aibitat);
  def.super = aibitat;
  def.introspect = aibitat.introspect;
  def.caller = "tester";
  def._pollIntervalMs = 0;
  def._maxPollMs = 1000;
  return def;
}

describe("visual-generate plugin", () => {
  beforeEach(() => jest.clearAllMocks());

  test("registers function with required task+prompt and no confirm param", () => {
    const def = collectFn();
    expect(def.name).toBe("visual-generate");
    expect(def.required).toEqual(expect.arrayContaining(["task", "prompt"]));
    expect(def.parameters.properties).not.toHaveProperty("confirm");
  });

  test("not-available message (no throw) when sidecar down", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({
      available: false,
      message: "down",
    });
    const def = collectFn();
    const out = await def.handler.call(def, {
      task: "image.poster.final",
      prompt: "x",
    });
    expect(String(out)).toMatch(/未启动|unavailable|not started/i);
    expect(visualProductionClient.submit).not.toHaveBeenCalled();
  });

  test("fail-closed: does NOT submit when estimate throws", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });
    visualProductionClient.getConfig.mockResolvedValue({
      budget: { confirm_threshold_cny: 1 },
    });
    visualProductionClient.estimate.mockRejectedValue(
      new Error("estimate boom")
    );
    const def = collectFn();
    const out = await def.handler.call(def, {
      task: "image.poster.final",
      prompt: "x",
    });
    expect(String(out)).toMatch(/无法估算|cannot estimate|手动/i);
    expect(visualProductionClient.submit).not.toHaveBeenCalled();
  });

  test("explains missing server-side provider keys clearly", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });
    visualProductionClient.getConfig.mockRejectedValue(
      new Error("Missing ARK_API_KEY")
    );
    const def = collectFn();

    const out = await def.handler.call(def, {
      task: "image.poster.final",
      prompt: "x",
    });

    expect(String(out)).toMatch(/服务端|server/i);
    expect(String(out)).toMatch(/key|credential/i);
    expect(String(out)).toMatch(/\/visual/);
    expect(visualProductionClient.submit).not.toHaveBeenCalled();
  });

  test("blocks submit when estimate exceeds threshold (no confirm bypass)", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });
    visualProductionClient.getConfig.mockResolvedValue({
      budget: { confirm_threshold_cny: 1 },
    });
    visualProductionClient.estimate.mockResolvedValue({ cny: 5 });
    const def = collectFn();
    const out = await def.handler.call(def, {
      task: "video.final",
      prompt: "x",
    });
    expect(String(out)).toMatch(/超阈值|threshold|\/visual|视觉生成页/i);
    expect(visualProductionClient.submit).not.toHaveBeenCalled();
  });

  test("submits and returns result reference when job completes", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });
    visualProductionClient.getConfig.mockResolvedValue({
      budget: { confirm_threshold_cny: 100 },
    });
    visualProductionClient.estimate.mockResolvedValue({ cny: 0 });
    visualProductionClient.submit.mockResolvedValue({ job_id: "job-1" });
    visualProductionClient.getJob.mockResolvedValue({
      status: "succeeded",
      results: ["job-1/results/out.png"],
    });
    const def = collectFn();
    const out = await def.handler.call(def, {
      task: "image.poster.final",
      prompt: "x",
    });
    expect(String(out)).toMatch(/job-1/);
    expect(String(out)).toContain("/api/visual/results/job-1/out.png");
  });

  test("waits for results to materialize when completed-but-empty (Agnes race)", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });
    visualProductionClient.getConfig.mockResolvedValue({
      budget: { confirm_threshold_cny: 100 },
    });
    visualProductionClient.estimate.mockResolvedValue({ cny: 0 });
    visualProductionClient.submit.mockResolvedValue({ job_id: "job-9" });
    // 首轮 completed 但 results 未落盘；次轮就绪
    visualProductionClient.getJob
      .mockResolvedValueOnce({ status: "completed", results: [] })
      .mockResolvedValue({ status: "completed", results: ["job-9/results/o.png"] });
    const def = collectFn();
    const out = await def.handler.call(def, {
      task: "image.poster.draft",
      prompt: "x",
    });
    expect(String(out)).toContain("/api/visual/results/job-9/o.png");
    expect(visualProductionClient.getJob.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test("fail-closed on missing threshold: cost>0 is blocked (default threshold 0)", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });
    visualProductionClient.getConfig.mockResolvedValue({ budget: {} });
    visualProductionClient.estimate.mockResolvedValue({ cny: 0.5 });
    const def = collectFn();
    const out = await def.handler.call(def, {
      task: "image.poster.final",
      prompt: "x",
    });
    expect(String(out)).toMatch(/超阈值|threshold|\/visual/i);
    expect(visualProductionClient.submit).not.toHaveBeenCalled();
  });

  test("bounded poll: returns job_id + still-processing when it never completes", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });
    visualProductionClient.getConfig.mockResolvedValue({
      budget: { confirm_threshold_cny: 100 },
    });
    visualProductionClient.estimate.mockResolvedValue({ cny: 0 });
    visualProductionClient.submit.mockResolvedValue({ job_id: "job-2" });
    visualProductionClient.getJob.mockResolvedValue({
      status: "running",
      results: [],
    });
    const def = collectFn();
    def._maxPollMs = 0;
    const out = await def.handler.call(def, {
      task: "video.final",
      prompt: "x",
    });
    expect(String(out)).toMatch(/job-2/);
    expect(String(out)).toMatch(/处理中|processing|My Jobs|Jobs/i);
  });
});

describe("visual-generate registration", () => {
  test("exported from AgentPlugins under both key and name alias", () => {
    const AgentPlugins = require("../index");
    expect(AgentPlugins.visualGenerate).toBeDefined();
    expect(AgentPlugins["visual-generate"]).toBeDefined();
    expect(AgentPlugins["visual-generate"].name).toBe("visual-generate");
  });

  test("agentSkillsFromSystemSettings loads visual-generate when enabled", async () => {
    jest.resetModules();
    jest.doMock("../../../../../models/systemSettings", () => ({
      SystemSettings: {
        getValueOrFallback: jest
          .fn()
          .mockImplementation(({ label }, fallback) => {
            if (label === "default_agent_skills") {
              return Promise.resolve(["visual-generate"]);
            }
            return Promise.resolve(fallback);
          }),
      },
    }));

    const { agentSkillsFromSystemSettings } = require("../../../defaults");
    const skills = await agentSkillsFromSystemSettings();
    expect(skills).toEqual(expect.arrayContaining(["visual-generate"]));
  });
});
