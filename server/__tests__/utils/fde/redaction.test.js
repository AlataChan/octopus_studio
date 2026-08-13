const {
  MAX_PREVIEW_CHARS,
  redactFdeText,
  redactFdeValue,
  previewFdeValue,
} = require("../../../utils/fde/redaction");

describe("FDE redaction boundary", () => {
  it.each(["description", "prompt"])(
    "redacts a bearer token stored under the benign key %s",
    (key) => {
      const output = redactFdeValue({ [key]: "Bearer abc.def.secret" });
      expect(output[key]).toBe("Bearer [REDACTED]");
      expect(JSON.stringify(output)).not.toContain("abc.def.secret");
    }
  );

  it("redacts provider tokens in model output", () => {
    const output = redactFdeValue({ text: "accidentally printed sk-abcdefgh123456" });
    expect(output).toEqual({ text: "accidentally printed [REDACTED]" });
  });

  it("redacts assignment-form secrets in error details", () => {
    const output = redactFdeText(
      "request failed: api_token=super-secret-value password: hunter2"
    );
    expect(output).toBe(
      "request failed: api_token=[REDACTED] password=[REDACTED]"
    );
  });

  it("caps persisted previews after redaction", () => {
    const output = previewFdeValue({ note: `Bearer token-value ${"病历".repeat(3000)}` });
    expect(output.length).toBeLessThanOrEqual(MAX_PREVIEW_CHARS);
    expect(output).not.toContain("token-value");
  });

  it("is recursion-depth bounded", () => {
    let value = { leaf: "safe" };
    for (let index = 0; index < 20; index += 1) value = { child: value };
    expect(JSON.stringify(redactFdeValue(value))).toContain("[TRUNCATED:DEPTH]");
  });

  it("is cycle safe", () => {
    const value = { note: "clinical text" };
    value.self = value;
    expect(redactFdeValue(value)).toEqual({
      note: "clinical text",
      self: "[TRUNCATED:CYCLE]",
    });
  });

  it("does not mutate the source value", () => {
    const input = { nested: { prompt: "Bearer token-value" } };
    redactFdeValue(input);
    expect(input.nested.prompt).toBe("Bearer token-value");
  });
});
