const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Ajv2020 = require("ajv/dist/2020");

const SCHEMA_DIR = path.join(__dirname, "../../../utils/fde/schemas");
const SCHEMA_PATH = path.join(SCHEMA_DIR, "studio-workflow-spec-v1.json");
const DIGEST_PATH = path.join(SCHEMA_DIR, "studio-workflow-spec-v1.sha256");

const validSpec = {
  schema_version: "1.0",
  target: "studio",
  target_version: "1",
  source_ir_version: "0.3",
  source_ir_hash: "a".repeat(64),
  workflow: {
    name: "Cross-Border Support Follow-up Message Draft",
    description: "Draft a non-medical appointment follow-up message.",
    inputs: [{ name: "visit_note", type: "string", required: true }],
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
        prompt: "Draft it.",
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

function compile() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf-8")));
}

describe("StudioWorkflowSpec v1 pinned schema", () => {
  it("accepts the reference spec", () => {
    const validate = compile();
    expect(validate(validSpec)).toBe(true);
  });

  it("accepts a v1.1 llm structured-output schema", () => {
    const spec = JSON.parse(JSON.stringify(validSpec));
    spec.schema_version = "1.1";
    spec.workflow.nodes[2].output_schema = {
      type: "object",
      required: ["answer"],
      properties: { answer: { type: "string" } },
    };
    expect(compile()(spec)).toBe(true);
  });

  it("rejects a structured-output field mislabeled as schema 1.0", () => {
    const spec = JSON.parse(JSON.stringify(validSpec));
    spec.workflow.nodes[2].output_schema = { type: "object" };
    expect(compile()(spec)).toBe(false);
  });

  it("rejects an unknown top-level field", () => {
    const validate = compile();
    expect(validate({ ...validSpec, secret: "nope" })).toBe(false);
  });

  it("rejects llm fields smuggled onto a trigger node", () => {
    const spec = JSON.parse(JSON.stringify(validSpec));
    spec.workflow.nodes[0].model = "sneaky";
    expect(compile()(spec)).toBe(false);
  });

  it("rejects a mismatched schema version", () => {
    const validate = compile();
    expect(validate({ ...validSpec, schema_version: "2.0" })).toBe(false);
  });

  it("rejects a mismatched target version", () => {
    const validate = compile();
    expect(validate({ ...validSpec, target_version: "2" })).toBe(false);
  });

  it("matches the checked-in digest from the FDE source", () => {
    const actual = crypto
      .createHash("sha256")
      .update(fs.readFileSync(SCHEMA_PATH))
      .digest("hex");
    expect(fs.readFileSync(DIGEST_PATH, "utf-8").trim()).toBe(actual);
  });
});
