jest.mock("../../../utils/workAgent/modelRouter", () => ({
  buildProviderRoute: jest.fn(),
}));

const { buildProviderRoute } = require("../../../utils/workAgent/modelRouter");
const { invokeStudioModel } = require("../../../utils/fde/studioModelInvoker");

describe("invokeStudioModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes a JSON-schema response hint only for structured nodes", async () => {
    const doGenerate = jest.fn(async () => ({
      content: [{ type: "text", text: '{"answer":"ok"}' }],
      usage: {},
    }));
    buildProviderRoute.mockResolvedValue({
      provider: "test",
      model: "test-model",
      languageModel: { doGenerate },
      pricing: {},
    });
    const outputSchema = {
      type: "object",
      required: ["answer"],
      properties: { answer: { type: "string" } },
    };

    await invokeStudioModel({
      systemPrompt: "Return JSON.",
      prompt: "Answer.",
      outputSchema,
    });

    expect(doGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: {
          type: "json",
          schema: outputSchema,
          name: "studio_node_output",
        },
      })
    );
  });

  it("leaves unstructured calls in text mode", async () => {
    const doGenerate = jest.fn(async () => ({
      content: [{ type: "text", text: "plain" }],
      usage: {},
    }));
    buildProviderRoute.mockResolvedValue({
      provider: "test",
      model: "test-model",
      languageModel: { doGenerate },
      pricing: {},
    });

    await invokeStudioModel({ systemPrompt: "System", prompt: "Prompt" });

    expect(doGenerate.mock.calls[0][0]).not.toHaveProperty("responseFormat");
  });
});
