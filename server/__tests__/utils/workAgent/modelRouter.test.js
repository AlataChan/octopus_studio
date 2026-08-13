describe("work-agent modelRouter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("keeps deterministic routing available for tests", async () => {
    process.env.ALATA_WORK_AGENT_PROVIDER = "deterministic";
    const { buildProviderRoute } = require("../../../utils/workAgent/modelRouter");

    const route = await buildProviderRoute();

    expect(route.provider).toBe("deterministic");
    expect(route.languageModel).toBeDefined();
    expect(route.pricing).toEqual(expect.objectContaining({ inputUsdPer1M: 0 }));
  });

  it("builds an OpenAI-compatible route from existing provider settings", async () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPEN_AI_KEY = "sk-test";
    process.env.OPEN_MODEL_PREF = "gpt-4o-mini";
    const { buildProviderRoute } = require("../../../utils/workAgent/modelRouter");

    const route = await buildProviderRoute();

    expect(route.provider).toBe("openai");
    expect(route.model).toBe("gpt-4o-mini");
    expect(route.languageModel).toBeDefined();
    expect(route.pricing).toEqual(
      expect.objectContaining({ source: "known-pricing" })
    );
  });

  it("falls back to deterministic routing when no supported provider is configured", async () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.OPEN_AI_KEY;
    const { buildProviderRoute } = require("../../../utils/workAgent/modelRouter");

    const route = await buildProviderRoute();

    expect(route.provider).toBe("deterministic");
    expect(route.strategy).toBe("offline-fallback");
  });

  it("uses DB configured work-agent provider before env fallback", async () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPEN_AI_KEY = "sk-test";
    jest.doMock("../../../utils/workAgent/settings", () => ({
      WORK_AGENT_SETTINGS: { provider: "ALATA_WORK_AGENT_PROVIDER" },
      getWorkAgentSetting: jest.fn(async () => "deterministic"),
    }));
    const { buildProviderRoute } = require("../../../utils/workAgent/modelRouter");

    const route = await buildProviderRoute();

    expect(route.provider).toBe("deterministic");
    expect(route.strategy).toBe("explicit-test");
  });

  it("serializes AI-SDK tool-call and tool-result parts into OpenAI chat messages", async () => {
    const mockCreate = jest.fn(async () => ({
      choices: [{ message: { content: "done" } }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    }));
    jest.doMock("openai", () => ({
      OpenAI: jest.fn(() => ({
        chat: { completions: { create: mockCreate } },
      })),
    }));
    const {
      createOpenAICompatibleLanguageModel,
    } = require("../../../utils/workAgent/modelRouter");
    const model = createOpenAICompatibleLanguageModel({
      apiKey: "sk-test",
      model: "deepseek-v4-pro",
      baseURL: "https://api.deepseek.com",
    });

    await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "Create the proof file." }],
        },
        {
          role: "assistant",
          content: [
            { type: "text", text: "I will write it." },
            {
              type: "tool-call",
              toolCallId: "call_write_note_1",
              toolName: "write_note",
              input: {
                filename: "deepseek-proof.txt",
                content: "hello",
              },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_write_note_1",
              result: { ok: true, path: "deepseek-proof.txt" },
            },
          ],
        },
      ],
      tools: [],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "Create the proof file." },
          {
            role: "assistant",
            content: "I will write it.",
            tool_calls: [
              {
                id: "call_write_note_1",
                type: "function",
                function: {
                  name: "write_note",
                  arguments: JSON.stringify({
                    filename: "deepseek-proof.txt",
                    content: "hello",
                  }),
                },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call_write_note_1",
            content: JSON.stringify({
              ok: true,
              path: "deepseek-proof.txt",
            }),
          },
        ],
      })
    );
  });

  it("forwards an AI-SDK JSON schema response format to OpenAI-compatible providers", async () => {
    const mockCreate = jest.fn(async () => ({
      choices: [{ message: { content: '{"answer":"ok"}' } }],
      usage: {},
    }));
    jest.doMock("openai", () => ({
      OpenAI: jest.fn(() => ({
        chat: { completions: { create: mockCreate } },
      })),
    }));
    const {
      createOpenAICompatibleLanguageModel,
    } = require("../../../utils/workAgent/modelRouter");
    const model = createOpenAICompatibleLanguageModel({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    });
    const schema = {
      type: "object",
      required: ["answer"],
      properties: { answer: { type: "string" } },
    };

    await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Answer" }] }],
      responseFormat: {
        type: "json",
        schema,
        name: "studio_node_output",
      },
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "studio_node_output",
            schema,
          },
        },
      })
    );
  });
});
