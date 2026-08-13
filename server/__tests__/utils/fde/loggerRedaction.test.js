const { redactLogArgs } = require("../../../utils/logger");

describe("FDE logger redaction facade", () => {
  it("redacts tokens in strings, objects, and errors before formatting", () => {
    const output = redactLogArgs([
      "Bearer log-secret",
      { benign: "sk-object-secret" },
      new Error("OPENAI_API_KEY=error-secret"),
    ]);
    expect(output).toContain("[REDACTED]");
    expect(output).not.toMatch(/log-secret|object-secret|error-secret/);
  });
});
