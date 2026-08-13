const { randomUUID } = require("crypto");
const Ajv2020 = require("ajv/dist/2020");
const { FdeRunCheckpoint } = require("../../models/fdeRunCheckpoint");
const { computeSpecDigest } = require("../../models/fdeWorkflowDraft");
const { redactFdeValue } = require("./redaction");
const { validateStudioWorkflowSpec } = require("./studioWorkflowSpec");
const { invokeStudioModel } = require("./studioModelInvoker");
const {
  modelCostEvidence,
  nodeEvidence,
  retrievalEvidence,
  runStatusEvidence,
} = require("./runEvidence");

const SUPPORTED_NODE_TYPES = new Set(["trigger", "retrieval", "llm", "output"]);
const REFERENCE = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
const ANY_REFERENCE = /\$\{([^}]+)\}/g;
const STRING_FIELDS = Object.freeze({
  trigger: new Set(),
  retrieval: new Set(["text"]),
  llm: new Set(["text"]),
  output: new Set(),
});

class StudioExecutionError extends Error {
  constructor(code, message = code, nodeId = null, status = 409) {
    super(message);
    this.name = "StudioExecutionError";
    this.code = code;
    this.nodeId = nodeId;
    this.path = nodeId ? `workflow.nodes.${nodeId}` : "workflow";
    this.status = status;
  }
}

function parseObject(value, code) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") throw new Error("not object");
    return parsed;
  } catch {
    throw new StudioExecutionError(code);
  }
}

function inputDigest(inputs) {
  return computeSpecDigest(inputs);
}

function topologicalOrder(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const next = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) {
      throw new StudioExecutionError("STUDIO_EXEC_UNRESOLVED_REFERENCE");
    }
    next.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }
  const queue = [...byId.keys()].filter((id) => indegree.get(id) === 0).sort();
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
    throw new StudioExecutionError("STUDIO_EXEC_CYCLE");
  }
  return ordered;
}

function ancestorsByNode(nodes, edges) {
  const parents = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) parents.get(edge.to)?.push(edge.from);
  const memo = new Map();
  function ancestors(id, visiting = new Set()) {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return new Set();
    const nextVisiting = new Set(visiting).add(id);
    const result = new Set();
    for (const parent of parents.get(id) || []) {
      result.add(parent);
      for (const ancestor of ancestors(parent, nextVisiting))
        result.add(ancestor);
    }
    memo.set(id, result);
    return result;
  }
  return new Map(nodes.map((node) => [node.id, ancestors(node.id)]));
}

function templatesFor(node) {
  if (node.type === "retrieval") return [{ template: node.query }];
  if (node.type === "llm") {
    return [{ template: node.system_prompt || "" }, { template: node.prompt }];
  }
  if (node.type === "output") {
    return Object.entries(node.bindings || {}).map(
      ([outputName, template]) => ({
        outputName,
        template,
      })
    );
  }
  return [];
}

function validateReferences(spec) {
  const nodeById = new Map(spec.workflow.nodes.map((node) => [node.id, node]));
  const inputs = new Set(
    (spec.workflow.inputs || []).map((input) => input.name)
  );
  const ancestors = ancestorsByNode(spec.workflow.nodes, spec.workflow.edges);
  const outputTypes = new Map(
    (spec.workflow.outputs || []).map((output) => [output.name, output.type])
  );
  for (const node of spec.workflow.nodes) {
    for (const { template, outputName } of templatesFor(node)) {
      if (typeof template !== "string") {
        throw new StudioExecutionError(
          "STUDIO_EXEC_REFERENCE_INVALID",
          undefined,
          node.id
        );
      }
      const all = [...template.matchAll(ANY_REFERENCE)];
      for (const match of all) {
        const parsed =
          /^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(match[1]);
        if (!parsed) {
          throw new StudioExecutionError(
            "STUDIO_EXEC_REFERENCE_INVALID",
            undefined,
            node.id
          );
        }
        const [, head, field] = parsed;
        if (head === "input") {
          if (!inputs.has(field)) {
            throw new StudioExecutionError(
              "STUDIO_EXEC_UNRESOLVED_REFERENCE",
              undefined,
              node.id
            );
          }
          continue;
        }
        const source = nodeById.get(head);
        if (!source || !ancestors.get(node.id).has(head)) {
          throw new StudioExecutionError(
            "STUDIO_EXEC_UNRESOLVED_REFERENCE",
            undefined,
            node.id
          );
        }
        if (source.type === "llm" && field === "data") {
          const exactObjectBinding =
            source.output_schema &&
            node.type === "output" &&
            outputTypes.get(outputName) === "json" &&
            all.length === 1 &&
            template === match[0];
          if (!exactObjectBinding) {
            throw new StudioExecutionError(
              "STUDIO_EXEC_REFERENCE_NOT_STRING",
              undefined,
              node.id
            );
          }
          continue;
        }
        if (!STRING_FIELDS[source.type]?.has(field)) {
          throw new StudioExecutionError(
            source.type === "retrieval" && field === "chunks"
              ? "STUDIO_EXEC_REFERENCE_NOT_STRING"
              : "STUDIO_EXEC_UNRESOLVED_REFERENCE",
            undefined,
            node.id
          );
        }
      }
    }
  }
}

function structuredModelResult(text, outputSchema, nodeId) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new StudioExecutionError(
      "STUDIO_EXEC_OUTPUT_SCHEMA_INVALID",
      undefined,
      nodeId
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new StudioExecutionError(
      "STUDIO_EXEC_OUTPUT_SCHEMA_INVALID",
      undefined,
      nodeId
    );
  }
  let validate;
  try {
    validate = new Ajv2020({ allErrors: false, strict: false }).compile(
      outputSchema
    );
  } catch {
    throw new StudioExecutionError(
      "STUDIO_EXEC_OUTPUT_SCHEMA_INVALID",
      undefined,
      nodeId
    );
  }
  if (validate.$async || validate(data) !== true) {
    throw new StudioExecutionError(
      "STUDIO_EXEC_OUTPUT_SCHEMA_INVALID",
      undefined,
      nodeId
    );
  }
  return { text, data };
}

function resolveOutputBinding(
  reference,
  { outputType, inputs, nodeOutputs, nodeId }
) {
  const exact = /^\$\{([a-zA-Z_][a-zA-Z0-9_]*)\.data\}$/.exec(reference);
  if (exact && outputType === "json") {
    const value = nodeOutputs.nodes?.[exact[1]]?.data;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new StudioExecutionError(
        "STUDIO_EXEC_UNRESOLVED_REFERENCE",
        undefined,
        nodeId
      );
    }
    return value;
  }
  return interpolate(reference, { inputs, nodeOutputs, nodeId });
}

function interpolate(template, { inputs, nodeOutputs, nodeId }) {
  return template.replace(REFERENCE, (_match, head, field) => {
    const value =
      head === "input" ? inputs[field] : nodeOutputs.nodes?.[head]?.[field];
    if (typeof value !== "string") {
      throw new StudioExecutionError(
        value === undefined
          ? "STUDIO_EXEC_UNRESOLVED_REFERENCE"
          : "STUDIO_EXEC_REFERENCE_NOT_STRING",
        undefined,
        nodeId
      );
    }
    return value;
  });
}

function preflight({ draft, workspace, engine, inputs }) {
  if (!draft || Number(draft.workspaceId) !== Number(workspace?.id)) {
    throw new StudioExecutionError(
      "STUDIO_DRAFT_NOT_FOUND",
      undefined,
      null,
      404
    );
  }
  if (draft.status !== "published") {
    throw new StudioExecutionError("STUDIO_RUN_PUBLISHED_REQUIRED");
  }
  const missing = parseObject(
    draft.missingBindingsJson || "[]",
    "STUDIO_RUN_BINDING_INVALID"
  );
  if (!Array.isArray(missing) || missing.length) {
    throw new StudioExecutionError("STUDIO_RUN_BINDING_MISSING");
  }
  if (
    draft.reviewStatus !== "approved" ||
    !draft.reviewedSubjectDigest ||
    draft.reviewedSubjectDigest !== draft.reviewSubjectDigest
  ) {
    throw new StudioExecutionError("STUDIO_RUN_REVIEW_REQUIRED");
  }
  if (draft.engine !== engine) {
    throw new StudioExecutionError("STUDIO_EXEC_ENGINE_MISMATCH");
  }
  const rawSpec = parseObject(draft.specJson, "STUDIO_EXEC_SPEC_INVALID");
  for (const node of rawSpec.workflow?.nodes || []) {
    if (!SUPPORTED_NODE_TYPES.has(node.type)) {
      throw new StudioExecutionError(
        "STUDIO_EXEC_UNSUPPORTED_NODE",
        undefined,
        node.id
      );
    }
  }
  const spec = validateStudioWorkflowSpec(rawSpec);
  const ordered = topologicalOrder(spec.workflow.nodes, spec.workflow.edges);
  validateReferences(spec);
  const declaredInputs = new Map(
    (spec.workflow.inputs || []).map((input) => [input.name, input])
  );
  for (const [name, declaration] of declaredInputs) {
    if (
      declaration.required &&
      !Object.prototype.hasOwnProperty.call(inputs, name)
    ) {
      throw new StudioExecutionError("STUDIO_EXEC_UNRESOLVED_REFERENCE");
    }
  }
  for (const [name, value] of Object.entries(inputs)) {
    if (!declaredInputs.has(name) || typeof value !== "string") {
      throw new StudioExecutionError("STUDIO_EXEC_INPUT_INVALID");
    }
  }
  const resolvedBindings = parseObject(
    draft.resolvedBindingsJson,
    "STUDIO_RUN_BINDING_INVALID"
  );
  const dataset = resolvedBindings.dataset || {};
  for (const binding of Object.values(dataset)) {
    if (binding?.vectorNamespace !== workspace.slug) {
      throw new StudioExecutionError("STUDIO_EXEC_DATASET_TENANT_MISMATCH");
    }
  }
  return { spec, ordered, resolvedBindings };
}

function normalizedChunks(value) {
  const source = Array.isArray(value) ? value : value?.chunks;
  if (!Array.isArray(source)) {
    throw new StudioExecutionError("STUDIO_EXEC_RETRIEVAL_INVALID");
  }
  return source.map((chunk) => {
    if (
      typeof chunk?.text !== "string" ||
      typeof chunk?.docId !== "string" ||
      typeof chunk?.score !== "number"
    ) {
      throw new StudioExecutionError("STUDIO_EXEC_RETRIEVAL_INVALID");
    }
    return { text: chunk.text, score: chunk.score, docId: chunk.docId };
  });
}

async function runStudioWorkflow({
  runId,
  engine,
  draft,
  workspace,
  inputs = {},
  checkpointStore = FdeRunCheckpoint,
  resolveDataset,
  invokeModel = invokeStudioModel,
  emitEvent = async () => {},
  leaseOwner = randomUUID(),
  leaseMs = 5 * 60_000,
  authCtx = {},
  isCancelled = async () => false,
} = {}) {
  const { spec, ordered, resolvedBindings } = preflight({
    draft,
    workspace,
    engine,
    inputs,
  });
  if (typeof resolveDataset !== "function") {
    throw new StudioExecutionError("STUDIO_EXEC_RETRIEVAL_UNAVAILABLE");
  }
  const digest = inputDigest(inputs);
  let checkpoint = await checkpointStore.get(runId);
  if (!checkpoint) {
    checkpoint = await checkpointStore.create({
      runId,
      nodeCursor: ordered[0].id,
      inputDigest: digest,
      nodeOutputs: { nodes: {}, attemptResults: {} },
    });
  }
  if (checkpoint.inputDigest !== digest) {
    throw new StudioExecutionError("STUDIO_EXEC_INPUT_CHANGED");
  }
  if (checkpoint.status === "completed") {
    const lastOutput = [...ordered]
      .reverse()
      .find((node) => node.type === "output");
    return {
      status: "succeeded",
      engine,
      outputs: checkpoint.nodeOutputs.nodes?.[lastOutput?.id]?.bindings || {},
    };
  }
  checkpoint = await checkpointStore.claim({
    runId,
    stateVersion: checkpoint.stateVersion,
    leaseOwner,
    leaseMs,
  });
  const nodeOutputs = checkpoint.nodeOutputs || {
    nodes: {},
    attemptResults: {},
  };
  nodeOutputs.nodes ||= {};
  nodeOutputs.attemptResults ||= {};
  const startIndex = ordered.findIndex(
    (node) => node.id === checkpoint.nodeCursor
  );
  if (startIndex < 0) {
    throw new StudioExecutionError("STUDIO_CHECKPOINT_INVALID");
  }
  await emitEvent(
    runStatusEvidence("started", {
      engine,
      fdeDraftId: draft.id,
      sourceIrHash: draft.sourceIrHash,
    })
  );

  try {
    for (let index = startIndex; index < ordered.length; index += 1) {
      const node = ordered[index];
      if (await isCancelled()) {
        throw new StudioExecutionError("STUDIO_RUN_CANCELLED");
      }
      checkpoint = await checkpointStore.renew({
        runId,
        stateVersion: checkpoint.stateVersion,
        leaseOwner,
        attemptToken: checkpoint.attemptToken,
        leaseMs,
      });
      await emitEvent(
        nodeEvidence("started", { nodeId: node.id, nodeType: node.type })
      );
      let result;

      if (node.type === "trigger") {
        result = { inputs: { ...inputs } };
      } else if (node.type === "retrieval") {
        const binding = resolvedBindings.dataset?.[node.dataset];
        if (!binding)
          throw new StudioExecutionError("STUDIO_RUN_BINDING_MISSING");
        const query = interpolate(node.query, {
          inputs,
          nodeOutputs,
          nodeId: node.id,
        });
        const chunks = normalizedChunks(
          await resolveDataset({
            workspace,
            binding,
            query,
            topK: node.top_k,
          })
        );
        result = {
          chunks,
          text: chunks.map((chunk) => chunk.text).join("\n\n"),
        };
        await emitEvent(
          retrievalEvidence({
            docId: binding.docId,
            chunkCount: chunks.length,
          })
        );
      } else if (node.type === "llm") {
        const prior = nodeOutputs.attemptResults[node.id];
        if (prior?.result) {
          result = prior.result;
          if (prior.costEvidence) await emitEvent(prior.costEvidence);
        } else {
          const generated = await invokeModel({
            systemPrompt: node.system_prompt || "Complete the requested task.",
            prompt: interpolate(node.prompt, {
              inputs,
              nodeOutputs,
              nodeId: node.id,
            }),
            binding: resolvedBindings.model?.[node.model],
            ...(node.output_schema ? { outputSchema: node.output_schema } : {}),
            authCtx,
          });
          if (typeof generated?.text !== "string") {
            throw new StudioExecutionError("STUDIO_EXEC_MODEL_RESULT_INVALID");
          }
          result = node.output_schema
            ? structuredModelResult(generated.text, node.output_schema, node.id)
            : { text: generated.text };
          const costEvidence = modelCostEvidence({
            provider: generated.provider || "unknown",
            model: generated.model || node.model,
            ...(generated.usage || {}),
            ...(generated.pricingSource
              ? { pricingSource: generated.pricingSource }
              : {}),
          });
          nodeOutputs.attemptResults[node.id] = {
            attemptToken: checkpoint.attemptToken,
            result: redactFdeValue(result, { maxDepth: 16 }),
            costEvidence,
          };
          checkpoint = await checkpointStore.storeAttemptResult({
            runId,
            stateVersion: checkpoint.stateVersion,
            leaseOwner,
            attemptToken: checkpoint.attemptToken,
            nodeCursor: node.id,
            nodeOutputs,
            leaseMs,
          });
          await emitEvent(costEvidence);
        }
      } else {
        const bindings = {};
        const outputTypes = new Map(
          (spec.workflow.outputs || []).map((output) => [
            output.name,
            output.type,
          ])
        );
        for (const [name, reference] of Object.entries(node.bindings)) {
          bindings[name] = resolveOutputBinding(reference, {
            outputType: outputTypes.get(name),
            inputs,
            nodeOutputs,
            nodeId: node.id,
          });
        }
        result = { bindings };
      }

      nodeOutputs.nodes[node.id] = redactFdeValue(result, { maxDepth: 32 });
      await emitEvent(
        nodeEvidence("completed", {
          nodeId: node.id,
          nodeType: node.type,
          outputPreview: result,
        })
      );
      const next = ordered[index + 1];
      checkpoint = await checkpointStore.advance({
        runId,
        stateVersion: checkpoint.stateVersion,
        leaseOwner,
        attemptToken: checkpoint.attemptToken,
        nodeCursor: next?.id || node.id,
        nodeOutputs,
        status: next ? "leased" : "completed",
        leaseMs,
      });
    }
  } catch (error) {
    try {
      await checkpointStore.fail({
        runId,
        stateVersion: checkpoint.stateVersion,
        leaseOwner,
        attemptToken: checkpoint.attemptToken,
        nodeCursor: checkpoint.nodeCursor,
        nodeOutputs,
      });
    } catch {}
    throw error;
  }

  await emitEvent(runStatusEvidence("succeeded"));
  const outputNode = [...ordered]
    .reverse()
    .find((node) => node.type === "output");
  return {
    status: "succeeded",
    engine,
    outputs: nodeOutputs.nodes[outputNode.id].bindings,
  };
}

module.exports = {
  StudioExecutionError,
  inputDigest,
  runStudioWorkflow,
  topologicalOrder,
};
