const SPEC = {
  schema_version: "1.0",
  target: "studio",
  target_version: "1",
  source_ir_version: "0.3",
  source_ir_hash: "b".repeat(64),
  workflow: {
    name: "Cross-Border Support Follow-up Message Draft",
    description: "Draft a non-medical appointment follow-up message.",
    inputs: [
      { name: "patient_alias", type: "string", required: true },
      { name: "visit_note", type: "string", required: true },
    ],
    outputs: [{ name: "followup_message", type: "string", required: false }],
    nodes: [
      { id: "start", type: "trigger", mode: "manual" },
      {
        id: "policy",
        type: "retrieval",
        dataset: "clinic_policy_kb",
        query: "${input.visit_note}",
        top_k: 5,
      },
      {
        id: "draft",
        type: "llm",
        model: "default-chat-model",
        system_prompt:
          "You draft clinic follow-up messages. No medical advice.",
        prompt: "Policy: ${policy.text}\nNote: ${input.visit_note}\nDraft it.",
      },
      {
        id: "out",
        type: "output",
        bindings: { followup_message: "${draft.text}" },
      },
    ],
    edges: [
      { from: "start", to: "policy" },
      { from: "policy", to: "draft" },
      { from: "draft", to: "out" },
    ],
    required_bindings: [
      { kind: "dataset", handle: "clinic_policy_kb", required: true },
      { kind: "model", handle: "default-chat-model", required: true },
    ],
  },
  diagnostics: { warnings: [], unsupported_features: [] },
};

function validSpec() {
  return JSON.parse(JSON.stringify(SPEC));
}

function fullBindings() {
  return {
    model: { "default-chat-model": "model-123" },
    dataset: { clinic_policy_kb: "dataset-456" },
  };
}

module.exports = { validSpec, fullBindings };
