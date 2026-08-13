const { performance } = require("perf_hooks");
const {
  analyzeWorkspaceGraph,
} = require("../../utils/graphBuilder/graphAnalytics");

const CLUSTER_SIZE = 25;
const TIMER_INTERVAL_MS = 5;

function nodeId(index) {
  return `node-${String(index).padStart(5, "0")}`;
}

function buildSyntheticGraph(nodeCount) {
  if (!Number.isInteger(nodeCount) || nodeCount < 1) {
    throw new TypeError("nodeCount must be a positive integer.");
  }

  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    nodeId: nodeId(index),
  }));
  const edges = [];
  const clusterCount = Math.ceil(nodeCount / CLUSTER_SIZE);

  for (let cluster = 0; cluster < clusterCount; cluster++) {
    const start = cluster * CLUSTER_SIZE;
    const end = Math.min(start + CLUSTER_SIZE, nodeCount);
    const size = end - start;

    for (let offset = 0; offset < size; offset++) {
      const from = start + offset;
      const next = start + ((offset + 1) % size);
      const nextTwo = start + ((offset + 2) % size);
      edges.push({
        fromNodeId: nodeId(from),
        toNodeId: nodeId(next),
        weight: 1,
      });
      if (size > 2) {
        edges.push({
          fromNodeId: nodeId(from),
          toNodeId: nodeId(nextTwo),
          weight: 0.6,
        });
      }
    }

    const nextClusterStart = ((cluster + 1) % clusterCount) * CLUSTER_SIZE;
    edges.push({
      fromNodeId: nodeId(end - 1),
      toNodeId: nodeId(nextClusterStart),
      weight: 0.05,
    });
  }

  return { nodes, edges };
}

async function measureGraphAnalytics(nodeCount = 5000) {
  const graph = buildSyntheticGraph(nodeCount);
  let expectedTimerAt = performance.now() + TIMER_INTERVAL_MS;
  let maxEventLoopDelayMs = 0;
  let eventLoopTicks = 0;
  let eventLoopTicksDuringAnalysis = 0;
  let analyzing = true;

  const timer = setInterval(() => {
    const now = performance.now();
    maxEventLoopDelayMs = Math.max(
      maxEventLoopDelayMs,
      Math.max(0, now - expectedTimerAt)
    );
    expectedTimerAt = now + TIMER_INTERVAL_MS;
    eventLoopTicks += 1;
    if (analyzing) eventLoopTicksDuringAnalysis += 1;
  }, TIMER_INTERVAL_MS);

  await new Promise((resolve) => setImmediate(resolve));
  const startedAt = performance.now();
  const result = await analyzeWorkspaceGraph(graph);
  const elapsedMs = performance.now() - startedAt;
  analyzing = false;
  await new Promise((resolve) => setTimeout(resolve, TIMER_INTERVAL_MS));
  clearInterval(timer);

  return {
    nodeCount,
    edgeCount: graph.edges.length,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    maxEventLoopDelayMs: Number(maxEventLoopDelayMs.toFixed(3)),
    eventLoopTicks,
    eventLoopTicksDuringAnalysis,
    pageRankIterations: result.pageRank.iterations,
    pageRankConverged: result.pageRank.converged,
    louvainLevels: result.louvain.levels,
    communities: new Set(
      [...result.nodes.values()].map((values) => values.group)
    ).size,
  };
}

if (require.main === module) {
  const requestedCount = Number(process.argv[2] || 5000);
  measureGraphAnalytics(requestedCount)
    .then((measurement) =>
      process.stdout.write(`${JSON.stringify(measurement)}\n`)
    )
    .catch((error) => {
      process.stderr.write(
        `${error.code || "GRAPH_ANALYTICS_BENCHMARK_FAILED"}\n`
      );
      process.exitCode = 1;
    });
}

module.exports = { buildSyntheticGraph, measureGraphAnalytics };
