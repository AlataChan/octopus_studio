const { buildRunEmployeeMastraTool } = require("../../../../utils/agents/orchestration/runEmployeeMastraTool");

describe("buildRunEmployeeMastraTool", () => {
  it("should construct a Mastra tool with correct id and description", () => {
    const mockLoadMastra = jest.fn().mockReturnValue({
      createTool: (config) => config,
      z: {
        object: (schema) => ({
          safeParse: (input) => {
            const required = ["assistantId", "task"];
            const missing = required.filter((k) => !(k in input));
            if (missing.length > 0) {
              return { success: false, error: { issues: [{ path: missing }] } };
            }
            return { success: true, data: input };
          },
        }),
        string: () => ({ optional: () => ({}) }),
      },
    });

    const mockCreateRunEmployeeTool = jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        text: "test result",
        sources: [],
        artifacts: [],
        runId: "run-123",
        error: null,
      }),
    });

    const tool = buildRunEmployeeMastraTool({
      workspace: { id: "ws-1" },
      user: { id: "u-1" },
      parentRunId: "parent-123",
      depth: 0,
      maxDepth: 2,
      signal: null,
      onEvent: null,
      service: null,
      loadMastra: mockLoadMastra,
      createRunEmployeeTool: mockCreateRunEmployeeTool,
    });

    expect(tool.id).toBe("run_employee");
    expect(tool.description).toContain("Run a selected AI employee");
  });

  it("should validate inputSchema with assistantId/task required and context optional", () => {
    const mockLoadMastra = jest.fn().mockReturnValue({
      createTool: (config) => config,
      z: {
        object: (schema) => schema,
        string: () => ({ optional: () => ({}) }),
      },
    });

    const mockCreateRunEmployeeTool = jest.fn().mockReturnValue({
      invoke: jest.fn(),
    });

    const tool = buildRunEmployeeMastraTool({
      workspace: { id: "ws-1" },
      loadMastra: mockLoadMastra,
      createRunEmployeeTool: mockCreateRunEmployeeTool,
    });

    expect(tool.inputSchema).toBeDefined();
    const schema = tool.inputSchema;
    expect(schema).toHaveProperty("assistantId");
    expect(schema).toHaveProperty("task");
    expect(schema).toHaveProperty("context");
  });

  it("should call invoke with correct parameters and return trimmed result", async () => {
    const mockInvoke = jest.fn().mockResolvedValue({
      text: "result text",
      sources: [{ url: "http://example.com" }],
      artifacts: [{ id: "a1" }],
      runId: "run-456",
      events: [{ type: "started" }],
      error: null,
      usage: { inputTokens: 10 },
    });

    const mockLoadMastra = jest.fn().mockReturnValue({
      createTool: (config) => config,
      z: {
        object: (schema) => schema,
        string: () => ({ optional: () => ({}) }),
      },
    });

    const mockCreateRunEmployeeTool = jest.fn().mockReturnValue({
      invoke: mockInvoke,
    });

    const tool = buildRunEmployeeMastraTool({
      workspace: { id: "ws-1" },
      user: { id: "u-1" },
      parentRunId: "p-123",
      depth: 1,
      maxDepth: 3,
      signal: null,
      onEvent: null,
      service: null,
      loadMastra: mockLoadMastra,
      createRunEmployeeTool: mockCreateRunEmployeeTool,
    });

    const result = await tool.execute({
      assistantId: "a1",
      task: "analyze data",
      context: "prior output",
    });

    expect(mockInvoke).toHaveBeenCalledWith({
      assistantId: "a1",
      task: "analyze data",
      context: "prior output",
    });

    expect(result).toEqual({
      text: "result text",
      sources: [{ url: "http://example.com" }],
      artifacts: [{ id: "a1" }],
      runId: "run-456",
      error: null,
    });

    expect(result).not.toHaveProperty("events");
    expect(result).not.toHaveProperty("usage");
  });

  it("should pass context parameters to createRunEmployeeTool", async () => {
    const mockCreateRunEmployeeTool = jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        text: "ok",
        sources: [],
        artifacts: [],
        runId: null,
        error: null,
      }),
    });

    const mockLoadMastra = jest.fn().mockReturnValue({
      createTool: (config) => config,
      z: {
        object: (schema) => schema,
        string: () => ({ optional: () => ({}) }),
      },
    });

    const ctx = {
      workspace: { id: "ws-test" },
      user: { id: "u-test" },
      parentRunId: "p-test",
      depth: 2,
      maxDepth: 5,
      signal: { aborted: false },
      onEvent: () => {},
      service: { run: jest.fn() },
      loadMastra: mockLoadMastra,
      createRunEmployeeTool: mockCreateRunEmployeeTool,
    };

    buildRunEmployeeMastraTool(ctx);

    expect(mockCreateRunEmployeeTool).toHaveBeenCalledWith({
      workspace: ctx.workspace,
      user: ctx.user,
      parentRunId: ctx.parentRunId,
      depth: ctx.depth,
      maxDepth: ctx.maxDepth,
      signal: ctx.signal,
      onEvent: ctx.onEvent,
      service: ctx.service,
      approvalDelegate: null, // T6d: default null when not provided in ctx
    });
  });

  it("should handle missing optional fields with defaults", async () => {
    const mockCreateRunEmployeeTool = jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        text: null,
        sources: [],
        artifacts: [],
        runId: null,
        error: null,
      }),
    });

    const mockLoadMastra = jest.fn().mockReturnValue({
      createTool: (config) => config,
      z: {
        object: (schema) => schema,
        string: () => ({ optional: () => ({}) }),
      },
    });

    buildRunEmployeeMastraTool({
      workspace: { id: "ws-1" },
      loadMastra: mockLoadMastra,
      createRunEmployeeTool: mockCreateRunEmployeeTool,
    });

    expect(mockCreateRunEmployeeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        user: null,
        parentRunId: null,
        depth: 0,
        maxDepth: 1,
        signal: null,
        onEvent: null,
        service: undefined,
      })
    );
  });

  it("should handle null context input and convert to null", async () => {
    const mockInvoke = jest.fn().mockResolvedValue({
      text: "ok",
      sources: [],
      artifacts: [],
      runId: null,
      error: null,
    });

    const mockLoadMastra = jest.fn().mockReturnValue({
      createTool: (config) => config,
      z: {
        object: (schema) => schema,
        string: () => ({ optional: () => ({}) }),
      },
    });

    const mockCreateRunEmployeeTool = jest.fn().mockReturnValue({
      invoke: mockInvoke,
    });

    const tool = buildRunEmployeeMastraTool({
      workspace: { id: "ws-1" },
      loadMastra: mockLoadMastra,
      createRunEmployeeTool: mockCreateRunEmployeeTool,
    });

    await tool.execute({
      assistantId: "a1",
      task: "test",
    });

    expect(mockInvoke).toHaveBeenCalledWith({
      assistantId: "a1",
      task: "test",
      context: null,
    });
  });
});
