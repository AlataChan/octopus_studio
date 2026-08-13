"use strict";

const { createModerationProcessor } = require("../../../../utils/agents/guardrails/processors/moderation");

describe("createModerationProcessor", () => {
  describe("processor metadata", () => {
    it("has name moderation", () => {
      const processor = createModerationProcessor();
      expect(processor.name).toBe("moderation");
    });
  });

  describe("default no-op behavior", () => {
    it("returns no findings and no block for benign text with no config", async () => {
      const processor = createModerationProcessor();
      const result = await processor.run({ text: "Hello, how are you?", config: {} });
      expect(result.findings).toHaveLength(0);
      expect(result.blocked).toBe(false);
    });

    it("never blocks (blocked always false)", async () => {
      const processor = createModerationProcessor({ blocklist: ["badword"] });
      const result = await processor.run({ text: "this contains badword", config: {} });
      expect(result.blocked).toBe(false);
    });

    it("does not modify text", async () => {
      const processor = createModerationProcessor();
      const text = "some content here";
      const result = await processor.run({ text, config: {} });
      expect(result.text).toBe(text);
    });
  });

  describe("constructor blocklist", () => {
    it("flags text containing a blocklisted word", async () => {
      const processor = createModerationProcessor({ blocklist: ["violence"] });
      const result = await processor.run({ text: "contains violence here", config: {} });
      const finding = result.findings.find((f) => f.code === "mod.blocklist");
      expect(finding).toBeDefined();
      expect(finding.type).toBe("moderation");
      expect(finding.severity).toBe("medium");
    });

    it("is case-insensitive for blocklist matching", async () => {
      const processor = createModerationProcessor({ blocklist: ["BadWord"] });
      const result = await processor.run({ text: "this has badword in it", config: {} });
      const finding = result.findings.find((f) => f.code === "mod.blocklist");
      expect(finding).toBeDefined();
    });

    it("returns no finding when blocklist word not present", async () => {
      const processor = createModerationProcessor({ blocklist: ["forbidden"] });
      const result = await processor.run({ text: "perfectly fine text", config: {} });
      expect(result.findings).toHaveLength(0);
    });

    it("flags multiple blocklist words (count=1 per occurrence)", async () => {
      const processor = createModerationProcessor({ blocklist: ["spam", "danger"] });
      const result = await processor.run({
        text: "this is spam and danger combined",
        config: {},
      });
      const findings = result.findings.filter((f) => f.code === "mod.blocklist");
      expect(findings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("config.blocklist overrides constructor blocklist", () => {
    it("uses config.blocklist when provided", async () => {
      const processor = createModerationProcessor({ blocklist: ["constructor_word"] });
      const result = await processor.run({
        text: "contains config_word here",
        config: { blocklist: ["config_word"] },
      });
      const finding = result.findings.find((f) => f.code === "mod.blocklist");
      expect(finding).toBeDefined();
    });

    it("does not use constructor blocklist when config.blocklist provided", async () => {
      const processor = createModerationProcessor({ blocklist: ["constructor_word"] });
      const result = await processor.run({
        text: "contains constructor_word but not config word",
        config: { blocklist: ["other_word"] },
      });
      // constructor_word should NOT trigger since config.blocklist overrides
      const finding = result.findings.find((f) => f.code === "mod.blocklist");
      expect(finding).toBeUndefined();
    });
  });

  describe("moderateFn injection", () => {
    it("calls moderateFn and adds finding when flagged=true", async () => {
      const moderateFn = jest.fn().mockResolvedValue({ flagged: true, severity: "high" });
      const processor = createModerationProcessor({ moderateFn });
      const result = await processor.run({ text: "some text", config: {} });
      expect(moderateFn).toHaveBeenCalledWith("some text");
      const finding = result.findings.find((f) => f.code === "mod.llm");
      expect(finding).toBeDefined();
      expect(finding.type).toBe("moderation");
      expect(finding.severity).toBe("high");
    });

    it("does not add finding when moderateFn returns flagged=false", async () => {
      const moderateFn = jest.fn().mockResolvedValue({ flagged: false });
      const processor = createModerationProcessor({ moderateFn });
      const result = await processor.run({ text: "clean text", config: {} });
      const finding = result.findings.find((f) => f.code === "mod.llm");
      expect(finding).toBeUndefined();
    });

    it("uses default severity medium when moderateFn doesn't provide severity", async () => {
      const moderateFn = jest.fn().mockResolvedValue({ flagged: true });
      const processor = createModerationProcessor({ moderateFn });
      const result = await processor.run({ text: "text", config: {} });
      const finding = result.findings.find((f) => f.code === "mod.llm");
      expect(finding.severity).toBe("medium");
    });

    it("moderateFn and blocklist can both fire", async () => {
      const moderateFn = jest.fn().mockResolvedValue({ flagged: true });
      const processor = createModerationProcessor({
        moderateFn,
        blocklist: ["bad"],
      });
      const result = await processor.run({ text: "bad text here", config: {} });
      const blocklistFinding = result.findings.find((f) => f.code === "mod.blocklist");
      const llmFinding = result.findings.find((f) => f.code === "mod.llm");
      expect(blocklistFinding).toBeDefined();
      expect(llmFinding).toBeDefined();
    });

    it("does not crash without moderateFn (null)", async () => {
      const processor = createModerationProcessor({ moderateFn: null });
      const result = await processor.run({ text: "text", config: {} });
      expect(result.findings).toBeDefined();
    });
  });

  describe("findings structure", () => {
    it("blocklist finding has correct shape", async () => {
      const processor = createModerationProcessor({ blocklist: ["test"] });
      const result = await processor.run({ text: "test content", config: {} });
      const finding = result.findings.find((f) => f.code === "mod.blocklist");
      expect(finding).toMatchObject({
        type: "moderation",
        severity: "medium",
        code: "mod.blocklist",
        count: 1,
      });
    });
  });
});
