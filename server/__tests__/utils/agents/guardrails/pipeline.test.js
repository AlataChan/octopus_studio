"use strict";

const { createGuardrailPipeline } = require("../../../../utils/agents/guardrails/pipeline");

describe("createGuardrailPipeline", () => {
  // Minimal no-op processor
  const echo = {
    name: "echo",
    run: async ({ text }) => ({ text, findings: [] }),
  };

  // Processor that appends to text
  const appender = (suffix) => ({
    name: `appender_${suffix}`,
    run: async ({ text }) => ({ text: text + suffix, findings: [] }),
  });

  // Processor that adds a finding
  const finder = (finding) => ({
    name: "finder",
    run: async ({ text }) => ({ text, findings: [finding] }),
  });

  // Processor that blocks
  const blocker = {
    name: "blocker",
    run: async ({ text }) => ({ text, findings: [], blocked: true }),
  };

  it("runInput returns text, findings array, blocked false for empty processors", async () => {
    const pipeline = createGuardrailPipeline({});
    const result = await pipeline.runInput("hello", {});
    expect(result.text).toBe("hello");
    expect(result.findings).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it("runOutput returns text, findings array, blocked false for empty processors", async () => {
    const pipeline = createGuardrailPipeline({});
    const result = await pipeline.runOutput("world", {});
    expect(result.text).toBe("world");
    expect(result.findings).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it("processes text through multiple input processors in order", async () => {
    const pipeline = createGuardrailPipeline({
      inputProcessors: [appender("_A"), appender("_B"), appender("_C")],
    });
    const result = await pipeline.runInput("start", {});
    expect(result.text).toBe("start_A_B_C");
  });

  it("processes text through multiple output processors in order", async () => {
    const pipeline = createGuardrailPipeline({
      outputProcessors: [appender("_X"), appender("_Y")],
    });
    const result = await pipeline.runOutput("base", {});
    expect(result.text).toBe("base_X_Y");
  });

  it("accumulates findings from multiple processors with processor name attached", async () => {
    const f1 = { type: "pii", severity: "info", code: "pii.email", count: 1 };
    const f2 = { type: "injection", severity: "high", code: "inj.ignore_prev", count: 1 };
    const pipeline = createGuardrailPipeline({
      inputProcessors: [finder(f1), finder(f2)],
    });
    const result = await pipeline.runInput("some text", {});
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toMatchObject({ ...f1, processor: "finder" });
    expect(result.findings[1]).toMatchObject({ ...f2, processor: "finder" });
  });

  it("blocked propagates: if any processor returns blocked=true, result is blocked", async () => {
    const pipeline = createGuardrailPipeline({
      inputProcessors: [echo, blocker, echo],
    });
    const result = await pipeline.runInput("text", {});
    expect(result.blocked).toBe(true);
  });

  it("blocked=false when no processor blocks", async () => {
    const pipeline = createGuardrailPipeline({
      inputProcessors: [echo, echo],
    });
    const result = await pipeline.runInput("text", {});
    expect(result.blocked).toBe(false);
  });

  it("modified text from one processor passes to next (redacted text flows through)", async () => {
    const redactor = {
      name: "redactor",
      run: async ({ text }) => ({ text: text.replace("secret", "[REDACTED]"), findings: [] }),
    };
    const uppercaser = {
      name: "uppercaser",
      run: async ({ text }) => ({ text: text.toUpperCase(), findings: [] }),
    };
    const pipeline = createGuardrailPipeline({
      inputProcessors: [redactor, uppercaser],
    });
    const result = await pipeline.runInput("my secret here", {});
    expect(result.text).toBe("MY [REDACTED] HERE");
  });

  it("config is passed to each processor", async () => {
    const configCapturer = {
      name: "config_capturer",
      run: jest.fn(({ text, config }) => ({ text, findings: [] })),
    };
    const cfg = { piiRedact: false, injectionBlock: true };
    const pipeline = createGuardrailPipeline({
      inputProcessors: [configCapturer],
      config: cfg,
    });
    await pipeline.runInput("text", {});
    expect(configCapturer.run).toHaveBeenCalledWith(
      expect.objectContaining({ config: cfg })
    );
  });

  it("handles null/undefined text gracefully", async () => {
    const pipeline = createGuardrailPipeline({ inputProcessors: [echo] });
    const r1 = await pipeline.runInput(null, {});
    const r2 = await pipeline.runInput(undefined, {});
    expect(typeof r1.text).toBe("string");
    expect(typeof r2.text).toBe("string");
  });

  it("input and output processors are independent", async () => {
    const pipeline = createGuardrailPipeline({
      inputProcessors: [appender("_INPUT")],
      outputProcessors: [appender("_OUTPUT")],
    });
    const inResult = await pipeline.runInput("x", {});
    const outResult = await pipeline.runOutput("x", {});
    expect(inResult.text).toBe("x_INPUT");
    expect(outResult.text).toBe("x_OUTPUT");
  });
});
