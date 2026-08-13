const {
  analyzeWorkspaceGraph,
  GraphAnalyticsError,
} = require("../../../utils/graphBuilder/graphAnalytics");

function node(nodeId) {
  return { nodeId };
}

describe("workspace graph analytics", () => {
  it("computes the hand-verifiable weighted PageRank distribution", async () => {
    const result = await analyzeWorkspaceGraph({
      nodes: [node("a"), node("b"), node("c")],
      edges: [
        { fromNodeId: "a", toNodeId: "b", weight: 3 },
        { fromNodeId: "a", toNodeId: "c", weight: 1 },
        { fromNodeId: "b", toNodeId: "a", weight: 1 },
        { fromNodeId: "c", toNodeId: "a", weight: 1 },
      ],
    });

    // Closed-form raw scores are a=0.486486..., b=0.360135..., c=0.153378...
    // and the public rank is normalized by the maximum score.
    expect(result.nodes.get("a").rank).toBeCloseTo(1, 6);
    expect(result.nodes.get("b").rank).toBeCloseTo(0.740278, 5);
    expect(result.nodes.get("c").rank).toBeCloseTo(0.315278, 5);
    expect(result.pageRank.converged).toBe(true);
    expect(result.pageRank.iterations).toBeLessThanOrEqual(100);
  });

  it("finds the two known communities in a weakly joined triangle pair", async () => {
    const edges = [
      ["a", "b", 1],
      ["b", "c", 1],
      ["c", "a", 1],
      ["d", "e", 1],
      ["e", "f", 1],
      ["f", "d", 1],
      ["c", "d", 0.05],
    ].map(([fromNodeId, toNodeId, weight]) => ({
      fromNodeId,
      toNodeId,
      weight,
    }));

    const forward = await analyzeWorkspaceGraph({
      nodes: ["a", "b", "c", "d", "e", "f"].map(node),
      edges,
    });
    const reversed = await analyzeWorkspaceGraph({
      nodes: ["f", "e", "d", "c", "b", "a"].map(node),
      edges: [...edges].reverse(),
    });

    expect([...forward.nodes.entries()]).toEqual([
      ["a", expect.objectContaining({ group: "community-0" })],
      ["b", expect.objectContaining({ group: "community-0" })],
      ["c", expect.objectContaining({ group: "community-0" })],
      ["d", expect.objectContaining({ group: "community-1" })],
      ["e", expect.objectContaining({ group: "community-1" })],
      ["f", expect.objectContaining({ group: "community-1" })],
    ]);
    expect([...reversed.nodes.entries()]).toEqual([...forward.nodes.entries()]);
  });

  it("handles empty, singleton, and disconnected graphs explicitly", async () => {
    const empty = await analyzeWorkspaceGraph({ nodes: [], edges: [] });
    expect([...empty.nodes]).toEqual([]);
    expect(empty.pageRank).toEqual({ iterations: 0, converged: true });

    const singleton = await analyzeWorkspaceGraph({
      nodes: [node("only")],
      edges: [],
    });
    expect(singleton.nodes.get("only")).toEqual({
      rank: 1,
      group: "community-0",
    });

    const disconnected = await analyzeWorkspaceGraph({
      nodes: ["a", "b", "c", "d", "isolated"].map(node),
      edges: [
        { fromNodeId: "a", toNodeId: "b" },
        { fromNodeId: "b", toNodeId: "a" },
        { fromNodeId: "c", toNodeId: "d" },
        { fromNodeId: "d", toNodeId: "c" },
      ],
    });
    expect(disconnected.nodes.get("a").group).toBe("community-0");
    expect(disconnected.nodes.get("b").group).toBe("community-0");
    expect(disconnected.nodes.get("c").group).toBe("community-1");
    expect(disconnected.nodes.get("d").group).toBe("community-1");
    expect(disconnected.nodes.get("isolated").group).toBe("community-2");
    expect(disconnected.nodes.get("isolated").rank).toBeCloseTo(0.15, 5);
  });

  it("aggregates duplicate edges and accounts for self-loops", async () => {
    const nodes = [node("a"), node("b")];
    const duplicates = await analyzeWorkspaceGraph({
      nodes,
      edges: [
        { fromNodeId: "a", toNodeId: "a", weight: 2 },
        { fromNodeId: "a", toNodeId: "b", weight: 1 },
        { fromNodeId: "a", toNodeId: "b", weight: 2 },
        { fromNodeId: "b", toNodeId: "a", weight: 3 },
      ],
    });
    const aggregated = await analyzeWorkspaceGraph({
      nodes,
      edges: [
        { fromNodeId: "a", toNodeId: "a", weight: 2 },
        { fromNodeId: "a", toNodeId: "b", weight: 3 },
        { fromNodeId: "b", toNodeId: "a", weight: 3 },
      ],
    });

    expect([...duplicates.nodes.entries()]).toEqual([
      ...aggregated.nodes.entries(),
    ]);
  });

  it("fails closed on an orphan endpoint or invalid weight without echoing input", async () => {
    await expect(
      analyzeWorkspaceGraph({
        nodes: [node("safe")],
        edges: [{ fromNodeId: "safe", toNodeId: "secret-node" }],
      })
    ).rejects.toMatchObject({ code: "GRAPH_ANALYTICS_ORPHAN_EDGE" });

    await expect(
      analyzeWorkspaceGraph({
        nodes: [node("safe")],
        edges: [{ fromNodeId: "safe", toNodeId: "safe", weight: -1 }],
      })
    ).rejects.toEqual(
      new GraphAnalyticsError(
        "GRAPH_ANALYTICS_INVALID_WEIGHT",
        "Graph edge weight must be a finite non-negative number."
      )
    );
  });

  it("cooperatively yields while processing a non-trivial graph", async () => {
    let yields = 0;
    const nodes = Array.from({ length: 100 }, (_, index) => node(`n-${index}`));
    const edges = nodes.map((_, index) => ({
      fromNodeId: `n-${index}`,
      toNodeId: `n-${(index + 1) % nodes.length}`,
    }));

    await analyzeWorkspaceGraph({
      nodes,
      edges,
      yieldControl: async () => {
        yields += 1;
      },
    });

    expect(yields).toBeGreaterThan(0);
  });
});
