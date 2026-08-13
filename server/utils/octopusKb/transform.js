const TYPE_MAP = {
  concept: "concept",
  entity: "entity",
  comparison: "comparison",
  timeline: "timeline",
  raw_source: "doc",
  alias: "tag",
  meta: "custom",
};

const RELATION_MAP = {
  wikilink: "reference",
  alias: "tag",
  supersedes: "supersedes",
  refines: "refines",
};

function mapType(type) {
  return TYPE_MAP[type] || "custom";
}

function mapRelation(relationType) {
  return RELATION_MAP[relationType] || "custom";
}

function kbGraphToModel(kbGraph = {}) {
  const nodes = Array.isArray(kbGraph.nodes) ? kbGraph.nodes : [];
  const edges = Array.isArray(kbGraph.edges) ? kbGraph.edges : [];

  return {
    nodes: nodes
      .filter((node) => node?.id)
      .map((node) => ({
        nodeId: node.id,
        label: node.title || node.id,
        type: mapType(node.type),
        metadata: {
          role: node.role ?? null,
          layer: node.layer ?? null,
          aliases: Array.isArray(node.aliases) ? node.aliases : [],
          source: "kb",
        },
      })),
    edges: edges
      .filter((edge) => edge?.source && edge?.target)
      .map((edge) => ({
        fromNodeId: edge.source,
        toNodeId: edge.target,
        relation: mapRelation(edge.relation_type),
        weight: 1,
        metadata: { source: "kb" },
        group: "kb",
      })),
  };
}

module.exports = {
  TYPE_MAP,
  RELATION_MAP,
  kbGraphToModel,
};
