jest.mock("../../../utils/memory/episodeManager", () => ({
  EPISODE_STATUS: { ACTIVE: "active" },
  EpisodeManager: {
    getEpisodes: jest.fn(async () => []),
  },
}));

jest.mock("../../../utils/helpers", () => ({
  getLLMProvider: jest.fn(() => null),
}));

describe("EpisodeDetector", () => {
  it("uses EpisodeManager.getEpisodes so an empty active list can suggest a new episode", async () => {
    const { EpisodeManager } = require("../../../utils/memory/episodeManager");
    const { EpisodeDetector } = require("../../../utils/memory/episodeDetector");

    const result = await EpisodeDetector.detectEpisode({
      workspaceId: 7,
      userMessage: "请帮我制定知识图谱开发计划",
      aiResponse: "好的",
      threadId: 11,
      messageCount: 5,
    });

    expect(EpisodeManager.getEpisodes).toHaveBeenCalledWith({
      workspaceId: 7,
      status: "active",
    });
    expect(result.suggestNew).toBe("知识图谱");
    expect(result.confidence).toBeGreaterThan(0);
  });
});
