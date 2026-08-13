const { previewFdeValue, redactFdeValue } = require("./redaction");

const NODE_PHASES = new Set(["started", "completed"]);
const RUN_PHASES = new Set(["started", "succeeded", "failed", "cancelled"]);
const APPROVAL_PHASES = new Set(["requested", "resolved"]);

function failClosed(allowed, phase) {
  if (!allowed.has(phase)) throw new Error("FDE_EVIDENCE_PHASE_INVALID");
}

function runStatusEvidence(phase, payload = {}) {
  failClosed(RUN_PHASES, phase);
  return {
    type: `status.${phase}`,
    payload: redactFdeValue(payload),
  };
}

function nodeEvidence(phase, payload = {}) {
  failClosed(NODE_PHASES, phase);
  const safe = redactFdeValue(payload);
  if (Object.prototype.hasOwnProperty.call(safe, "outputPreview")) {
    safe.outputPreview = previewFdeValue(safe.outputPreview, 200);
  }
  return { type: `step.${phase}`, payload: safe };
}

function retrievalEvidence({ docId, chunkCount }) {
  return {
    type: "tool.result",
    payload: { tool: "retrieval", docId, chunkCount },
  };
}

function modelCostEvidence(payload) {
  const allowed = [
    "provider",
    "model",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "costUsd",
    "pricingSource",
  ];
  const safe = redactFdeValue(payload);
  return {
    type: "cost.updated",
    payload: Object.fromEntries(
      allowed
        .filter((key) => safe[key] !== undefined)
        .map((key) => [key, safe[key]])
    ),
  };
}

function approvalEvidence(phase, payload = {}) {
  failClosed(APPROVAL_PHASES, phase);
  return {
    type: `approval.${phase}`,
    payload: redactFdeValue(payload),
  };
}

function artifactEvidence(payload = {}) {
  return { type: "artifact.created", payload: redactFdeValue(payload) };
}

module.exports = {
  approvalEvidence,
  artifactEvidence,
  modelCostEvidence,
  nodeEvidence,
  retrievalEvidence,
  runStatusEvidence,
};
