"use strict";

const {
  compressToolResult,
  estimateTokens,
  COMPRESSION_CONFIG,
} = require("../observationMasking");

describe("compressToolResult maxResultTokens", () => {
  const long = "word ".repeat(5000);
  const originalLogLevel = COMPRESSION_CONFIG.logLevel;

  beforeAll(() => {
    COMPRESSION_CONFIG.logLevel = "none";
  });

  afterAll(() => {
    COMPRESSION_CONFIG.logLevel = originalLogLevel;
  });

  it("no option -> unchanged contract {compressed}", () => {
    expect(compressToolResult("t", long)).toHaveProperty("compressed");
  });

  it("with maxResultTokens -> compressed fits within limit (note included in budget)", () => {
    const out = compressToolResult("t", long, { maxResultTokens: 100 });
    const text =
      typeof out.compressed === "string"
        ? out.compressed
        : JSON.stringify(out.compressed);

    expect(estimateTokens(text)).toBeLessThanOrEqual(100);
    expect(out.stats.compressedTokens).toBeLessThanOrEqual(100);
    expect(out.stats.compressedLength).toBe(text.length);
  });

  it("numeric string maxResultTokens is allowed", () => {
    const out = compressToolResult("t", long, { maxResultTokens: "100" });

    expect(estimateTokens(out.compressed)).toBeLessThanOrEqual(100);
  });

  it("invalid maxResultTokens (0/negative/NaN/non-numeric/null) -> ignored = current behavior", () => {
    const base = compressToolResult("t", long).compressed;

    for (const bad of [0, -5, NaN, "abc", null]) {
      const out = compressToolResult("t", long, { maxResultTokens: bad });
      expect(out.compressed).toEqual(base);
    }
  });

  it("applies cap even on skip path (below minChars / short)", () => {
    const short = "x ".repeat(40);
    const out = compressToolResult("t", short, { maxResultTokens: 5 });

    expect(out.stats.skipped).toBe(true);
    expect(estimateTokens(out.compressed)).toBeLessThanOrEqual(5);
  });

  it("tiny cap returns hard-truncated prefix within budget", () => {
    const out = compressToolResult("t", long, { maxResultTokens: 1 });

    expect(estimateTokens(out.compressed)).toBeLessThanOrEqual(1);
    expect(out.compressed).not.toContain("[truncated");
  });
});
