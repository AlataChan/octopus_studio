const mockExternalThreadState = {
  get: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
};
const mockWorkspaceChatsNew = jest.fn();
const mockWorkspaceGraphSearch = jest.fn();
const mockWriteResponseChunk = jest.fn();
const mockDifyChatStream = jest.fn();
const mockRagflowChatStream = jest.fn();
const mockPrisma = {
  workspace_threads: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.mock("../models/externalThreadState", () => ({
  ExternalThreadState: mockExternalThreadState,
}), { virtual: true });

jest.mock("../models/workspaceChats", () => ({
  WorkspaceChats: {
    new: (...args) => mockWorkspaceChatsNew(...args),
  },
}));

jest.mock("../models/workspaceGraph", () => ({
  WorkspaceGraph: {
    searchSubgraph: (...args) => mockWorkspaceGraphSearch(...args),
  },
}));

jest.mock("../utils/helpers/chat/responses", () => ({
  writeResponseChunk: (...args) => mockWriteResponseChunk(...args),
}));

jest.mock("../utils/AiProviders/dify", () => ({
  chatStream: (...args) => mockDifyChatStream(...args),
}));

jest.mock("../utils/AiProviders/ragflow", () => ({
  chatStream: (...args) => mockRagflowChatStream(...args),
}));

jest.mock("../utils/AiProviders/n8n", () => ({
  chatStream: jest.fn(),
}));

jest.mock("../utils/prisma", () => mockPrisma);

const { handleExternalPlatformChat } = require("../utils/chats/externalPlatformHandler");
const { WorkspaceThread } = require("../models/workspaceThread");

const workspace = { id: 7, chatModel: "gpt-4o-mini" };
const user = { id: 42 };
const thread = { id: 99 };
const assistant = { id: "assistant-1", instanceName: "External Assistant" };

function difyTemplate(appId = "dify-app-1") {
  return {
    id: "template-dify",
    name: "Dify Assistant",
    platformType: "dify",
    platformConfig: {
      baseUrl: "https://dify.example/v1",
      apiKey: "dify-key",
      appId,
    },
  };
}

function ragflowTemplate(agentId = "ragflow-agent-1") {
  return {
    id: "template-ragflow",
    name: "RAGFlow Assistant",
    platformType: "ragflow",
    platformConfig: {
      baseUrl: "https://ragflow.example",
      apiKey: "ragflow-key",
      type: "agent",
      agentId,
    },
  };
}

async function runExternalChat(overrides = {}) {
  return handleExternalPlatformChat({
    response: {},
    workspace,
    message: "hello",
    template: difyTemplate(),
    assistant,
    user,
    thread,
    attachments: [],
    chatMode: "chat",
    ...overrides,
  });
}

describe("external platform multi-turn state", () => {
  beforeEach(() => {
    mockWorkspaceGraphSearch.mockResolvedValue({ nodes: [] });
    mockWorkspaceChatsNew.mockResolvedValue({ chat: { id: 1234 } });
    mockExternalThreadState.get.mockResolvedValue(null);
    mockExternalThreadState.upsert.mockResolvedValue({ id: 1 });
    mockExternalThreadState.delete.mockResolvedValue(true);
    mockDifyChatStream.mockImplementation(async (_config, _message, onChunk) => {
      onChunk({ type: "content", delta: "hello" });
      onChunk({
        type: "done",
        content: "hello",
        conversationId: "dify-conv-new",
        messageId: "dify-msg-1",
      });
    });
    mockRagflowChatStream.mockImplementation(async (_config, _message, onChunk) => {
      onChunk({ type: "content", delta: "hello" });
      onChunk({
        type: "done",
        content: "hello",
        sessionId: "ragflow-session-new",
        messageId: "ragflow-msg-1",
      });
    });
  });

  test("first Dify message creates external conversation state", async () => {
    await runExternalChat();

    expect(mockExternalThreadState.get).toHaveBeenCalledWith({
      workspaceId: workspace.id,
      platform: "dify",
      externalAppId: "dify-app-1",
      scopeKey: "thread:99",
    });
    expect(mockDifyChatStream.mock.calls[0][3]).toEqual(
      expect.objectContaining({ conversationId: null })
    );
    expect(mockExternalThreadState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspace.id,
        platform: "dify",
        externalAppId: "dify-app-1",
        scopeKey: "thread:99",
        externalConversationId: "dify-conv-new",
      })
    );
  });

  test("second Dify message reuses stored conversation id", async () => {
    mockExternalThreadState.get.mockResolvedValue({
      external_conversation_id: "dify-conv-existing",
    });

    await runExternalChat();

    expect(mockDifyChatStream.mock.calls[0][3]).toEqual(
      expect.objectContaining({ conversationId: "dify-conv-existing" })
    );
  });

  test("Dify state is isolated by external app id in the same workspace and thread", async () => {
    mockDifyChatStream.mockImplementation(async (config, _message, onChunk) => {
      onChunk({
        type: "done",
        content: "ok",
        conversationId: `conv-${config.appId}`,
        messageId: `msg-${config.appId}`,
      });
    });

    await runExternalChat({ template: difyTemplate("dify-app-a") });
    await runExternalChat({ template: difyTemplate("dify-app-b") });

    expect(mockExternalThreadState.upsert.mock.calls.map(([args]) => args.externalAppId))
      .toEqual(["dify-app-a", "dify-app-b"]);
  });

  test("thread reset deletes persisted external state for the thread", async () => {
    mockPrisma.workspace_threads.findMany.mockResolvedValue([
      { id: 99, workspace_id: workspace.id },
    ]);
    mockPrisma.workspace_threads.deleteMany.mockResolvedValue({ count: 1 });

    await expect(WorkspaceThread.delete({ id: 99 })).resolves.toBe(true);

    expect(mockExternalThreadState.delete).toHaveBeenCalledWith({
      workspaceId: workspace.id,
      platform: "*",
      externalAppId: "*",
      scopeKey: "thread:99",
    });
    expect(mockPrisma.workspace_threads.deleteMany).toHaveBeenCalledWith({
      where: { id: 99 },
    });
  });

  test("provider failure does not update existing external state", async () => {
    mockExternalThreadState.get.mockResolvedValue({
      external_conversation_id: "dify-conv-existing",
    });
    mockDifyChatStream.mockImplementation(async (_config, _message, onChunk) => {
      onChunk({ type: "error", error: "Dify API error: 500" });
    });

    await runExternalChat();

    expect(mockExternalThreadState.upsert).not.toHaveBeenCalled();
    expect(mockWorkspaceChatsNew).not.toHaveBeenCalled();
  });

  test("API key mode without a thread stores independent RAGFlow session state", async () => {
    await runExternalChat({
      template: ragflowTemplate("ragflow-agent-a"),
      thread: null,
      apiKey: { id: 314 },
    });

    expect(mockRagflowChatStream.mock.calls[0][3]).toEqual(
      expect.objectContaining({ sessionId: null })
    );
    expect(mockExternalThreadState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspace.id,
        platform: "ragflow",
        externalAppId: "ragflow-agent-a",
        scopeKey: "apikey-session:314",
        externalSessionId: "ragflow-session-new",
      })
    );
  });
});
