const { RiskLevel } = require("../../../../utils/permissions/constants");

function loadFakeModel() {
  return require("../../../../utils/agents/coding/__fixtures__/fakeModel");
}

function loadAdapter() {
  return require("../../../../utils/agents/coding/codingModelAdapter");
}

function loadToolRuntime() {
  return require("../../../../utils/agents/coding/codingToolRuntime");
}

function loadLoop() {
  return require("../../../../utils/agents/coding/codingAgentLoop");
}

describe("coding runtime M0 loop contract", () => {
  test("T-M1 fake model emits scripted blocks and adapter normalizes them", async () => {
    const { createFakeModel } = loadFakeModel();
    const { CodingModelAdapter } = loadAdapter();
    const model = createFakeModel([
      [
        { type: "text", text: "I will inspect." },
        { type: "tool_use", id: "tool-1", name: "code_read", input: { path: "a.js" } },
        { type: "stop_reason", stop_reason: "tool_use" },
      ],
    ]);
    const adapter = new CodingModelAdapter({ model });

    const events = [];
    for await (const event of adapter.stream({ messages: [] })) events.push(event);

    expect(events).toEqual([
      { type: "text", text: "I will inspect." },
      { type: "tool_use", id: "tool-1", name: "code_read", input: { path: "a.js" } },
      { type: "stop_reason", stop_reason: "tool_use" },
    ]);
  });

  test("T-R-pair every tool_use gets exactly one tool_result", async () => {
    const { createFakeModel } = loadFakeModel();
    const { CodingModelAdapter } = loadAdapter();
    const { CodingToolRuntime } = loadToolRuntime();
    const { CodingAgentLoop } = loadLoop();
    const toolRuntime = new CodingToolRuntime({
      tools: [
        {
          name: "echo",
          riskLevel: RiskLevel.SAFE_READ,
          parameters: { type: "object", required: ["value"], properties: { value: { type: "string" } } },
          handler: async ({ value }) => ({ value }),
        },
      ],
    });
    const loop = new CodingAgentLoop({
      modelAdapter: new CodingModelAdapter({
        model: createFakeModel([
          [
            { type: "tool_use", id: "tool-1", name: "echo", input: { value: "ok" } },
            { type: "stop_reason", stop_reason: "tool_use" },
          ],
          [{ type: "text", text: "done" }, { type: "stop_reason", stop_reason: "end_turn" }],
        ]),
      }),
      toolRuntime,
    });

    const result = await loop.run("fix it");

    const toolResults = result.messages.filter((message) => message.type === "tool_result");
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]).toMatchObject({
      tool_use_id: "tool-1",
      is_error: false,
      content: expect.stringContaining("ok"),
    });
  });

  test("T-R-err unknown tool, invalid input, permission denial, and thrown tool become error tool_results", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    const runtime = new CodingToolRuntime({
      permissionBridge: {
        evaluate: (tool) =>
          tool.name === "denied"
            ? { decision: "deny", reason: "blocked" }
            : { decision: "allow", reason: "ok" },
      },
      tools: [
        {
          name: "needs_path",
          riskLevel: RiskLevel.SAFE_READ,
          parameters: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
          handler: async () => ({ ok: true }),
        },
        {
          name: "denied",
          riskLevel: RiskLevel.WRITE,
          parameters: { type: "object", properties: {} },
          handler: async () => ({ shouldNotRun: true }),
        },
        {
          name: "throws",
          riskLevel: RiskLevel.SAFE_READ,
          parameters: { type: "object", properties: {} },
          handler: async () => {
            throw new Error("boom");
          },
        },
      ],
    });

    await expect(runtime.executeToolUse({ id: "u", name: "missing", input: {} })).resolves.toMatchObject({ is_error: true });
    await expect(runtime.executeToolUse({ id: "i", name: "needs_path", input: {} })).resolves.toMatchObject({ is_error: true });
    await expect(runtime.executeToolUse({ id: "d", name: "denied", input: {} })).resolves.toMatchObject({ is_error: true });
    await expect(runtime.executeToolUse({ id: "t", name: "throws", input: {} })).resolves.toMatchObject({ is_error: true });
  });

  test("T-R-abort abort mid-tool creates cancelled tool_result and leaves no unpaired tool_use", async () => {
    const { createFakeModel } = loadFakeModel();
    const { CodingModelAdapter } = loadAdapter();
    const { CodingToolRuntime } = loadToolRuntime();
    const { CodingAgentLoop } = loadLoop();
    const controller = new AbortController();
    const toolStarted = new Promise((resolve) => {
      controller.signal.addEventListener("abort", resolve, { once: true });
    });
    const runtime = new CodingToolRuntime({
      tools: [
        {
          name: "slow",
          riskLevel: RiskLevel.SAFE_READ,
          parameters: { type: "object", properties: {} },
          handler: async () => {
            controller.abort();
            await toolStarted;
            return { tooLate: true };
          },
        },
      ],
    });
    const loop = new CodingAgentLoop({
      modelAdapter: new CodingModelAdapter({
        model: createFakeModel([
          [
            { type: "tool_use", id: "slow-1", name: "slow", input: {} },
            { type: "stop_reason", stop_reason: "tool_use" },
          ],
        ]),
      }),
      toolRuntime: runtime,
      signal: controller.signal,
    });

    const result = await loop.run("fix it");
    const toolUses = result.messages.filter((message) => message.type === "tool_use");
    const toolResults = result.messages.filter((message) => message.type === "tool_result");

    expect(toolUses).toHaveLength(1);
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]).toMatchObject({
      tool_use_id: "slow-1",
      is_error: true,
      reason: "cancelled",
    });
  });
});
