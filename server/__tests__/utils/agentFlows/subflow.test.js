const executeSubflow = require("../../../utils/agentFlows/executors/subflow");

jest.mock("../../../utils/agentFlows/index", () => ({
  AgentFlows: {
    loadFlow: jest.fn(),
    executeFlow: jest.fn(),
  },
}));

const { AgentFlows } = require("../../../utils/agentFlows/index");

describe("executeSubflow", () => {
  let mockContext;
  let mockBlackboard;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBlackboard = { get: jest.fn(), set: jest.fn() };
    mockContext = {
      introspect: jest.fn(),
      logger: jest.fn(),
      aibitat: { test: "aibitat" },
      blackboard: mockBlackboard,
    };
  });

  describe("Parameter Validation", () => {
    it("should fail if flowId is missing", async () => {
      const result = await executeSubflow({ outputKey: "result" }, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("flowId is required");
    });

    it("should fail if outputKey is missing", async () => {
      const result = await executeSubflow({ flowId: "test" }, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("outputKey is required");
    });
  });

  describe("Basic Execution", () => {
    it("should execute successfully", async () => {
      // loadFlow 是同步函数，使用 mockReturnValue
      AgentFlows.loadFlow.mockReturnValue({ name: "Test" });
      AgentFlows.executeFlow.mockResolvedValue({ data: "result" });

      const result = await executeSubflow({
        flowId: "test-id",
        roleName: "researcher",
        outputKey: "output",
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: "result" });
    });
  });

  describe("Error Handling", () => {
    it("should handle flow not found", async () => {
      // loadFlow 是同步函数，使用 mockReturnValue
      AgentFlows.loadFlow.mockReturnValue(null);
      await expect(executeSubflow({
        flowId: "missing",
        outputKey: "output",
      }, mockContext)).rejects.toThrow("Sub-flow not found");
    });

    it("should continue on error when configured", async () => {
      AgentFlows.loadFlow.mockReturnValue({ name: "Test" });
      AgentFlows.executeFlow.mockRejectedValue(new Error("Failed"));

      const result = await executeSubflow({
        flowId: "test",
        outputKey: "output",
        onError: "continue",
      }, mockContext);

      expect(result.success).toBe(false);
      expect(result.continued).toBe(true);
    });

    it("should retry on error when configured", async () => {
      AgentFlows.loadFlow.mockReturnValue({ name: "Test" });
      AgentFlows.executeFlow
        .mockRejectedValueOnce(new Error("First fail"))
        .mockResolvedValueOnce({ data: "retry success" });

      const result = await executeSubflow({
        flowId: "test",
        outputKey: "output",
        onError: "retry",
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata.retried).toBe(true);
      expect(AgentFlows.executeFlow).toHaveBeenCalledTimes(2);
    });
  });
});
