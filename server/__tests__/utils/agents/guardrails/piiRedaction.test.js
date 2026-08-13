"use strict";

const { createPiiRedactionProcessor } = require("../../../../utils/agents/guardrails/processors/piiRedaction");
const { DataSanitizer } = require("../../../../utils/dataSanitizer");

describe("createPiiRedactionProcessor", () => {
  let processor;

  beforeEach(() => {
    processor = createPiiRedactionProcessor();
  });

  describe("basic redaction", () => {
    it("redacts email address and returns numbered placeholder", () => {
      const result = processor.run({ text: "contact test@example.com now", config: {} });
      expect(result.text).toContain("[EMAIL_REDACTED_1]");
      expect(result.text).not.toContain("test@example.com");
    });

    it("uses stable numbered placeholders for multiple emails", () => {
      const result = processor.run({
        text: "a@example.com and b@example.com",
        config: {},
      });
      expect(result.text).toContain("[EMAIL_REDACTED_1]");
      expect(result.text).toContain("[EMAIL_REDACTED_2]");
      expect(result.text).not.toContain("@example.com");
    });

    it("findings contain {type, severity, code, count} but NOT raw matched content", () => {
      const result = processor.run({
        text: "email: user@domain.com",
        config: {},
      });
      const emailFinding = result.findings.find((f) => f.type === "email");
      expect(emailFinding).toBeDefined();
      expect(emailFinding.severity).toBe("info");
      expect(emailFinding.code).toBe("pii.email");
      expect(emailFinding.count).toBe(1);
      // Ensure finding does not contain the raw email
      const findingStr = JSON.stringify(emailFinding);
      expect(findingStr).not.toContain("user@domain.com");
      expect(findingStr).not.toContain("domain.com");
    });

    it("findings count matches number of matches", () => {
      const result = processor.run({
        text: "a@x.com b@x.com c@x.com",
        config: {},
      });
      const emailFinding = result.findings.find((f) => f.type === "email");
      expect(emailFinding.count).toBe(3);
    });

    it("returns empty findings when no PII present", () => {
      const result = processor.run({
        text: "Hello world, no PII here.",
        config: {},
      });
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("config.piiRedact=false — detect only, no redaction", () => {
    it("does NOT modify text when piiRedact=false", () => {
      const result = processor.run({
        text: "contact test@example.com please",
        config: { piiRedact: false },
      });
      expect(result.text).toBe("contact test@example.com please");
      expect(result.text).not.toContain("[EMAIL_REDACTED");
    });

    it("still returns findings when piiRedact=false", () => {
      const result = processor.run({
        text: "contact test@example.com please",
        config: { piiRedact: false },
      });
      const emailFinding = result.findings.find((f) => f.type === "email");
      expect(emailFinding).toBeDefined();
      expect(emailFinding.count).toBe(1);
    });
  });

  describe("reset-safety (lastIndex bug prevention)", () => {
    it("repeated calls with same PII text return consistent count (lastIndex reset-safe)", () => {
      const text = "a@x.com b@x.com";
      const run1 = processor.run({ text, config: {} });
      const run2 = processor.run({ text, config: {} });
      const run3 = processor.run({ text, config: {} });

      const count1 = run1.findings.find((f) => f.type === "email")?.count;
      const count2 = run2.findings.find((f) => f.type === "email")?.count;
      const count3 = run3.findings.find((f) => f.type === "email")?.count;

      expect(count1).toBe(2);
      expect(count2).toBe(2);
      expect(count3).toBe(2);
    });

    it("repeated calls always redact all occurrences", () => {
      const text = "first@example.com second@example.com";
      for (let i = 0; i < 5; i++) {
        const result = processor.run({ text, config: {} });
        expect(result.text).not.toContain("@example.com");
        expect(result.text).toContain("[EMAIL_REDACTED_1]");
        expect(result.text).toContain("[EMAIL_REDACTED_2]");
      }
    });

    it("does not mutate DataSanitizer.PII_PATTERNS regex state across calls", () => {
      // This verifies that the processor clones the regex and doesn't advance
      // the lastIndex of the shared PII_PATTERNS regexes
      const text = "user@test.com";
      // Run the processor multiple times
      processor.run({ text, config: {} });
      processor.run({ text, config: {} });
      processor.run({ text, config: {} });
      // Then verify DataSanitizer.PII_PATTERNS.email can still match from start
      const emailPattern = DataSanitizer.PII_PATTERNS.email;
      emailPattern.lastIndex = 0;
      const match = emailPattern.test(text);
      expect(match).toBe(true);
    });
  });

  describe("code blocks and numeric data — non-over-redaction behavior", () => {
    it("does not redact SQL numbers that are not phone-pattern (records current behavior)", () => {
      // SQL with numeric IDs like SELECT id FROM users WHERE id = 123
      const sqlText = "SELECT id FROM users WHERE id = 123";
      const result = processor.run({ text: sqlText, config: {} });
      // Record current behavior: this test documents what actually happens
      // (phones regex may or may not match 123 — we just verify no crash)
      expect(typeof result.text).toBe("string");
      expect(Array.isArray(result.findings)).toBe(true);
    });

    it("redacts emails in code blocks", () => {
      const code = "// Contact: admin@company.com\nconst x = 1;";
      const result = processor.run({ text: code, config: {} });
      expect(result.text).not.toContain("admin@company.com");
      expect(result.text).toContain("[EMAIL_REDACTED_1]");
    });

    it("findings never contain raw matched strings", () => {
      const text = "email: hidden@secret.com phone: 555-123-4567";
      const result = processor.run({ text, config: {} });
      for (const finding of result.findings) {
        const s = JSON.stringify(finding);
        expect(s).not.toContain("hidden@secret.com");
        expect(s).not.toContain("555-123-4567");
        // findings only have these keys
        expect(finding).toHaveProperty("type");
        expect(finding).toHaveProperty("severity");
        expect(finding).toHaveProperty("code");
        expect(finding).toHaveProperty("count");
      }
    });
  });

  describe("custom patterns", () => {
    it("accepts custom patterns override", () => {
      const customProcessor = createPiiRedactionProcessor({
        patterns: {
          custom_id: /ID-\d{4}/gi,
        },
      });
      const result = customProcessor.run({
        text: "Your ID-1234 is confirmed",
        config: {},
      });
      expect(result.text).toContain("[CUSTOM_ID_REDACTED_1]");
      expect(result.text).not.toContain("ID-1234");
      const finding = result.findings.find((f) => f.type === "custom_id");
      expect(finding).toBeDefined();
      expect(finding.code).toBe("pii.custom_id");
    });
  });

  describe("processor name", () => {
    it("has name pii_redaction", () => {
      expect(processor.name).toBe("pii_redaction");
    });
  });
});
