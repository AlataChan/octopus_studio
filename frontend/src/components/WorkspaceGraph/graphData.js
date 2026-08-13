function endpointId(endpoint) {
  if (endpoint && typeof endpoint === "object") {
    return endpoint.id || endpoint.nodeId || "";
  }
  return endpoint || "";
}

function relationOf(link) {
  return link?.relation || link?.type || "";
}

function undirectedKey(source, target, relation) {
  const a = endpointId(source);
  const b = endpointId(target);
  return [a, b].sort().join("::") + `::${relation}`;
}

function normalizeNode(node) {
  const { metadata = {}, nodeId, ...rest } = node || {};
  const id = nodeId || rest.id;
  const label = rest.label || rest.name || metadata.label || id;
  return {
    ...metadata,
    ...rest,
    id,
    label,
    type: rest.type || metadata.type || "doc",
    rank: rest.rank || metadata.rank || 1,
  };
}

function normalizeLink(link, index) {
  const source = endpointId(link?.source ?? link?.fromNodeId);
  const target = endpointId(link?.target ?? link?.toNodeId);
  const relation = relationOf(link);
  return {
    id: link?.id || `edge-${index}`,
    source,
    target,
    relation,
    weight: link?.weight || 1,
  };
}

function getIncidentLinks(links, nodeId) {
  return links.filter(
    (link) => endpointId(link.source) === nodeId || endpointId(link.target) === nodeId
  );
}

function mapChatRelations({ links, assistantIds, chatIds, docIds }) {
  const chatToAgents = new Map();
  const chatToDocs = new Map();

  for (const link of links) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);

    if (link.relation === "assistant") {
      if (assistantIds.has(source) && chatIds.has(target)) {
        const agents = chatToAgents.get(target) || new Set();
        agents.add(source);
        chatToAgents.set(target, agents);
      } else if (chatIds.has(source) && assistantIds.has(target)) {
        const agents = chatToAgents.get(source) || new Set();
        agents.add(target);
        chatToAgents.set(source, agents);
      }
    }

    if (link.relation === "reference") {
      if (chatIds.has(source) && docIds.has(target)) {
        const docs = chatToDocs.get(source) || new Set();
        docs.add(target);
        chatToDocs.set(source, docs);
      } else if (docIds.has(source) && chatIds.has(target)) {
        const docs = chatToDocs.get(target) || new Set();
        docs.add(source);
        chatToDocs.set(target, docs);
      }
    }
  }

  return { chatToAgents, chatToDocs };
}

function deriveAssistantDocLinks({ links, existingKeys, chatToAgents, chatToDocs }) {
  const derived = [];
  const agentToDocs = new Map();

  for (const [chatId, agents] of chatToAgents.entries()) {
    const docs = chatToDocs.get(chatId);
    if (!docs) continue;

    for (const agentId of agents) {
      const existingForAgent = agentToDocs.get(agentId) || new Set();
      for (const docId of docs) {
        if (existingForAgent.size >= 15 && !existingForAgent.has(docId)) {
          continue;
        }

        const key = undirectedKey(agentId, docId, "assistant_doc");
        if (!existingKeys.has(key)) {
          derived.push({
            id: `derived-assistant-doc-${agentId}-${docId}`,
            source: agentId,
            target: docId,
            relation: "assistant_doc",
            weight: 2,
            derived: true,
          });
          existingKeys.add(key);
        }

        existingForAgent.add(docId);
      }
      agentToDocs.set(agentId, existingForAgent);
    }
  }

  return derived;
}

function collaboratorMap(chatToAgents, nodeById) {
  const collaborations = new Map();

  for (const agents of chatToAgents.values()) {
    const ids = [...agents];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = ids[i];
        const b = ids[j];
        if (!a || !b || a === b) continue;

        const aMap = collaborations.get(a) || new Map();
        aMap.set(b, (aMap.get(b) || 0) + 1);
        collaborations.set(a, aMap);

        const bMap = collaborations.get(b) || new Map();
        bMap.set(a, (bMap.get(a) || 0) + 1);
        collaborations.set(b, bMap);
      }
    }
  }

  const result = new Map();
  for (const [agentId, collabs] of collaborations.entries()) {
    result.set(
      agentId,
      [...collabs.entries()]
        .map(([otherId, count]) => {
          const other = nodeById.get(otherId);
          if (!other) return null;
          return { agentId: otherId, label: other.label || otherId, count };
        })
        .filter(Boolean)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    );
  }
  return result;
}

export function transformGraphData(input) {
  const sourceNodes = Array.isArray(input?.nodes) ? input.nodes : [];
  if (sourceNodes.length === 0) return { nodes: [], links: [] };

  const nodes = sourceNodes.map(normalizeNode).filter((node) => node.id);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeIds = new Set(nodeById.keys());
  const assistantIds = new Set(
    nodes.filter((node) => node.type === "assistant").map((node) => node.id)
  );
  const chatIds = new Set(
    nodes.filter((node) => node.type === "chat").map((node) => node.id)
  );
  const docIds = new Set(
    nodes.filter((node) => node.type === "doc").map((node) => node.id)
  );

  const rawLinks = input?.links || input?.edges || [];
  const links = rawLinks
    .map(normalizeLink)
    .filter(
      (link) =>
        link.source &&
        link.target &&
        nodeIds.has(link.source) &&
        nodeIds.has(link.target)
    );
  const existingKeys = new Set(
    links.map((link) => undirectedKey(link.source, link.target, link.relation))
  );

  const { chatToAgents, chatToDocs } = mapChatRelations({
    links,
    assistantIds,
    chatIds,
    docIds,
  });
  links.push(
    ...deriveAssistantDocLinks({
      links,
      existingKeys,
      chatToAgents,
      chatToDocs,
    })
  );

  const collaborators = collaboratorMap(chatToAgents, nodeById);
  const nodesWithDegree = nodes.map((node) => ({
    ...node,
    degree: getIncidentLinks(links, node.id).length,
    ...(collaborators.has(node.id)
      ? {
          collaborators: collaborators.get(node.id),
          collabCount: collaborators.get(node.id).length,
        }
      : {}),
  }));

  return { nodes: nodesWithDegree, links };
}
