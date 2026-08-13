const { createRunEmployeeTool } = require("../../../../utils/agents/employeeRun/runEmployeeTool");

describe("createRunEmployeeTool", () => {
  describe("basic invoke", () => {
    test("invoke calls service.run with correct params and returns result", async () => {
      const mockResult = {
        text: "ok",
        artifacts: [],
        sources: [],
        events: [],
        runId: "r1",
        usage: { inputTokens: 0, outputTokens: 0 },
        error: null,
      };
      const mockService = {
        run: jest.fn().mockResolvedValue(mockResult),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        user: { id: "u1" },
        parentRunId: "p1",
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      const result = await tool.invoke({
        assistantId: "a1",
        task: "分析",
        context: "ctx",
      });

      expect(mockService.run).toHaveBeenCalledTimes(1);
      expect(mockService.run).toHaveBeenCalledWith({
        workspace: { id: "ws1" },
        user: { id: "u1" },
        assistantId: "a1",
        task: "分析",
        context: "ctx",
        parentRunId: "p1",
        signal: null,
        onEvent: null,
        maxDepth: 1,
        depth: 1,
        approvalDelegate: null, // T6d: default null when not in boundContext
      });
      expect(result).toEqual(mockResult);
    });

    test("binds parentRunId, onEvent, signal correctly", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };
      const mockOnEvent = jest.fn();
      const mockSignal = { aborted: false };

      const boundContext = {
        workspace: { id: "ws1" },
        parentRunId: "parent123",
        onEvent: mockOnEvent,
        signal: mockSignal,
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      await tool.invoke({ assistantId: "a1", task: "test" });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({
          parentRunId: "parent123",
          onEvent: mockOnEvent,
          signal: mockSignal,
        })
      );
    });

    test("depth incremented: default boundContext.depth=0 → invoke passes depth=1", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        depth: 0,
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      await tool.invoke({ assistantId: "a1", task: "test" });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 1 })
      );
    });

    test("maxDepth transparent pass-through", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        maxDepth: 3,
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      await tool.invoke({ assistantId: "a1", task: "test" });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({ maxDepth: 3 })
      );
    });
  });

  describe("depth_exceeded guard", () => {
    test("depth >= maxDepth returns error, does NOT call service.run", async () => {
      const mockService = {
        run: jest.fn(),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        depth: 1,
        maxDepth: 1,
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      const result = await tool.invoke({
        assistantId: "a1",
        task: "test",
      });

      expect(mockService.run).not.toHaveBeenCalled();
      expect(result).toEqual({
        text: null,
        artifacts: [],
        sources: [],
        events: [],
        runId: null,
        usage: { inputTokens: 0, outputTokens: 0 },
        error: {
          code: "depth_exceeded",
          message: "run_employee disabled at depth 1 (maxDepth 1)",
        },
      });
    });

    test("depth > maxDepth also triggers guard", async () => {
      const mockService = {
        run: jest.fn(),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        depth: 2,
        maxDepth: 1,
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      const result = await tool.invoke({ assistantId: "a1", task: "test" });

      expect(mockService.run).not.toHaveBeenCalled();
      expect(result.error.code).toBe("depth_exceeded");
    });
  });

  describe("tool metadata", () => {
    test("tool has correct name", () => {
      const tool = createRunEmployeeTool({ workspace: { id: "ws1" } });
      expect(tool.name).toBe("run_employee");
    });

    test("tool has description", () => {
      const tool = createRunEmployeeTool({ workspace: { id: "ws1" } });
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe("string");
    });

    test("inputSchema contains assistantId, task, context", () => {
      const tool = createRunEmployeeTool({ workspace: { id: "ws1" } });
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.assistantId).toBeTruthy();
      expect(tool.inputSchema.task).toBeTruthy();
      expect(tool.inputSchema.context).toBeTruthy();
    });
  });

  describe("defaults", () => {
    test("default service created if not provided", async () => {
      const mockResult = {
        text: "ok",
        artifacts: [],
        sources: [],
        events: [],
        runId: "r1",
        usage: { inputTokens: 0, outputTokens: 0 },
        error: null,
      };

      // Spy on EmployeeRunService constructor
      const { EmployeeRunService } = require("../../../../utils/agents/employeeRun");
      const originalRun = EmployeeRunService.prototype.run;
      let serviceCreated = false;
      EmployeeRunService.prototype.run = jest.fn(async function() {
        serviceCreated = true;
        return mockResult;
      });

      try {
        const boundContext = {
          workspace: { id: "ws1" },
        };

        const tool = createRunEmployeeTool(boundContext);
        await tool.invoke({ assistantId: "a1", task: "test" });

        expect(serviceCreated).toBe(true);
      } finally {
        EmployeeRunService.prototype.run = originalRun;
      }
    });

    test("default user is null", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      await tool.invoke({ assistantId: "a1", task: "test" });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({ user: null })
      );
    });

    test("default parentRunId is null", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      await tool.invoke({ assistantId: "a1", task: "test" });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({ parentRunId: null })
      );
    });

    test("default depth is 0", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      await tool.invoke({ assistantId: "a1", task: "test" });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 1 })
      );
    });

    test("default maxDepth is 1", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      await tool.invoke({ assistantId: "a1", task: "test" });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({ maxDepth: 1 })
      );
    });

    test("default signal is null", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      await tool.invoke({ assistantId: "a1", task: "test" });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({ signal: null })
      );
    });

    test("default onEvent is null", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      await tool.invoke({ assistantId: "a1", task: "test" });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({ onEvent: null })
      );
    });
  });

  describe("context parameter", () => {
    test("context=null passed through", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      await tool.invoke({ assistantId: "a1", task: "test", context: null });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({ context: null })
      );
    });

    test("context as string passed through", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      await tool.invoke({
        assistantId: "a1",
        task: "test",
        context: "some context",
      });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({ context: "some context" })
      );
    });

    test("context as object passed through", async () => {
      const mockService = {
        run: jest.fn().mockResolvedValue({
          text: "ok",
          artifacts: [],
          sources: [],
          events: [],
          runId: "r1",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: null,
        }),
      };

      const boundContext = {
        workspace: { id: "ws1" },
        service: mockService,
      };

      const tool = createRunEmployeeTool(boundContext);
      const contextObj = { key: "value" };
      await tool.invoke({
        assistantId: "a1",
        task: "test",
        context: contextObj,
      });

      expect(mockService.run).toHaveBeenCalledWith(
        expect.objectContaining({ context: contextObj })
      );
    });
  });
});
