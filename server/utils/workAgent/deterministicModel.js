function createDeterministicWorkAgentModel({
  goal,
  modelId = "work-agent-deterministic",
  toolPlan = [],
} = {}) {
  let calls = 0;
  return {
    specificationVersion: "v2",
    provider: "deterministic",
    modelId,
    supportedUrls: {},
    doGenerate: async () => {
      const plannedTool = toolPlan[calls];
      calls++;
      if (plannedTool) {
        return {
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: "tool-calls",
          usage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 },
          content: [
            {
              type: "tool-call",
              toolCallId: plannedTool.toolCallId || `tool-${calls}`,
              toolName: plannedTool.toolName,
              input: JSON.stringify(plannedTool.input || {}),
            },
          ],
          warnings: [],
        };
      }

      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: "stop",
        usage: { inputTokens: 18, outputTokens: 12, totalTokens: 30 },
        content: [
          {
            type: "text",
            text: `Completed work-agent task for: ${goal}`,
          },
        ],
        warnings: [],
      };
    },
    doStream: async () => {
      throw new Error("Deterministic work-agent model only supports generate().");
    },
  };
}

module.exports = { createDeterministicWorkAgentModel };
