/**
 * M0 spike executor for StudioWorkflowSpec v1.
 *
 * Deliberately test-only: no Prisma, no filesystem, no network, no run
 * persistence. It exists to answer one question — does Mastra add real
 * execution value for the studio-v1 node subset?
 */
const { loadMastra } = require("../../workAgent/mastraLoader");

const SUPPORTED_NODE_TYPES = new Set(["trigger", "retrieval", "llm", "output"]);
const PREVIEW_LIMIT = 200;
const REFERENCE_PATTERN =
  /\$\{([a-zA-Z_][a-zA-Z0-9_]*)(?:\.([a-zA-Z_][a-zA-Z0-9_]*))?\}/g;

class StudioExecutionError extends Error {
  constructor(code, message, nodeId = null) {
    super(message);
    this.name = "StudioExecutionError";
    this.code = code;
    this.nodeId = nodeId;
  }
}

function preview(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.length > PREVIEW_LIMIT
    ? `${text.slice(0, PREVIEW_LIMIT - 1)}…`
    : text;
}

function topologicalOrder(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  const next = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) {
      throw new StudioExecutionError(
        "STUDIO_EXEC_UNRESOLVED_REFERENCE",
        `edge references an unknown node: ${edge.from} -> ${edge.to}`
      );
    }
    next.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }

  const queue = nodes
    .filter((n) => indegree.get(n.id) === 0)
    .map((n) => n.id)
    .sort();
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    ordered.push(byId.get(id));
    for (const target of next.get(id).sort()) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
    queue.sort();
  }

  if (ordered.length !== nodes.length) {
    throw new StudioExecutionError(
      "STUDIO_EXEC_CYCLE",
      "workflow graph contains a cycle"
    );
  }
  return ordered;
}

function interpolate(template, { inputs, nodeOutputs, nodeId }) {
  return template.replace(REFERENCE_PATTERN, (match, head, tail) => {
    if (head === "input") {
      if (!tail || !(tail in inputs)) {
        throw new StudioExecutionError(
          "STUDIO_EXEC_UNRESOLVED_REFERENCE",
          `unresolved input reference ${match}`,
          nodeId
        );
      }
      return String(inputs[tail]);
    }
    if (!nodeOutputs.has(head)) {
      throw new StudioExecutionError(
        "STUDIO_EXEC_UNRESOLVED_REFERENCE",
        `reference ${match} is not produced upstream`,
        nodeId
      );
    }
    return String(nodeOutputs.get(head));
  });
}

async function executeStudioWorkflow({
  imported,
  inputs = {},
  approved = false,
  resolveDataset,
  model,
  mastraLoader = loadMastra,
} = {}) {
  const { spec, status, sourceIrHash, reviewPolicy, resolvedBindings } = imported;
  const base = { engine: "mastra", sourceIrHash, outputs: {} };

  if (status !== "ready") {
    return {
      ...base,
      status: "draft",
      trace: [{ event: "run.rejected", reason: "bindings_unresolved" }],
    };
  }
  if (reviewPolicy.publishRequiresReview && approved !== true) {
    return {
      ...base,
      status: "blocked",
      trace: [{ event: "run.rejected", reason: "review_required" }],
    };
  }

  for (const node of spec.workflow.nodes) {
    if (!SUPPORTED_NODE_TYPES.has(node.type)) {
      throw new StudioExecutionError(
        "STUDIO_EXEC_UNSUPPORTED_NODE",
        `node type ${node.type} is not executable in studio-v1 M0`,
        node.id
      );
    }
  }
  const ordered = topologicalOrder(
    spec.workflow.nodes,
    spec.workflow.edges
  );

  const trace = [{ event: "run.start", engine: "mastra", sourceIrHash }];
  const nodeOutputs = new Map();
  const outputs = {};

  for (const node of ordered) {
    trace.push({ event: "node.start", nodeId: node.id, nodeType: node.type });
    let result = "";

    if (node.type === "trigger") {
      result = JSON.stringify(inputs);
    } else if (node.type === "retrieval") {
      const datasetId = resolvedBindings.dataset[node.dataset];
      const query = interpolate(node.query, {
        inputs,
        nodeOutputs,
        nodeId: node.id,
      });
      result = await resolveDataset(datasetId, query);
    } else if (node.type === "llm") {
      const { Agent } = mastraLoader();
      const agent = new Agent({
        name: node.id,
        instructions: node.system_prompt || "Complete the requested task.",
        model,
      });
      const prompt = interpolate(node.prompt, {
        inputs,
        nodeOutputs,
        nodeId: node.id,
      });
      const generated = await agent.generate(prompt);
      result = generated.text || "";
    } else {
      for (const [name, ref] of Object.entries(node.bindings)) {
        outputs[name] = interpolate(ref, {
          inputs,
          nodeOutputs,
          nodeId: node.id,
        });
      }
      result = JSON.stringify(outputs);
    }

    nodeOutputs.set(node.id, result);
    trace.push({
      event: "node.end",
      nodeId: node.id,
      nodeType: node.type,
      outputPreview: preview(result),
    });
  }

  trace.push({ event: "run.end", status: "succeeded" });
  return {
    status: "succeeded",
    engine: "mastra",
    sourceIrHash,
    outputs,
    trace,
  };
}

module.exports = { executeStudioWorkflow, StudioExecutionError };
