"use strict";

const { buildRunEmployeeMastraTool } = require("../../orchestration/runEmployeeMastraTool");
const { createRunEmployeeTool } = require("../runEmployeeTool");
const { EmployeeRunService } = require("../index");

function loadMastraStub() {
  const zString = () => ({ optional: () => "optional-string" });
  return {
    createTool: (config) => config,
    z: {
      string: zString,
      object: (shape) => ({ shape }),
    },
  };
}

function fakeAibitat() {
  return {
    functions: new Map([["done", { isReadOnly: false }]]),
    getProviderForConfig: jest.fn(({ provider }) => {
      if (provider === "groq") throw new TypeError("Providers.GroqProvider is not a constructor");
      if (provider === "badbase") throw new Error("bad baseline");
      return {};
    }),
    function() {},
    agent() {},
    use() {},
    setPermissionConfig() {},
    onAbort() {},
    onTerminate() {},
    start: jest.fn(async () => {}),
  };
}

describe("override/readOnly passthrough", () => {
  it("keeps runEmployeeMastraTool input schema at three LLM-visible fields", () => {
    const tool = buildRunEmployeeMastraTool({
      loadMastra: loadMastraStub,
      createRunEmployeeTool: () => ({ invoke: jest.fn() }),
    });

    expect(Object.keys(tool.inputSchema.shape)).toEqual([
      "assistantId",
      "task",
      "context",
    ]);
  });

  it("passes modelOverride and readOnly through the closure, not tool input", async () => {
    const service = {
      run: jest.fn().mockResolvedValue({ text: "ok", sources: [], artifacts: [] }),
    };
    const callable = createRunEmployeeTool({
      workspace: { id: 1 },
      service,
      modelOverride: { provider: "openai", model: "cheap" },
      readOnly: true,
    });

    await callable.invoke({ assistantId: "a", task: "t", context: "c" });

    expect(service.run).toHaveBeenCalledWith(expect.objectContaining({
      modelOverride: { provider: "openai", model: "cheap" },
      readOnly: true,
    }));
  });

  it("falls back once when override provider construction fails", async () => {
    const ab = fakeAibitat();
    const log = jest.fn();
    const svc = new EmployeeRunService({
      log,
      AgentRuntimeFactory: {
        resolveProviderModel: () => ({ provider: "openai", model: "base" }),
        assemble: async () => ({
          permissionConfig: {},
          userAgentDef: {},
          workspaceAgentDef: {},
          funcsToLoad: [],
        }),
      },
      attachAgentPlugins: async () => {},
      createAibitat: () => ab,
      httpSocket: { plugin: () => ({ setup() {} }) },
    });

    const result = await svc.run({
      workspace: { id: 1, chatProvider: "openai", chatModel: "base" },
      assistantId: "a",
      task: "t",
      modelOverride: { provider: "groq", model: "fast" },
    });

    expect(result.error).toBeNull();
    expect(ab.getProviderForConfig).toHaveBeenCalledWith({
      provider: "groq",
      model: "fast",
    });
    expect(ab.getProviderForConfig).toHaveBeenCalledWith({
      provider: "openai",
      model: "base",
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("tier_routing_fallback"));
  });

  it("returns no_provider when baseline construction also fails", async () => {
    const ab = fakeAibitat();
    const svc = new EmployeeRunService({
      AgentRuntimeFactory: {
        resolveProviderModel: () => ({ provider: "badbase", model: "base" }),
        assemble: async () => ({
          permissionConfig: {},
          userAgentDef: {},
          workspaceAgentDef: {},
          funcsToLoad: [],
        }),
      },
      attachAgentPlugins: async () => {},
      createAibitat: () => ab,
      httpSocket: { plugin: () => ({ setup() {} }) },
    });

    const result = await svc.run({
      workspace: { id: 1, chatProvider: "badbase", chatModel: "base" },
      assistantId: "a",
      task: "t",
      modelOverride: { provider: "groq", model: "fast" },
    });

    expect(result.error?.code).toBe("no_provider");
  });

  it("modelOverride=null follows baseline without eager probe", async () => {
    const ab = fakeAibitat();
    const svc = new EmployeeRunService({
      AgentRuntimeFactory: {
        resolveProviderModel: () => ({ provider: "openai", model: "base" }),
        assemble: async () => ({
          permissionConfig: {},
          userAgentDef: {},
          workspaceAgentDef: {},
          funcsToLoad: [],
        }),
      },
      attachAgentPlugins: async () => {},
      createAibitat: () => ab,
      httpSocket: { plugin: () => ({ setup() {} }) },
    });

    await svc.run({
      workspace: { id: 1, chatProvider: "openai", chatModel: "base" },
      assistantId: "a",
      task: "t",
      modelOverride: null,
    });

    expect(ab.getProviderForConfig).not.toHaveBeenCalled();
  });
});
