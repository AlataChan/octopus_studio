const { Readable } = require("stream");

const RagflowClient = require("../../../../utils/AiProviders/ragflow/RagflowClient");

describe("RagflowClient", () => {
  test("normalizeBaseUrls handles root /v1 /api/v1 inputs", () => {
    expect(RagflowClient.normalizeBaseUrls("https://example.com")).toEqual({
      rootBaseUrl: "https://example.com",
      webBaseUrl: "https://example.com/v1",
      sdkBaseUrl: "https://example.com/api/v1",
    });

    expect(RagflowClient.normalizeBaseUrls("https://example.com/v1")).toEqual({
      rootBaseUrl: "https://example.com",
      webBaseUrl: "https://example.com/v1",
      sdkBaseUrl: "https://example.com/api/v1",
    });

    expect(
      RagflowClient.normalizeBaseUrls("https://example.com/api/v1")
    ).toEqual({
      rootBaseUrl: "https://example.com",
      webBaseUrl: "https://example.com/v1",
      sdkBaseUrl: "https://example.com/api/v1",
    });
  });

  test("getOpenAIEndpoint does not duplicate version prefixes", () => {
    const chatClient = new RagflowClient({
      baseUrl: "https://example.com/v1",
      apiKey: "ragflow-token",
      type: "chat",
      chatId: "chat_123",
    });

    expect(chatClient.getOpenAIEndpoint()).toBe(
      "https://example.com/api/v1/chats_openai/chat_123/chat/completions"
    );

    const agentClient = new RagflowClient({
      baseUrl: "https://example.com/api/v1",
      apiKey: "ragflow-token",
      type: "agent",
      agentId: "agent_456",
    });

    expect(agentClient.getOpenAIEndpoint()).toBe(
      "https://example.com/api/v1/agents_openai/agent_456/chat/completions"
    );
  });

  test("iterateSSEDataStrings yields parsed data payloads", async () => {
    const client = new RagflowClient({
      baseUrl: "https://example.com",
      apiKey: "ragflow-token",
      type: "chat",
      chatId: "chat_123",
    });

    const sse = Readable.from([
      "data: {\"retcode\":0,\"data\":{\"answer\":\"a\"}}\n\n",
      "data: {\"retcode\":0,\"data\":{\"answer\":\"ab\"}}\n\n",
      "data: [DONE]\n\n",
    ]);

    const chunks = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const dataStr of client.iterateSSEDataStrings(sse)) {
      chunks.push(dataStr);
    }

    expect(chunks).toEqual([
      "{\"retcode\":0,\"data\":{\"answer\":\"a\"}}",
      "{\"retcode\":0,\"data\":{\"answer\":\"ab\"}}",
      "[DONE]",
    ]);
  });
});

