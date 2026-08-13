/* eslint-env jest, node */

function setupOpenAiMock() {
  const mockOpenAiConfigs = [];
  const mockList = jest.fn().mockResolvedValue({
    data: [{ id: "gpt-4o", owned_by: "test-provider" }],
  });
  const mockCreate = jest.fn();

  jest.doMock("openai", () => ({
    OpenAI: jest.fn(function OpenAI(config) {
      mockOpenAiConfigs.push(config);
      return {
        models: { list: mockList },
        chat: { completions: { create: mockCreate } },
      };
    }),
  }));

  return { mockOpenAiConfigs, mockList, mockCreate };
}

describe("parseOpenAiCompatibleBasePath", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("normalizes OpenAI-compatible chat completion endpoint URLs", () => {
    const {
      parseOpenAiCompatibleBasePath,
    } = require("../../../utils/AiProviders/lib/parseBasePath");

    expect(
      parseOpenAiCompatibleBasePath(
        " https://tokenhub.tencentmaas.com/plan/v3/chat/completions/ "
      )
    ).toBe("https://tokenhub.tencentmaas.com/plan/v3");
    expect(
      parseOpenAiCompatibleBasePath(
        "https://example.com/openai/v1/chat/completions"
      )
    ).toBe("https://example.com/openai/v1");
    expect(parseOpenAiCompatibleBasePath("https://example.com/v1/")).toBe(
      "https://example.com/v1"
    );
    expect(
      parseOpenAiCompatibleBasePath("https://example.com/chat/completions/v1")
    ).toBe("https://example.com/chat/completions/v1");
    expect(parseOpenAiCompatibleBasePath("")).toBe("");
    expect(parseOpenAiCompatibleBasePath(null)).toBe(null);
    expect(parseOpenAiCompatibleBasePath({ trim: "not-called" })).toEqual({
      trim: "not-called",
    });
  });
});

describe("OpenAI-compatible provider baseURL integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.dontMock("openai");
  });

  test("provider constructors pass normalized baseURL to OpenAI", () => {
    const { mockOpenAiConfigs } = setupOpenAiMock();
    const { HireAgentLLM } = require("../../../utils/AiProviders/hireagent");
    const {
      GenericOpenAiLLM,
    } = require("../../../utils/AiProviders/genericOpenAi");
    const { AiHubMixLLM } = require("../../../utils/AiProviders/aihubmix");

    process.env.HIREAGENT_API_KEY = "sk-hireagent";
    process.env.HIREAGENT_BASE_PATH =
      "https://tokenhub.tencentmaas.com/plan/v3/chat/completions/";
    process.env.GENERIC_OPEN_AI_BASE_PATH =
      " https://generic.example.com/openai/v1/chat/completions ";
    process.env.GENERIC_OPEN_AI_MODEL_PREF = "generic-model";
    process.env.AIHUBMIX_API_KEY = "sk-aihubmix";
    process.env.AIHUBMIX_BASE_PATH =
      "https://aihubmix.example.com/v1/chat/completions/";
    process.env.AIHUBMIX_MODEL_PREF = "aihubmix-model";

    new HireAgentLLM({}, "hireagent-model");
    new GenericOpenAiLLM({}, "generic-model");
    new AiHubMixLLM({}, "aihubmix-model");

    expect(mockOpenAiConfigs.map((config) => config.baseURL)).toEqual([
      "https://tokenhub.tencentmaas.com/plan/v3",
      "https://generic.example.com/openai/v1",
      "https://aihubmix.example.com/v1",
    ]);
  });

  test("custom model lookups pass normalized baseURL to OpenAI", async () => {
    const { mockOpenAiConfigs } = setupOpenAiMock();
    const { getCustomModels } = require("../../../utils/helpers/customModels");

    await getCustomModels(
      "hireagent",
      "sk-hireagent",
      "https://tokenhub.tencentmaas.com/plan/v3/chat/completions/"
    );
    await getCustomModels(
      "aihubmix",
      "sk-aihubmix",
      " https://aihubmix.example.com/v1/chat/completions "
    );

    expect(mockOpenAiConfigs.map((config) => config.baseURL)).toEqual([
      "https://tokenhub.tencentmaas.com/plan/v3",
      "https://aihubmix.example.com/v1",
    ]);
  });
});
