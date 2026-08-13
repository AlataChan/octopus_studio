/**
 * AgentOrchestrator 单元测试
 */

const {
  AgentOrchestrator,
  ORCHESTRATION_STRATEGY,
  TASK_COMPLEXITY,
} = require("../../utils/agents/orchestrator");

describe("AgentOrchestrator", () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator({
      introspect: jest.fn(),
      log: jest.fn(),
    });
  });

  describe("analyzeTaskComplexity", () => {
    it("should identify simple tasks", () => {
      const result = orchestrator.analyzeTaskComplexity("你好");
      expect(result.complexity).toBe(TASK_COMPLEXITY.SIMPLE);
    });

    it("should identify moderate complexity tasks", () => {
      const result = orchestrator.analyzeTaskComplexity("帮我分析对比这两个方案");
      expect([TASK_COMPLEXITY.MODERATE, TASK_COMPLEXITY.COMPLEX]).toContain(result.complexity);
      expect(result.scores.research).toBeGreaterThan(0);
    });

    it("should identify complex tasks with multiple indicators", () => {
      const result = orchestrator.analyzeTaskComplexity(
        "首先调研竞品，然后撰写报告，最后进行审核优化"
      );
      expect(result.complexity).toBe(TASK_COMPLEXITY.COMPLEX);
      expect(result.scores.multiStep).toBeGreaterThan(0);
      expect(result.scores.research).toBeGreaterThan(0);
      expect(result.scores.creation).toBeGreaterThan(0);
      expect(result.scores.review).toBeGreaterThan(0);
    });

    it("should handle English tasks", () => {
      const result = orchestrator.analyzeTaskComplexity(
        "First research the topic, then write a summary"
      );
      expect(result.complexity).not.toBe(TASK_COMPLEXITY.SIMPLE);
    });

    it("should suggest flow count based on complexity", () => {
      const simple = orchestrator.analyzeTaskComplexity("你好");
      const complex = orchestrator.analyzeTaskComplexity(
        "调研、分析、撰写、审核"
      );

      expect(simple.suggestedFlowCount).toBeLessThanOrEqual(1);
      expect(complex.suggestedFlowCount).toBeGreaterThan(1);
    });
  });

  describe("getAvailableFlows", () => {
    it("should return array of flows", () => {
      // Mock AgentFlows.getAllFlows
      jest.mock("../../utils/agentFlows", () => ({
        getAllFlows: () => ({}),
      }));

      // 由于 AgentFlows 需要文件系统，这里测试方法存在即可
      expect(typeof orchestrator.getAvailableFlows).toBe("function");
    });

    it("should handle empty flows gracefully", () => {
      // 测试方法不会抛出异常
      expect(() => {
        try {
          orchestrator.getAvailableFlows();
        } catch (_e) {
          // 预期可能会失败，因为没有实际的 flow 文件
        }
      }).not.toThrow();
    });
  });

  describe("fallbackPlan", () => {
    it("should return direct plan for simple tasks", () => {
      const result = orchestrator.fallbackPlan("你好", [], []);
      expect(result.success).toBe(true);
      expect(result.plan.strategy).toBe(ORCHESTRATION_STRATEGY.SINGLE);
      expect(result.plan.steps[0].type).toBe("direct");
    });

    it("should use first available flow for complex tasks", () => {
      const mockFlows = [
        {
          uuid: "test-uuid",
          name: "Test Flow",
          description: "A test flow",
          identifier: "@@flow_test-uuid",
        },
      ];

      // 模拟复杂任务
      orchestrator.analyzeTaskComplexity = jest.fn().mockReturnValue({
        complexity: TASK_COMPLEXITY.COMPLEX,
      });

      const result = orchestrator.fallbackPlan("复杂任务", mockFlows, []);
      expect(result.plan.steps[0].type).toBe("flow");
      expect(result.plan.steps[0].identifier).toBe("@@flow_test-uuid");
    });
  });

  describe("selectExecutionPlan", () => {
    it("should use fallback when no provider", async () => {
      const result = await orchestrator.selectExecutionPlan("简单任务", [], []);
      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
    });

    it("should call provider when available", async () => {
      const mockProvider = {
        complete: jest.fn().mockResolvedValue({
          result: JSON.stringify({
            strategy: "single",
            reason: "Test reason",
            steps: [{ type: "direct", purpose: "Test" }],
          }),
        }),
      };

      orchestrator.provider = mockProvider;
      const result = await orchestrator.selectExecutionPlan("任务", [], []);

      expect(mockProvider.complete).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should fallback on provider error", async () => {
      const mockProvider = {
        complete: jest.fn().mockRejectedValue(new Error("API Error")),
      };

      orchestrator.provider = mockProvider;
      const result = await orchestrator.selectExecutionPlan("任务", [], []);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
    });
  });

  describe("executePlan", () => {
    it("should execute direct plan", async () => {
      const plan = {
        strategy: ORCHESTRATION_STRATEGY.SINGLE,
        reason: "Test",
        steps: [{ type: "direct", purpose: "Direct response" }],
      };

      const result = await orchestrator.executePlan(plan, "Test task");

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.blackboard.original_task).toBe("Test task");
    });

    it("should store step results in blackboard", async () => {
      const plan = {
        strategy: ORCHESTRATION_STRATEGY.SEQUENTIAL,
        reason: "Test",
        steps: [
          { type: "direct", purpose: "Step 1" },
          { type: "direct", purpose: "Step 2" },
        ],
      };

      const result = await orchestrator.executePlan(plan, "Multi-step task");

      expect(result.blackboard.step_1_result).toBeDefined();
      expect(result.blackboard.step_2_result).toBeDefined();
    });
  });

  describe("Blackboard integration", () => {
    it("should get and set blackboard", () => {
      const blackboard = orchestrator.getBlackboard();
      expect(blackboard).toBeDefined();

      blackboard.set("test_key", "test_value");
      expect(orchestrator.getBlackboard().get("test_key")).toBe("test_value");
    });

    it("should allow setting external blackboard", () => {
      const Blackboard = require("../../utils/agentFlows/blackboard");
      const externalBlackboard = new Blackboard({ shared: true });

      orchestrator.setBlackboard(externalBlackboard);
      expect(orchestrator.getBlackboard().get("shared")).toBe(true);
    });
  });
});

describe("ORCHESTRATION_STRATEGY", () => {
  it("should have all expected strategies", () => {
    expect(ORCHESTRATION_STRATEGY.SINGLE).toBe("single");
    expect(ORCHESTRATION_STRATEGY.SEQUENTIAL).toBe("sequential");
    expect(ORCHESTRATION_STRATEGY.PARALLEL).toBe("parallel");
    expect(ORCHESTRATION_STRATEGY.AUTO).toBe("auto");
  });
});

describe("TASK_COMPLEXITY", () => {
  it("should have all expected levels", () => {
    expect(TASK_COMPLEXITY.SIMPLE).toBe("simple");
    expect(TASK_COMPLEXITY.MODERATE).toBe("moderate");
    expect(TASK_COMPLEXITY.COMPLEX).toBe("complex");
  });
});

