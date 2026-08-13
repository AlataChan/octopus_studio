"use strict";

jest.mock("uuid", () => ({ v4: () => "test-uuid" }));
jest.mock("../../../utils/DocumentManager", () => ({
  DocumentManager: class {},
}));
jest.mock("../../../models/workspaceChats", () => ({
  WorkspaceChats: { new: jest.fn(), whereConditions: jest.fn() },
}));
jest.mock("../../../models/workspaceParsedFiles", () => ({
  WorkspaceParsedFiles: {},
}));
jest.mock("../../../utils/helpers", () => ({
  getVectorDbClass: jest.fn(),
  getLLMProvider: jest.fn(),
}));
jest.mock("../../../utils/helpers/chat/responses", () => ({
  writeResponseChunk: jest.fn(),
}));
jest.mock("../../../utils/chats/agents", () => ({ grepAgents: jest.fn() }));
jest.mock("../../../utils/chats/index", () => ({
  grepCommand: jest.fn().mockImplementation((m) => Promise.resolve(m)),
  VALID_COMMANDS: [],
  chatPrompt: jest.fn(),
  recentChatHistory: jest.fn().mockResolvedValue({ history: [] }),
  sourceIdentifier: jest.fn(),
}));
jest.mock("../../../models/workspaceAssistant", () => ({
  WorkspaceAssistant: { forWorkspace: jest.fn(), recordUsage: jest.fn() },
}));
jest.mock("../../../utils/http", () => ({ safeJsonParse: jest.fn() }));
jest.mock("../../../utils/chats/externalPlatformHandler", () => ({
  handleExternalPlatformChat: jest.fn().mockResolvedValue(false),
}));
jest.mock("../../../utils/chats/knowledgeModeResolver", () => ({
  resolveKnowledgeMode: jest
    .fn()
    .mockResolvedValue({ mode: "default", template: null, instance: null }),
}));
jest.mock("../../../utils/chats/contextAllocation", () => ({
  calculateContextAllocation: jest.fn().mockReturnValue({}),
}));
jest.mock("../../../models/metrics", () => ({
  Metrics: { recordChat: jest.fn() },
}));
jest.mock("../../../utils/chats/contextEnhancer", () => ({
  getGraphContextForChat: jest.fn().mockResolvedValue(""),
  getConversationSummaryContext: jest.fn().mockReturnValue(""),
}));
jest.mock("../../../utils/billing", () => ({
  BillingService: {
    checkLimit: jest.fn().mockResolvedValue({ allowed: true }),
    postCharge: jest.fn(),
  },
}));
jest.mock("../../../utils/chats/config", () => ({
  getMessageLimit: jest.fn().mockReturnValue(null),
}));
jest.mock("../../../utils/chats/hybridRetrieval", () => ({
  applyHybridRetrieval: jest
    .fn()
    .mockReturnValue({ sources: [], contextTexts: [], hybridApplied: false }),
}));
jest.mock("../../../utils/octopusKb/retrievalMerge", () => ({
  applyOctopusKbRetrieval: jest
    .fn()
    .mockResolvedValue({ contextTexts: [], sources: [], metadata: {} }),
}));

const { prepareVideoBypassContext } = require("../../../utils/chats/stream");
const {
  NoVideoProviderError,
} = require("../../../utils/VideoProviders/errors");

describe("prepareVideoBypassContext", () => {
  const videoAttachment = {
    name: "walkthrough.mp4",
    mime: "video/mp4",
    contentString: `data:video/mp4;base64,${Buffer.from("video-bytes").toString(
      "base64"
    )}`,
  };
  const imageAttachment = {
    name: "cover.png",
    mime: "image/png",
    contentString: "data:image/png;base64,aW1hZ2U=",
  };

  test("turns video attachments into context text and removes them from model attachments", async () => {
    const provider = {
      uploadVideo: jest.fn().mockResolvedValue({ sourceRef: "ms://file_123" }),
      understand: jest.fn().mockResolvedValue({
        transcript: "spoken walkthrough",
        sceneTimeline: [
          { tStart: 0, tEnd: 4, description: "Product setup screen" },
        ],
        keyObservations: ["The setup wizard is visible"],
        meta: { provider: "moonshot", sourceRef: "ms://file_123" },
      }),
    };

    const result = await prepareVideoBypassContext({
      attachments: [videoAttachment, imageAttachment],
      contextTexts: ["existing context"],
      provider,
      cache: new Map(),
      videoUnderstandingEnabled: true,
    });

    expect(result.attachments).toEqual([imageAttachment]);
    expect(result.contextTexts).toHaveLength(2);
    expect(result.contextTexts[1]).toContain("Video understanding summary");
    expect(result.contextTexts[1]).toContain("walkthrough.mp4");
    expect(result.contextTexts[1]).toContain("spoken walkthrough");
    expect(result.contextTexts[1]).toContain("Product setup screen");
    expect(result.contextTexts[1]).toContain("The setup wizard is visible");
    expect(provider.uploadVideo).toHaveBeenCalledTimes(1);
    expect(provider.understand).toHaveBeenCalledWith({
      sourceRef: "ms://file_123",
    });
  });

  test("reuses cached summaries for the same video hash", async () => {
    const cache = new Map();
    const provider = {
      uploadVideo: jest.fn().mockResolvedValue({ sourceRef: "ms://file_123" }),
      understand: jest.fn().mockResolvedValue({
        transcript: "cached transcript",
        sceneTimeline: [],
        keyObservations: ["cached observation"],
        meta: { provider: "moonshot", sourceRef: "ms://file_123" },
      }),
    };

    await prepareVideoBypassContext({
      attachments: [videoAttachment],
      contextTexts: [],
      provider,
      cache,
      videoUnderstandingEnabled: true,
    });
    provider.uploadVideo.mockClear();
    provider.understand.mockClear();

    const second = await prepareVideoBypassContext({
      attachments: [videoAttachment],
      contextTexts: [],
      provider,
      cache,
      videoUnderstandingEnabled: true,
    });

    expect(provider.uploadVideo).not.toHaveBeenCalled();
    expect(provider.understand).not.toHaveBeenCalled();
    expect(second.attachments).toEqual([]);
    expect(second.contextTexts[0]).toContain("cached transcript");
  });

  test("does not upload videos when video understanding is disabled", async () => {
    const provider = {
      uploadVideo: jest.fn(),
      understand: jest.fn(),
    };

    await expect(
      prepareVideoBypassContext({
        attachments: [videoAttachment],
        contextTexts: [],
        provider,
        cache: new Map(),
        videoUnderstandingEnabled: false,
      })
    ).rejects.toThrow(NoVideoProviderError);

    expect(provider.uploadVideo).not.toHaveBeenCalled();
    expect(provider.understand).not.toHaveBeenCalled();
  });
});
