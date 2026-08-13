const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");

const SCHEMA_PATH = path.join(
  __dirname,
  "schemas",
  "studio-workflow-spec-v1.json"
);
const SUPPORTED_SCHEMA_VERSIONS = new Set(["1.0", "1.1"]);
const SUPPORTED = { target: "studio", target_version: "1" };
const SECRET_KEY_PATTERN = /(token|secret|password|api[_-]?key|authorization)/i;

class StudioWorkflowSpecError extends Error {
  constructor(code, message, path = "") {
    super(message);
    this.name = "StudioWorkflowSpecError";
    this.code = code;
    this.path = path;
  }
}

const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
  JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf-8"))
);

function assertNoSecretKeys(value, pointer = "") {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoSecretKeys(item, `${pointer}/${i}`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new StudioWorkflowSpecError(
        "STUDIO_SPEC_SECRET_KEY",
        `spec contains a secret-like key at ${pointer}/${key}`,
        `${pointer}/${key}`
      );
    }
    assertNoSecretKeys(value[key], `${pointer}/${key}`);
  }
}

function assertValidOutputSchemas(value) {
  for (const [index, node] of (value.workflow?.nodes || []).entries()) {
    if (node.type !== "llm" || node.output_schema === undefined) continue;
    try {
      const nestedValidate = new Ajv2020({
        allErrors: false,
        strict: false,
      }).compile(
        node.output_schema
      );
      if (nestedValidate.$async) throw new Error("async schema unsupported");
    } catch {
      throw new StudioWorkflowSpecError(
        "STUDIO_SPEC_SCHEMA_INVALID",
        "spec contains an invalid llm output schema",
        `/workflow/nodes/${index}/output_schema`
      );
    }
  }
}

function validateStudioWorkflowSpec(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new StudioWorkflowSpecError(
      "STUDIO_SPEC_NOT_AN_OBJECT",
      "spec must be a JSON object"
    );
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.has(value.schema_version)) {
    throw new StudioWorkflowSpecError(
      "STUDIO_SPEC_VERSION_UNSUPPORTED",
      "unsupported schema_version; this Studio build accepts 1.0 and 1.1",
      "/schema_version"
    );
  }

  for (const [field, expected] of Object.entries(SUPPORTED)) {
    if (value[field] !== expected) {
      throw new StudioWorkflowSpecError(
        "STUDIO_SPEC_VERSION_UNSUPPORTED",
        `unsupported ${field}; this Studio build only accepts ${expected}`,
        `/${field}`
      );
    }
  }

  assertNoSecretKeys(value);

  if (!validate(value)) {
    const first = validate.errors[0];
    throw new StudioWorkflowSpecError(
      "STUDIO_SPEC_SCHEMA_INVALID",
      `spec failed contract validation at ${first.instancePath || "/"}: ${first.message}`,
      first.instancePath || "/"
    );
  }

  assertValidOutputSchemas(value);

  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

module.exports = { validateStudioWorkflowSpec, StudioWorkflowSpecError };
