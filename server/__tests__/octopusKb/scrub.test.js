describe("octopus-kb memory scrubber", () => {
  it("redacts common free-text secrets and basic PII before persistence", () => {
    const { scrubSensitiveText } = require("../../utils/octopusKb/scrub");

    const scrubbed = scrubSensitiveText(`
      Contact alice@example.com with token sk-1234567890abcdef1234567890.
      Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature
      api_key = live-secret-value
      password: hunter2
    `);

    expect(scrubbed).not.toContain("alice@example.com");
    expect(scrubbed).not.toContain("sk-1234567890abcdef1234567890");
    expect(scrubbed).not.toContain("eyJhbGciOiJIUzI1Ni");
    expect(scrubbed).not.toContain("live-secret-value");
    expect(scrubbed).not.toContain("hunter2");
    expect(scrubbed).toContain("[REDACTED_EMAIL]");
    expect(scrubbed).toContain("[REDACTED_SECRET]");
  });

  it("handles non-string values defensively", () => {
    const { scrubSensitiveText } = require("../../utils/octopusKb/scrub");

    expect(scrubSensitiveText(null)).toBe("");
    expect(scrubSensitiveText(42)).toBe("42");
  });
});
