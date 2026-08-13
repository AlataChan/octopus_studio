const fs = require("fs");
const {
  sanitizeArtifactData,
} = require("../../../utils/fde/artifactRedaction");

describe("text artifact redaction", () => {
  it.each([
    ["text", "Bearer artifact-secret"],
    ["JSON", { benign: "sk-artifact-secret" }],
  ])("removes secret values from %s artifact bytes", (_kind, value) => {
    const body = sanitizeArtifactData(value);
    expect(body).toContain("[REDACTED]");
    expect(body).not.toContain("artifact-secret");
  });

  it("routes the Mastra writer through the sanitizer", () => {
    const modulePath = "../../../utils/workAgent/engine/mastraAdapter.js";
    const source = fs.readFileSync(require.resolve(modulePath), "utf8");
    expect(source).toContain("sanitizeArtifactData(data)");
  });
});
