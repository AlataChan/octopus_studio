const {
  buildSyntheticGraph,
  measureGraphAnalytics,
} = require("../../scripts/benchmarks/workspaceGraphAnalytics");

describe("workspace graph analytics benchmark", () => {
  it("builds the requested deterministic clustered graph", () => {
    const graph = buildSyntheticGraph(100);

    expect(graph.nodes).toHaveLength(100);
    expect(graph.nodes[0]).toEqual({ nodeId: "node-00000" });
    expect(graph.nodes[99]).toEqual({ nodeId: "node-00099" });
    expect(graph.edges.length).toBeGreaterThan(100);
    expect(graph.edges).toContainEqual({
      fromNodeId: "node-00099",
      toNodeId: "node-00000",
      weight: 0.05,
    });
  });

  it("measures wall time and event-loop responsiveness", async () => {
    const measurement = await measureGraphAnalytics(100);

    expect(measurement.nodeCount).toBe(100);
    expect(measurement.edgeCount).toBeGreaterThan(100);
    expect(measurement.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(measurement.eventLoopTicks).toBeGreaterThan(0);
    expect(measurement.maxEventLoopDelayMs).toBeGreaterThanOrEqual(0);
    expect(measurement.communities).toBeGreaterThan(1);
  });
});
