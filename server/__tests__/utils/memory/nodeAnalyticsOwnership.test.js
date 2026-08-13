const mockUpsertNode = jest.fn(async () => ({}));
const mockUpsertEdge = jest.fn(async () => ({}));
const mockGetNode = jest.fn();

jest.mock("../../../models/workspaceGraph", () => ({
  WorkspaceGraph: {
    upsertNode: mockUpsertNode,
    upsertEdge: mockUpsertEdge,
    getNode: mockGetNode,
  },
}));

jest.mock("uuid", () => ({ v4: jest.fn(() => "fixed-id") }));

const { ManualMemory } = require("../../../utils/memory/manualMemory");
const { EpisodeManager } = require("../../../utils/memory/episodeManager");

describe("graph node analytics ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("manual-memory producers leave group and rank to graph analytics", async () => {
    await ManualMemory.saveMemory({
      workspaceId: 7,
      content: "Remember the returns policy",
      tags: ["returns"],
    });

    for (const call of mockUpsertNode.mock.calls) {
      expect(call[0]).not.toHaveProperty("group");
      expect(call[0]).not.toHaveProperty("rank");
    }
  });

  it("recording memory access does not turn PageRank into an access score", async () => {
    mockGetNode.mockResolvedValue({
      nodeId: "memory-a",
      type: "memory",
      label: "Returns",
      rank: 0.8,
      metadata: { accessCount: 2 },
    });

    await ManualMemory.recordAccess({ workspaceId: 7, memoryId: "memory-a" });

    const update = mockUpsertNode.mock.calls[0][0];
    expect(update.metadata.accessCount).toBe(3);
    expect(update).not.toHaveProperty("group");
    expect(update).not.toHaveProperty("rank");
  });

  it("episode creation leaves community and centrality unset until build", async () => {
    await EpisodeManager.createEpisode({
      workspaceId: 7,
      name: "Returns rollout",
      tags: ["returns"],
    });

    for (const call of mockUpsertNode.mock.calls) {
      expect(call[0]).not.toHaveProperty("group");
      expect(call[0]).not.toHaveProperty("rank");
    }
  });
});
