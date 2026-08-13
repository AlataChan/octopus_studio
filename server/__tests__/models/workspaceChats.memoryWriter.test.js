const mockPrisma = {
  workspace_chats: {
    create: jest.fn(),
    count: jest.fn(),
  },
  workspace_threads: {
    update: jest.fn(),
  },
};
const mockCreateChatNode = jest.fn();
const mockCheckAndUpdateSummary = jest.fn();
const mockExtractFromChat = jest.fn();
const mockDetectEpisode = jest.fn();
const mockThreadGet = jest.fn();
const mockWorkspaceGet = jest.fn();
const mockGetLLMProvider = jest.fn();
const mockWriteConsolidatedMemory = jest.fn();

jest.mock("../../utils/prisma", () => mockPrisma);
jest.mock("../../utils/chats/graphBuilder", () => ({
  GraphBuilder: {
    createChatNode: mockCreateChatNode,
  },
}));
jest.mock("../../utils/memory", () => ({
  ConversationSummarizer: {
    checkAndUpdateSummary: mockCheckAndUpdateSummary,
  },
  WorkingMemory: {
    extractFromChat: mockExtractFromChat,
  },
  EpisodeDetector: {
    detectEpisode: mockDetectEpisode,
  },
}));
jest.mock("../../models/workspaceThread", () => ({
  WorkspaceThread: {
    get: mockThreadGet,
  },
}));
jest.mock("../../models/workspace", () => ({
  Workspace: {
    get: mockWorkspaceGet,
  },
}));
jest.mock("../../utils/helpers", () => ({
  getLLMProvider: mockGetLLMProvider,
}));
jest.mock("../../utils/octopusKb/memoryWriter", () => ({
  writeConsolidatedMemory: mockWriteConsolidatedMemory,
}));

describe("WorkspaceChats octopus-kb memory hook", () => {
  const originalSetImmediate = global.setImmediate;
  let pending;

  beforeEach(() => {
    jest.clearAllMocks();
    pending = [];
    global.setImmediate = (fn) => {
      const promise = Promise.resolve().then(fn);
      pending.push(promise);
      return promise;
    };
    mockPrisma.workspace_chats.create.mockResolvedValue({
      id: 99,
      workspaceId: 7,
      thread_id: 11,
      response: JSON.stringify({ text: "assistant response", sources: [] }),
    });
    mockPrisma.workspace_chats.count.mockResolvedValue(6);
    mockThreadGet
      .mockResolvedValueOnce({ id: 11, metadata: "{}" })
      .mockResolvedValueOnce({
        id: 11,
        metadata: JSON.stringify({
          conversation_summary: {
            updatedAt: "2026-06-16T01:02:03.004Z",
            anchored: {
              summary_text: "new summary",
              main_topics: ["kb"],
            },
          },
        }),
      });
    mockWorkspaceGet.mockResolvedValue({
      id: 7,
      slug: "workspace-a",
      chatProvider: "generic-openai",
      chatModel: "model-a",
    });
    mockCheckAndUpdateSummary.mockResolvedValue("new summary");
    mockExtractFromChat.mockResolvedValue(null);
    mockDetectEpisode.mockResolvedValue({
      suggestNew: null,
      belongsTo: null,
    });
    mockWriteConsolidatedMemory.mockResolvedValue({ path: "wiki/memory/a.md" });
  });

  afterEach(() => {
    global.setImmediate = originalSetImmediate;
  });

  it("writes consolidated memory only after a new summary and refreshed thread metadata exist", async () => {
    const { WorkspaceChats } = require("../../models/workspaceChats");

    await WorkspaceChats.new({
      workspaceId: 7,
      prompt: "hello",
      response: { text: "assistant response" },
      threadId: 11,
    });
    await Promise.all(pending);

    expect(mockCheckAndUpdateSummary).toHaveBeenCalled();
    expect(mockThreadGet).toHaveBeenCalledTimes(2);
    expect(mockWriteConsolidatedMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "workspace-a",
        threadId: 11,
        summaryUpdatedAt: "2026-06-16T01:02:03.004Z",
        anchored: expect.objectContaining({
          summary_text: "new summary",
          main_topics: ["kb"],
        }),
      })
    );
  });

  it("skips memory writing when the summarizer does not produce a new summary", async () => {
    mockCheckAndUpdateSummary.mockResolvedValue(null);
    const { WorkspaceChats } = require("../../models/workspaceChats");

    await WorkspaceChats.new({
      workspaceId: 7,
      prompt: "hello",
      response: { text: "assistant response" },
      threadId: 11,
    });
    await Promise.all(pending);

    expect(mockWriteConsolidatedMemory).not.toHaveBeenCalled();
  });
});
