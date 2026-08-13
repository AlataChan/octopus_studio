const {
  validateStudioWorkflowSpec,
  StudioWorkflowSpecError,
} = require("../../../utils/fde/studioWorkflowSpec");
const { validSpec } = require("./studioSpecFixture");

describe("validateStudioWorkflowSpec", () => {
  it("returns a normalized deep clone for a valid spec", () => {
    const result = validateStudioWorkflowSpec(validSpec());
    expect(result).toEqual(validSpec());
    expect(result).not.toBe(validSpec());
  });

  it("returns a frozen object", () => {
    const result = validateStudioWorkflowSpec(validSpec());
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each(["1.0", "1.1"])("accepts additive schema version %s", (version) => {
    const spec = validSpec();
    spec.schema_version = version;
    if (version === "1.1") {
      spec.workflow.nodes[2].output_schema = {
        type: "object",
        required: ["answer"],
        properties: { answer: { type: "string" } },
      };
    }
    expect(validateStudioWorkflowSpec(spec).schema_version).toBe(version);
  });

  it("rejects an invalid nested output schema before execution", () => {
    const spec = validSpec();
    spec.schema_version = "1.1";
    spec.workflow.nodes[2].output_schema = {
      type: "not-a-json-schema-type",
    };
    expect(() => validateStudioWorkflowSpec(spec)).toThrow(
      expect.objectContaining({ code: "STUDIO_SPEC_SCHEMA_INVALID" })
    );
  });

  it("rejects async output schemas that cannot be checked synchronously", () => {
    const spec = validSpec();
    spec.schema_version = "1.1";
    spec.workflow.nodes[2].output_schema = {
      $async: true,
      type: "object",
    };
    expect(() => validateStudioWorkflowSpec(spec)).toThrow(
      expect.objectContaining({ code: "STUDIO_SPEC_SCHEMA_INVALID" })
    );
  });

  it("throws a typed error with a JSON-pointer path on a schema violation", () => {
    const spec = validSpec();
    delete spec.workflow.nodes[2].model;
    expect(() => validateStudioWorkflowSpec(spec)).toThrow(
      StudioWorkflowSpecError
    );
    try {
      validateStudioWorkflowSpec(spec);
    } catch (e) {
      expect(e.code).toBe("STUDIO_SPEC_SCHEMA_INVALID");
      expect(e.path).toMatch(/^\/workflow\/nodes\/2/);
    }
  });

  it.each([
    ["token", "token"],
    ["uppercase", "API_KEY"],
    ["mixed case", "Authorization"],
    ["embedded", "db_password_hint"],
    ["secret", "clientSecret"],
  ])("rejects secret-like key (%s)", (_label, key) => {
    const spec = validSpec();
    spec.workflow.nodes[2][key] = "leaked";
    expect(() => validateStudioWorkflowSpec(spec)).toThrow(
      StudioWorkflowSpecError
    );
  });

  it("uses a dedicated code for secret-like keys", () => {
    const spec = validSpec();
    spec.workflow.name = "x";
    spec.diagnostics.api_key = "leaked";
    try {
      validateStudioWorkflowSpec(spec);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.code).toBe("STUDIO_SPEC_SECRET_KEY");
    }
  });

  it("never includes the rejected value in the message", () => {
    const spec = validSpec();
    spec.workflow.nodes[2].api_key = "super-secret-value-xyz";
    try {
      validateStudioWorkflowSpec(spec);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.message).not.toContain("super-secret-value-xyz");
      expect(JSON.stringify(e)).not.toContain("super-secret-value-xyz");
    }
  });

  it.each([
    ["schema_version", "1.2", "STUDIO_SPEC_VERSION_UNSUPPORTED"],
    ["target_version", "2", "STUDIO_SPEC_VERSION_UNSUPPORTED"],
    ["target", "dify", "STUDIO_SPEC_VERSION_UNSUPPORTED"],
  ])("rejects %s=%s before schema validation", (field, value, code) => {
    const spec = validSpec();
    spec[field] = value;
    try {
      validateStudioWorkflowSpec(spec);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.code).toBe(code);
    }
  });

  it.each([null, undefined, "a string", 42, []])(
    "rejects non-object input %p",
    (value) => {
      expect(() => validateStudioWorkflowSpec(value)).toThrow(
        StudioWorkflowSpecError
      );
    }
  );
});
