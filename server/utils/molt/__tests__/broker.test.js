const { createMoltBroker } = require("../broker");

describe("Molt broker", () => {
  function monitor({ available = true, client = {} } = {}) {
    return {
      client,
      isAvailable: jest.fn(() => available),
      status: jest.fn(() => ({ state: available ? "CONNECTED" : "OFFLINE" })),
    };
  }

  test("returns unavailable when Molt is not connected", async () => {
    const broker = createMoltBroker({ monitor: monitor({ available: false }) });

    await expect(
      broker.askAgent({ message: "hello", userId: "u1" })
    ).resolves.toEqual({
      success: false,
      code: "MOLT_UNAVAILABLE",
      error: "Molt is not connected",
    });
  });

  test("askAgent maps Alata input into Molt chat payload", async () => {
    const client = {
      chatAgent: jest.fn(async () => ({
        answer: "Molt answer",
        conversation_id: "conv-2",
      })),
    };
    const broker = createMoltBroker({
      monitor: monitor({ client }),
      defaultAgentId: "molt-matrix",
    });

    await expect(
      broker.askAgent({
        message: "run the plan",
        userId: "user-1",
        userName: "Ada",
        conversationId: "conv-1",
      })
    ).resolves.toEqual({
      success: true,
      answer: "Molt answer",
      conversationId: "conv-2",
      raw: {
        answer: "Molt answer",
        conversation_id: "conv-2",
      },
    });
    expect(client.chatAgent).toHaveBeenCalledWith("molt-matrix", {
      message: "run the plan",
      user: { id: "user-1", name: "Ada", extra: {} },
      conversationId: "conv-1",
      responseMode: "blocking",
    });
  });

  test("chat maps workspace input into a Molt chat request", async () => {
    const client = {
      chatAgent: jest.fn(async () => ({
        answer: "Workspace Molt answer",
        conversation_id: "thread-2",
        chat_id: "chat-1",
      })),
    };
    const broker = createMoltBroker({ monitor: monitor({ client }) });

    await expect(
      broker.chat({
        agentId: "agent-1",
        message: "hello",
        threadId: "thread-1",
        scopeKey: "workspace-thread:default",
        userId: 7,
        userName: "Member",
      })
    ).resolves.toEqual({
      success: true,
      reply: "Workspace Molt answer",
      molt_thread_id: "thread-2",
      chatId: "chat-1",
      raw: {
        answer: "Workspace Molt answer",
        conversation_id: "thread-2",
        chat_id: "chat-1",
      },
    });
    expect(client.chatAgent).toHaveBeenCalledWith("agent-1", {
      message: "hello",
      user: {
        id: "7",
        name: "Member",
        extra: { scopeKey: "workspace-thread:default" },
      },
      conversationId: "thread-1",
      responseMode: "blocking",
    });
  });

  test("chat reports a stale thread when Molt returns 404", async () => {
    const client = {
      chatAgent: jest.fn(async () => ({
        ok: false,
        statusCode: 404,
        error: "thread missing",
      })),
    };
    const broker = createMoltBroker({ monitor: monitor({ client }) });

    await expect(
      broker.chat({
        agentId: "agent-1",
        message: "hello",
        threadId: "missing-thread",
      })
    ).resolves.toEqual({
      success: false,
      threadStale: true,
      code: "molt_thread_stale",
      error: "Molt thread not found",
      statusCode: 409,
    });
  });

  test("streamChat forwards chunks and returns final thread metadata", async () => {
    const client = {
      streamChatAgent: jest.fn(async (_agentId, { onChunk }) => {
        onChunk("hello");
        onChunk(" world");
        return { conversation_id: "thread-2", chat_id: "chat-1" };
      }),
    };
    const broker = createMoltBroker({ monitor: monitor({ client }) });
    const chunks = [];

    await expect(
      broker.streamChat({
        moltAgentId: "agent-1",
        message: "hello",
        threadId: "thread-1",
        scopeKey: "user:1",
        userId: 1,
        userName: "Member",
        onChunk: (text) => chunks.push(text),
      })
    ).resolves.toEqual({
      chatId: "chat-1",
      molt_thread_id: "thread-2",
      raw: { conversation_id: "thread-2", chat_id: "chat-1" },
    });
    expect(chunks).toEqual(["hello", " world"]);
    expect(client.streamChatAgent).toHaveBeenCalledWith("agent-1", {
      message: "hello",
      user: {
        id: "1",
        name: "Member",
        extra: { scopeKey: "user:1" },
      },
      conversationId: "thread-1",
      responseMode: "streaming",
      onChunk: expect.any(Function),
      signal: undefined,
    });
  });

  test("streamChat throws typed stale error when Molt returns thread 404", async () => {
    const client = {
      streamChatAgent: jest.fn(async () => ({
        ok: false,
        statusCode: 404,
        error: "thread missing",
      })),
    };
    const broker = createMoltBroker({ monitor: monitor({ client }) });

    await expect(
      broker.streamChat({
        moltAgentId: "agent-1",
        message: "hello",
        threadId: "missing",
      })
    ).rejects.toMatchObject({
      code: "thread_stale",
      message: "Molt thread not found",
    });
  });

  test("listArchetypes unwraps Molt data arrays", async () => {
    const client = {
      matrixArchetypes: jest.fn(async () => ({
        data: [{ id: "reviewer", label: "Reviewer" }],
      })),
    };
    const broker = createMoltBroker({ monitor: monitor({ client }) });

    await expect(broker.listArchetypes()).resolves.toEqual({
      success: true,
      archetypes: [{ id: "reviewer", label: "Reviewer" }],
      raw: { data: [{ id: "reviewer", label: "Reviewer" }] },
    });
  });
});
