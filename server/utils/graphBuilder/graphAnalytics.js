const PAGE_RANK_DAMPING = 0.85;
const CONVERGENCE_EPSILON = 1e-6;
const ITERATION_CAP = 100;
const GAIN_EPSILON = 1e-12;

class GraphAnalyticsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GraphAnalyticsError";
    this.code = code;
  }
}

function defaultYieldControl() {
  return new Promise((resolve) => setImmediate(resolve));
}

function addNestedWeight(container, from, to, weight) {
  let destinations = container.get(from);
  if (!destinations) {
    destinations = new Map();
    container.set(from, destinations);
  }
  destinations.set(to, (destinations.get(to) || 0) + weight);
}

function prepareGraph(nodes, edges) {
  const nodeIds = [...new Set(nodes.map((node) => node?.nodeId))].sort();
  if (
    nodeIds.some(
      (nodeId) => typeof nodeId !== "string" || nodeId.trim().length === 0
    )
  ) {
    throw new GraphAnalyticsError(
      "GRAPH_ANALYTICS_INVALID_NODE",
      "Graph nodes must have non-empty string identifiers."
    );
  }

  const nodeIndex = new Map(nodeIds.map((nodeId, index) => [nodeId, index]));
  const directed = new Map();
  const undirected = new Map();

  for (const edge of edges) {
    const fromIndex = nodeIndex.get(edge?.fromNodeId);
    const toIndex = nodeIndex.get(edge?.toNodeId);
    if (fromIndex === undefined || toIndex === undefined) {
      throw new GraphAnalyticsError(
        "GRAPH_ANALYTICS_ORPHAN_EDGE",
        "Graph edge endpoints must reference materialized nodes."
      );
    }

    const weight = edge.weight == null ? 1 : edge.weight;
    if (!Number.isFinite(weight) || weight < 0) {
      throw new GraphAnalyticsError(
        "GRAPH_ANALYTICS_INVALID_WEIGHT",
        "Graph edge weight must be a finite non-negative number."
      );
    }
    if (weight === 0) continue;

    // Duplicate directed edges are an explicit weighted multigraph: their
    // weights add before either algorithm runs.
    addNestedWeight(directed, fromIndex, toIndex, weight);

    const lower = Math.min(fromIndex, toIndex);
    const upper = Math.max(fromIndex, toIndex);
    addNestedWeight(undirected, lower, upper, weight);
  }

  return { nodeIds, directed, undirected };
}

async function computePageRank(
  prepared,
  {
    damping = PAGE_RANK_DAMPING,
    epsilon = CONVERGENCE_EPSILON,
    iterationCap = ITERATION_CAP,
    yieldControl = defaultYieldControl,
  } = {}
) {
  const nodeCount = prepared.nodeIds.length;
  if (nodeCount === 0) {
    return { ranks: new Float64Array(), iterations: 0, converged: true };
  }
  if (nodeCount === 1) {
    return {
      ranks: Float64Array.from([1]),
      iterations: 0,
      converged: true,
    };
  }

  let ranks = new Float64Array(nodeCount).fill(1 / nodeCount);
  const outgoingWeights = new Float64Array(nodeCount);
  for (const [fromIndex, destinations] of prepared.directed) {
    for (const weight of destinations.values()) {
      outgoingWeights[fromIndex] += weight;
    }
  }

  let converged = false;
  let iterations = 0;
  for (iterations = 1; iterations <= iterationCap; iterations++) {
    let danglingMass = 0;
    for (let index = 0; index < nodeCount; index++) {
      if (outgoingWeights[index] === 0) danglingMass += ranks[index];
    }

    const nextRanks = new Float64Array(nodeCount).fill(
      (1 - damping) / nodeCount + (damping * danglingMass) / nodeCount
    );

    for (const [fromIndex, destinations] of prepared.directed) {
      const sourceShare =
        (damping * ranks[fromIndex]) / outgoingWeights[fromIndex];
      for (const [toIndex, weight] of destinations) {
        nextRanks[toIndex] += sourceShare * weight;
      }
    }

    let delta = 0;
    for (let index = 0; index < nodeCount; index++) {
      delta += Math.abs(nextRanks[index] - ranks[index]);
    }
    ranks = nextRanks;

    if (delta < epsilon) {
      converged = true;
      break;
    }
    if (iterations % 5 === 0) await yieldControl();
  }

  const completedIterations = Math.min(iterations, iterationCap);
  let maximum = 0;
  for (const rank of ranks) maximum = Math.max(maximum, rank);
  if (maximum > 0) {
    for (let index = 0; index < ranks.length; index++) {
      ranks[index] /= maximum;
    }
  }

  return { ranks, iterations: completedIterations, converged };
}

function buildUndirectedGraph(nodeCount, weightedEdges) {
  const adjacency = Array.from({ length: nodeCount }, () => new Map());
  for (const { from, to, weight } of weightedEdges) {
    if (from === to) {
      adjacency[from].set(to, (adjacency[from].get(to) || 0) + 2 * weight);
      continue;
    }
    adjacency[from].set(to, (adjacency[from].get(to) || 0) + weight);
    adjacency[to].set(from, (adjacency[to].get(from) || 0) + weight);
  }
  return adjacency;
}

function preparedUndirectedEdges(prepared) {
  const result = [];
  for (const [from, destinations] of prepared.undirected) {
    for (const [to, weight] of destinations) {
      result.push({ from, to, weight });
    }
  }
  return result;
}

function compactCommunities(communities) {
  const members = new Map();
  for (let node = 0; node < communities.length; node++) {
    const community = communities[node];
    if (!members.has(community)) members.set(community, []);
    members.get(community).push(node);
  }

  const ordered = [...members.entries()].sort(
    (left, right) => left[1][0] - right[1][0]
  );
  const compactIndex = new Map(
    ordered.map(([community], index) => [community, index])
  );
  return {
    assignments: Int32Array.from(communities, (community) =>
      compactIndex.get(community)
    ),
    count: ordered.length,
  };
}

async function optimizeCommunities(adjacency, yieldControl) {
  const nodeCount = adjacency.length;
  const communities = Int32Array.from(
    { length: nodeCount },
    (_, index) => index
  );
  const degrees = Float64Array.from(adjacency, (neighbors) => {
    let degree = 0;
    for (const weight of neighbors.values()) degree += weight;
    return degree;
  });
  const communityTotals = Float64Array.from(degrees);
  const totalWeightTwice = degrees.reduce((sum, degree) => sum + degree, 0);

  if (totalWeightTwice === 0) {
    return { ...compactCommunities(communities), passes: 0 };
  }

  let passes = 0;
  for (; passes < ITERATION_CAP; passes++) {
    let moved = false;

    for (let node = 0; node < nodeCount; node++) {
      const currentCommunity = communities[node];
      const degree = degrees[node];
      if (degree === 0) continue;

      const neighborWeights = new Map();
      for (const [neighbor, weight] of adjacency[node]) {
        const community = communities[neighbor];
        neighborWeights.set(
          community,
          (neighborWeights.get(community) || 0) + weight
        );
      }

      communityTotals[currentCommunity] -= degree;
      let bestCommunity = currentCommunity;
      let bestGain = 0;
      const candidates = [...neighborWeights.keys()].sort(
        (left, right) => left - right
      );

      for (const candidate of candidates) {
        const gain =
          (neighborWeights.get(candidate) || 0) -
          (communityTotals[candidate] * degree) / totalWeightTwice;
        if (
          gain > bestGain + GAIN_EPSILON ||
          (Math.abs(gain - bestGain) <= GAIN_EPSILON &&
            gain > GAIN_EPSILON &&
            candidate < bestCommunity)
        ) {
          bestGain = gain;
          bestCommunity = candidate;
        }
      }

      communities[node] = bestCommunity;
      communityTotals[bestCommunity] += degree;
      if (bestCommunity !== currentCommunity) moved = true;
    }

    await yieldControl();
    if (!moved) break;
  }

  return { ...compactCommunities(communities), passes: passes + 1 };
}

function aggregateGraph(adjacency, assignments, communityCount) {
  const aggregatedWeights = new Map();
  for (let from = 0; from < adjacency.length; from++) {
    for (const [to, adjacencyWeight] of adjacency[from]) {
      if (to < from) continue;
      const weight = from === to ? adjacencyWeight / 2 : adjacencyWeight;
      const fromCommunity = assignments[from];
      const toCommunity = assignments[to];
      const lower = Math.min(fromCommunity, toCommunity);
      const upper = Math.max(fromCommunity, toCommunity);
      addNestedWeight(aggregatedWeights, lower, upper, weight);
    }
  }

  const edges = [];
  for (const [from, destinations] of aggregatedWeights) {
    for (const [to, weight] of destinations) {
      edges.push({ from, to, weight });
    }
  }
  return buildUndirectedGraph(communityCount, edges);
}

async function detectLouvainCommunities(
  prepared,
  { yieldControl = defaultYieldControl } = {}
) {
  const nodeCount = prepared.nodeIds.length;
  if (nodeCount === 0) return { assignments: new Int32Array(), levels: 0 };
  if (nodeCount === 1) {
    return { assignments: Int32Array.from([0]), levels: 1 };
  }

  let adjacency = buildUndirectedGraph(
    nodeCount,
    preparedUndirectedEdges(prepared)
  );
  let originalToCurrent = Int32Array.from(
    { length: nodeCount },
    (_, index) => index
  );
  let levels = 0;

  while (levels < ITERATION_CAP) {
    const optimized = await optimizeCommunities(adjacency, yieldControl);
    levels += 1;
    for (let index = 0; index < originalToCurrent.length; index++) {
      originalToCurrent[index] =
        optimized.assignments[originalToCurrent[index]];
    }

    if (optimized.count === adjacency.length) break;
    adjacency = aggregateGraph(
      adjacency,
      optimized.assignments,
      optimized.count
    );
    await yieldControl();
    if (optimized.count === 1) break;
  }

  // Aggregation labels are ordered by each community's smallest canonical
  // node index, so these labels remain stable across input order changes.
  return { assignments: originalToCurrent, levels };
}

async function analyzeWorkspaceGraph({
  nodes = [],
  edges = [],
  yieldControl = defaultYieldControl,
} = {}) {
  const prepared = prepareGraph(nodes, edges);
  const [pageRank, louvain] = await Promise.all([
    computePageRank(prepared, { yieldControl }),
    detectLouvainCommunities(prepared, { yieldControl }),
  ]);

  const analytics = new Map();
  for (let index = 0; index < prepared.nodeIds.length; index++) {
    analytics.set(prepared.nodeIds[index], {
      rank: pageRank.ranks[index],
      group: `community-${louvain.assignments[index]}`,
    });
  }

  return {
    nodes: analytics,
    pageRank: {
      iterations: pageRank.iterations,
      converged: pageRank.converged,
    },
    louvain: { levels: louvain.levels },
  };
}

module.exports = {
  analyzeWorkspaceGraph,
  GraphAnalyticsError,
  PAGE_RANK_DAMPING,
  CONVERGENCE_EPSILON,
  ITERATION_CAP,
};
