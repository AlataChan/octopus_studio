"use strict";

/**
 * Tests for datasetLoader.js
 * Validates dataset structure, surfaces errors, normalizes valid cases.
 */

const { loadDataset } = require("../../../../utils/agents/evals/datasetLoader");

describe("loadDataset — valid cases", () => {
  it("accepts a case with static output", () => {
    const { cases, errors } = loadDataset([
      { id: "c1", output: "hello world" },
    ]);
    expect(errors).toHaveLength(0);
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe("c1");
  });

  it("accepts a case with generate function", () => {
    const generate = jest.fn().mockResolvedValue("generated output");
    const { cases, errors } = loadDataset([
      { id: "c2", generate },
    ]);
    expect(errors).toHaveLength(0);
    expect(cases).toHaveLength(1);
    expect(cases[0].generate).toBe(generate);
  });

  it("accepts a case with both output and generate", () => {
    const generate = jest.fn().mockResolvedValue("generated");
    const { cases, errors } = loadDataset([
      { id: "c3", output: "static", generate },
    ]);
    expect(errors).toHaveLength(0);
    expect(cases).toHaveLength(1);
  });

  it("accepts a case with full optional fields", () => {
    const { cases, errors } = loadDataset([
      {
        id: "c4",
        tags: ["tag1", "tag2"],
        input: "some input",
        expected: { mustContain: ["foo"], minLength: 5 },
        output: "foo bar baz",
        thresholds: { mustContain: 0.8 },
      },
    ]);
    expect(errors).toHaveLength(0);
    expect(cases).toHaveLength(1);
  });

  it("accepts an empty dataset", () => {
    const { cases, errors } = loadDataset([]);
    expect(errors).toHaveLength(0);
    expect(cases).toHaveLength(0);
  });
});

describe("loadDataset — error cases", () => {
  it("errors when id is missing", () => {
    const { cases, errors } = loadDataset([
      { output: "no id here" },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/id/i);
    expect(cases).toHaveLength(0);
  });

  it("errors when id is empty string", () => {
    const { cases, errors } = loadDataset([
      { id: "", output: "empty id" },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/id/i);
    expect(cases).toHaveLength(0);
  });

  it("errors when neither output nor generate is provided", () => {
    const { cases, errors } = loadDataset([
      { id: "no-output" },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/output|generate/i);
    expect(cases).toHaveLength(0);
  });

  it("errors on duplicate ids", () => {
    const { cases, errors } = loadDataset([
      { id: "dup", output: "first" },
      { id: "dup", output: "second" },
    ]);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    // At least the duplicate should be in errors
    expect(errors.some((e) => e.includes("dup"))).toBe(true);
    // Only one of the two should be in cases (the first valid one)
    expect(cases).toHaveLength(1);
  });

  it("keeps valid cases even when some are invalid", () => {
    const { cases, errors } = loadDataset([
      { id: "valid1", output: "ok" },
      { output: "missing id" }, // invalid
      { id: "valid2", output: "also ok" },
      { id: "valid2", output: "duplicate" }, // duplicate id
    ]);
    // valid1 and valid2 are valid; missing id and duplicate are errors
    expect(cases.map((c) => c.id)).toContain("valid1");
    expect(cases.map((c) => c.id)).toContain("valid2");
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it("errors when id is not a string", () => {
    const { cases, errors } = loadDataset([
      { id: 123, output: "numeric id" },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/id/i);
  });
});

describe("loadDataset — normalization", () => {
  it("sets tags to [] when absent", () => {
    const { cases } = loadDataset([{ id: "t1", output: "x" }]);
    expect(cases[0].tags).toEqual([]);
  });

  it("preserves tags when present", () => {
    const { cases } = loadDataset([{ id: "t2", output: "x", tags: ["a", "b"] }]);
    expect(cases[0].tags).toEqual(["a", "b"]);
  });

  it("sets expected to {} when absent", () => {
    const { cases } = loadDataset([{ id: "t3", output: "x" }]);
    expect(cases[0].expected).toEqual({});
  });

  it("sets thresholds to {} when absent", () => {
    const { cases } = loadDataset([{ id: "t4", output: "x" }]);
    expect(cases[0].thresholds).toEqual({});
  });
});
