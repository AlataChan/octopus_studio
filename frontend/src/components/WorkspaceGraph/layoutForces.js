import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";

export function normalizeLinkEndpoint(endpoint) {
  if (endpoint && typeof endpoint === "object") {
    return endpoint.id || endpoint.nodeId || "";
  }
  return endpoint || "";
}

export function nodeRadius(node = {}) {
  const degree = Number(node.degree || 0);
  if (node.type === "assistant") return 20 + Math.min(degree, 8);
  if (node.type === "doc") return 7 + Math.min(degree, 6);
  if (node.type === "concept" || node.type === "entity") {
    return 8 + Math.min(degree, 6);
  }
  if (node.type === "comparison" || node.type === "timeline") {
    return 7 + Math.min(degree, 5);
  }
  if (node.type === "chat") return 6;
  if (node.type === "tag") return 6;
  return 7;
}

export function assignClusters(nodes = [], links = []) {
  const assistantIds = new Set(
    nodes.filter((node) => node.type === "assistant").map((node) => node.id)
  );
  const scores = new Map();
  const clusters = new Map();

  for (const node of nodes) {
    if (node.type === "assistant") {
      clusters.set(node.id, node.id);
    } else {
      clusters.set(node.id, null);
    }
  }

  for (const link of links) {
    const source = normalizeLinkEndpoint(link.source);
    const target = normalizeLinkEndpoint(link.target);
    const sourceIsAssistant = assistantIds.has(source);
    const targetIsAssistant = assistantIds.has(target);
    if (sourceIsAssistant === targetIsAssistant) continue;

    const assistantId = sourceIsAssistant ? source : target;
    const nodeId = sourceIsAssistant ? target : source;
    if (!clusters.has(nodeId)) continue;

    const nodeScores = scores.get(nodeId) || new Map();
    nodeScores.set(assistantId, (nodeScores.get(assistantId) || 0) + 1);
    scores.set(nodeId, nodeScores);
  }

  for (const [nodeId, nodeScores] of scores.entries()) {
    const sorted = [...nodeScores.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
    clusters.set(nodeId, sorted[0]?.[0] || null);
  }

  return clusters;
}

function clusterAnchors(nodes, width, height) {
  const assistants = nodes.filter((node) => node.type === "assistant");
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.26;
  const anchors = new Map();

  assistants.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(assistants.length, 1);
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    anchors.set(node.id, { x, y });
    if (typeof node.x !== "number") node.x = x;
    if (typeof node.y !== "number") node.y = y;
  });

  return anchors;
}

export function createForces({
  nodes = [],
  links = [],
  width = 800,
  height = 600,
  clusters = assignClusters(nodes, links),
} = {}) {
  const anchors = clusterAnchors(nodes, width, height);
  const centerX = width / 2;
  const centerY = height / 2;

  return forceSimulation(nodes)
    .force(
      "link",
      forceLink(links)
        .id((node) => node.id)
        .distance(70)
        .strength(0.4)
    )
    .force("charge", forceManyBody().strength(-260))
    .force("collide", forceCollide().radius((node) => nodeRadius(node) + 6))
    .force(
      "clusterX",
      forceX((node) => {
        const clusterId = clusters.get(node.id);
        return clusterId && anchors.has(clusterId)
          ? anchors.get(clusterId).x
          : centerX;
      }).strength((node) => {
        const clusterId = clusters.get(node.id);
        return node.type === "assistant" || !clusterId ? 0.02 : 0.08;
      })
    )
    .force(
      "clusterY",
      forceY((node) => {
        const clusterId = clusters.get(node.id);
        return clusterId && anchors.has(clusterId)
          ? anchors.get(clusterId).y
          : centerY;
      }).strength((node) => {
        const clusterId = clusters.get(node.id);
        return node.type === "assistant" || !clusterId ? 0.02 : 0.08;
      })
    )
    .velocityDecay(0.4)
    .alphaMin(0.001);
}
