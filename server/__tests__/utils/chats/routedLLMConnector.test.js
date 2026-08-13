const mockGetLLMProvider = jest.fn();
const mockResolveTieredRoute = jest.fn();
const mockLogEvent = jest.fn();

jest.mock("../../../utils/helpers", () => ({
  getLLMProvider: (...args) => mockGetLLMProvider(...args),
}));

jest.mock("../../../utils/AiProviders/providerRouter/tierRouter", () => ({
  resolveTieredRoute: (...args) => mockResolveTieredRoute(...args),
}));

jest.mock("../../../models/eventLogs", () => ({
  EventLogs: {
    logEvent: (...args) => mockLogEvent(...args),
  },
}));

describe("getRoutedLLMConnector", () => {
  const workspace = {
    id: 7,
    chatProvider: "openai",
    chatModel: "gpt-4o",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLLMProvider.mockReturnValue({ id: "connector" });
    mockResolveTieredRoute.mockResolvedValue(null);
    mockLogEvent.mockResolvedValue({ eventLog: { id: 1 }, message: null });
  });

  function subject() {
    return require("../../../utils/chats/routedLLMConnector")
      .getRoutedLLMConnector;
  }

  test.each(["E1", "E2", "E3", "E4", "E5", "E6", "E7"])(
    "%s preserves original getLLMProvider params when no tier route is returned",
    async (exit) => {
      const connector = await subject()({
        workspace,
        message: "hello",
        history: [{ role: "user", content: "before" }],
        attachments: [{ name: "a.txt" }],
        exit,
      });

      expect(connector).toEqual({ id: "connector" });
      expect(mockGetLLMProvider).toHaveBeenCalledWith({
        provider: "openai",
        model: "gpt-4o",
      });
      expect(mockLogEvent).not.toHaveBeenCalledWith(
        "tier_routing_decision",
        expect.anything()
      );
    }
  );

  test("uses mapped tier provider/model and records decision telemetry", async () => {
    mockResolveTieredRoute.mockResolvedValue({
      provider: "anthropic",
      model: "claude-sonnet",
      tier: "C2",
      score: 0.62,
      features: { codeSignal: 0.4 },
      source: "model_tier_map",
    });

    await subject()({
      workspace,
      message: "debug this code",
      history: [],
      attachments: [],
      exit: "E3",
    });

    expect(mockGetLLMProvider).toHaveBeenCalledWith({
      provider: "anthropic",
      model: "claude-sonnet",
    });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "tier_routing_decision",
      expect.objectContaining({
        tier: "C2",
        score: 0.62,
        chosenProvider: "anthropic",
        chosenModel: "claude-sonnet",
        workspaceId: 7,
        exit: "E3",
      })
    );
  });

  test("falls back to the original workspace config when tier construction throws", async () => {
    mockResolveTieredRoute.mockResolvedValue({
      provider: "anthropic",
      model: "bad-model",
      tier: "C2",
      score: 0.6,
      features: { reasoningSignal: 0.5 },
      source: "model_tier_map",
    });
    mockGetLLMProvider
      .mockImplementationOnce(() => {
        throw new Error("bad tier");
      })
      .mockReturnValueOnce({ id: "fallback" });

    const connector = await subject()({
      workspace,
      message: "debug",
      history: [],
      attachments: [],
      exit: "E4",
    });

    expect(connector).toEqual({ id: "fallback" });
    expect(mockGetLLMProvider).toHaveBeenNthCalledWith(2, {
      provider: "openai",
      model: "gpt-4o",
    });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "tier_routing_fallback",
      expect.objectContaining({
        tier: "C2",
        chosenProvider: "anthropic",
        chosenModel: "bad-model",
        fallbackProvider: "openai",
        fallbackModel: "gpt-4o",
        workspaceId: 7,
        exit: "E4",
        error: "bad tier",
      })
    );
  });
});
