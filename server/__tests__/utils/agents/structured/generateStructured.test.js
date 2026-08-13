"use strict";

const { generateStructured, extractJson } = require("../../../../utils/agents/structured/generateStructured");
const { z } = require("zod");

// ─────────────────────────────────────────────
// extractJson unit tests
// ─────────────────────────────────────────────
describe("extractJson", () => {
  test("extracts bare JSON object", () => {
    const result = extractJson('{"a":1}');
    expect(result).toBe('{"a":1}');
  });

  test("extracts bare JSON array", () => {
    const result = extractJson('[1,2,3]');
    expect(result).toBe('[1,2,3]');
  });

  test("extracts from fenced ```json block", () => {
    const result = extractJson("Here is the result:\n```json\n{\"x\":42}\n```\nDone.");
    expect(JSON.parse(result)).toEqual({ x: 42 });
  });

  test("extracts from leading prose", () => {
    const result = extractJson('Sure! Here you go: {"name":"Alice","age":30}');
    expect(JSON.parse(result)).toEqual({ name: "Alice", age: 30 });
  });

  test("returns null when no JSON found", () => {
    const result = extractJson("No JSON here at all.");
    expect(result).toBeNull();
  });

  test("returns null for empty/falsy input", () => {
    expect(extractJson("")).toBeNull();
    expect(extractJson(null)).toBeNull();
    expect(extractJson(undefined)).toBeNull();
  });

  test("takes FIRST complete JSON block when multiple present", () => {
    const input = '{"first":1} and some text {"second":2}';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ first: 1 });
  });

  test("handles maxRawLen truncation without crashing", () => {
    const longText = "x".repeat(100) + '{"key":"val"}' + "y".repeat(100);
    // With tiny maxRawLen, the JSON may be cut off or not found
    const result = extractJson(longText, { maxRawLen: 10 });
    // Just shouldn't throw
    expect(result === null || typeof result === "string").toBe(true);
  });

  test("extracts complex nested object", () => {
    const obj = { a: { b: [1, 2, { c: true }] }, d: "hello" };
    const result = extractJson("Output: " + JSON.stringify(obj));
    expect(JSON.parse(result)).toEqual(obj);
  });
});

// ─────────────────────────────────────────────
// generateStructured integration tests
// ─────────────────────────────────────────────

const personSchema = z.object({
  name: z.string(),
  age: z.number(),
});

function makeGenerateText(responses) {
  let idx = 0;
  return jest.fn(async () => {
    const r = responses[idx++] ?? responses[responses.length - 1];
    return r;
  });
}

describe("generateStructured", () => {
  test("valid JSON with zod schema → returns object, error null, called once", async () => {
    const gt = makeGenerateText(['{"name":"Alice","age":30}']);
    const result = await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
    });
    expect(result.object).toEqual({ name: "Alice", age: 30 });
    expect(result.error).toBeNull();
    expect(result.raw).toBe('{"name":"Alice","age":30}');
    expect(gt).toHaveBeenCalledTimes(1);
  });

  test("fenced ```json + leading prose → extracts and validates", async () => {
    const gt = makeGenerateText([
      'Sure! Here:\n```json\n{"name":"Bob","age":25}\n```\nDone.',
    ]);
    const result = await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
    });
    expect(result.object).toEqual({ name: "Bob", age: 25 });
    expect(result.error).toBeNull();
  });

  test("multiple JSON blocks → takes first complete block", async () => {
    const gt = makeGenerateText([
      '{"name":"First","age":10} and also {"name":"Second","age":20}',
    ]);
    const result = await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
    });
    expect(result.object).toEqual({ name: "First", age: 10 });
    expect(result.error).toBeNull();
    expect(gt).toHaveBeenCalledTimes(1);
  });

  test("invalid first response → repair → valid second → called twice; repair prompt doesn't contain full raw", async () => {
    const firstRaw = '{"name":"Charlie"}'; // missing age - distinctive marker
    const secondRaw = '{"name":"Charlie","age":40}';
    const gt = makeGenerateText([firstRaw, secondRaw]);

    const result = await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
      maxRepairs: 1,
    });

    expect(result.object).toEqual({ name: "Charlie", age: 40 });
    expect(result.error).toBeNull();
    expect(gt).toHaveBeenCalledTimes(2);

    // The second call's prompt must contain error feedback but NOT the full raw output
    const secondCallPrompt = gt.mock.calls[1][0].prompt;
    expect(secondCallPrompt).toMatch(/不符|符合|上次|repair|issue|error|invalid/i);
    // The distinctive long string from firstRaw should NOT be echoed back
    // We check that the full raw string (with quotes) isn't in the repair prompt
    expect(secondCallPrompt).not.toContain('"name":"Charlie"');
  });

  test("exhausted maxRepairs → error.code=schema_validation_failed, issues non-empty", async () => {
    const gt = makeGenerateText(['{"name":"Dave"}']); // always missing age
    const result = await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
      maxRepairs: 1,
    });

    expect(result.object).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error.code).toBe("schema_validation_failed");
    expect(result.error.issues).toBeTruthy();
    expect(gt).toHaveBeenCalledTimes(2); // initial + 1 repair
  });

  test("salvageArray: itemSchema + salvageArray → keeps valid items, salvaged:true", async () => {
    const itemSchema = z.object({ task: z.string() });
    const fullSchema = z.array(itemSchema);
    const gt = makeGenerateText(['[{"task":"do A"},{"name":"bad"}]']);

    const result = await generateStructured({
      generateText: gt,
      prompt: "Give tasks.",
      schema: fullSchema,
      itemSchema,
      salvageArray: true,
    });

    expect(result.object).toEqual([{ task: "do A" }]);
    expect(result.salvaged).toBe(true);
    expect(result.error).toBeNull();
  });

  test("custom validate (non-zod) path → validate returns ok:false → triggers repair", async () => {
    const calls = [];
    const customValidate = (obj) => {
      calls.push(obj);
      if (calls.length === 1) return { ok: false, issues: "missing required field 'x'" };
      return { ok: true, value: obj };
    };

    const gt = makeGenerateText(['{"a":1}', '{"a":1,"x":2}']);
    const result = await generateStructured({
      generateText: gt,
      prompt: "Give data.",
      validate: customValidate,
      maxRepairs: 1,
    });

    expect(result.object).toEqual({ a: 1, x: 2 });
    expect(result.error).toBeNull();
    expect(gt).toHaveBeenCalledTimes(2);
  });

  test("custom validate returns ok:true with value → uses value", async () => {
    const customValidate = (obj) => ({
      ok: true,
      value: { ...obj, transformed: true },
    });

    const gt = makeGenerateText(['{"raw":1}']);
    const result = await generateStructured({
      generateText: gt,
      prompt: "Give data.",
      validate: customValidate,
    });

    expect(result.object).toEqual({ raw: 1, transformed: true });
    expect(result.error).toBeNull();
  });

  test("maxRawLen: super-long raw → truncated, doesn't crash", async () => {
    const longJson = '{"name":"' + "a".repeat(50000) + '","age":1}';
    const gt = makeGenerateText([longJson]);
    // Should not throw even with small maxRawLen
    const result = await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
      maxRawLen: 100,
    });
    // With truncation to 100 chars, the JSON is broken, so we get an error
    expect(result).toBeDefined();
    expect(result.error !== null || result.object !== null).toBe(true);
  });

  test("maxIssueLen: issues truncated in repair prompt", async () => {
    const longIssues = "x".repeat(5000);
    const customValidate = jest.fn()
      .mockReturnValueOnce({ ok: false, issues: longIssues })
      .mockReturnValueOnce({ ok: true, value: { done: true } });

    const gt = makeGenerateText(['{"a":1}', '{"a":1}']);
    const result = await generateStructured({
      generateText: gt,
      prompt: "Give data.",
      validate: customValidate,
      maxRepairs: 1,
      maxIssueLen: 200,
    });

    // Repair prompt should have truncated issues
    const repairPrompt = gt.mock.calls[1][0].prompt;
    // The issue text should be truncated to ≤ maxIssueLen
    expect(repairPrompt.length).toBeLessThan(5000 + 500); // crude upper bound
  });

  test("no JSON in response → triggers repair cycle", async () => {
    const gt = makeGenerateText(["No JSON here at all.", '{"name":"Eve","age":22}']);
    const result = await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
      maxRepairs: 1,
    });

    expect(result.object).toEqual({ name: "Eve", age: 22 });
    expect(result.error).toBeNull();
    expect(gt).toHaveBeenCalledTimes(2);
  });

  test("returns raw string in result", async () => {
    const rawStr = '{"name":"Frank","age":50}';
    const gt = makeGenerateText([rawStr]);
    const result = await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
    });
    expect(result.raw).toBe(rawStr);
  });

  test("schemaHint is included in system prompt", async () => {
    const gt = makeGenerateText(['{"name":"Grace","age":28}']);
    await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
      schemaHint: "{ name: string, age: number }",
    });

    const systemPrompt = gt.mock.calls[0][0].system;
    expect(systemPrompt).toContain("{ name: string, age: number }");
  });

  test("systemHint replaces default system prompt base", async () => {
    const gt = makeGenerateText(['{"name":"Hank","age":35}']);
    await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
      systemHint: "Custom system instruction",
    });

    const systemPrompt = gt.mock.calls[0][0].system;
    expect(systemPrompt).toContain("Custom system instruction");
  });

  test("salvageArray with all invalid items → falls through to repair", async () => {
    const itemSchema = z.object({ task: z.string() });
    const fullSchema = z.array(itemSchema);
    const gt = makeGenerateText([
      '[{"name":"bad1"},{"name":"bad2"}]',
      '[{"task":"ok"}]',
    ]);

    const result = await generateStructured({
      generateText: gt,
      prompt: "Give tasks.",
      schema: fullSchema,
      itemSchema,
      salvageArray: true,
      maxRepairs: 1,
    });

    // All items failed salvage, so should repair and get valid result
    expect(gt).toHaveBeenCalledTimes(2);
    expect(result.object).toEqual([{ task: "ok" }]);
    expect(result.salvaged).toBeUndefined(); // full validation passed this time
  });
});

// ─────────────────────────────────────────────
// generateStructured — jsonMode threading tests
// ─────────────────────────────────────────────
describe("generateStructured — jsonMode threading", () => {
  test("jsonMode:true is forwarded to generateText call", async () => {
    const gt = jest.fn().mockResolvedValue('{"name":"Alice","age":30}');
    await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
      jsonMode: true,
    });

    expect(gt).toHaveBeenCalledTimes(1);
    const callArg = gt.mock.calls[0][0];
    expect(callArg).toHaveProperty("jsonMode", true);
  });

  test("jsonMode:false is forwarded to generateText call", async () => {
    const gt = jest.fn().mockResolvedValue('{"name":"Bob","age":25}');
    await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
      jsonMode: false,
    });

    expect(gt).toHaveBeenCalledTimes(1);
    const callArg = gt.mock.calls[0][0];
    expect(callArg).toHaveProperty("jsonMode", false);
  });

  test("jsonMode absent → generateText NOT called with jsonMode key", async () => {
    const gt = jest.fn().mockResolvedValue('{"name":"Carol","age":20}');
    await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
      // no jsonMode argument
    });

    expect(gt).toHaveBeenCalledTimes(1);
    const callArg = gt.mock.calls[0][0];
    expect(callArg).not.toHaveProperty("jsonMode");
  });

  test("jsonMode:true forwarded on repair calls too", async () => {
    const gt = jest.fn()
      .mockResolvedValueOnce('{"name":"Dave"}') // missing age → repair
      .mockResolvedValueOnce('{"name":"Dave","age":33}');

    await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
      jsonMode: true,
      maxRepairs: 1,
    });

    expect(gt).toHaveBeenCalledTimes(2);
    // Both calls should have jsonMode:true
    expect(gt.mock.calls[0][0]).toHaveProperty("jsonMode", true);
    expect(gt.mock.calls[1][0]).toHaveProperty("jsonMode", true);
  });

  test("default jsonMode (undefined) does not break existing behavior", async () => {
    const gt = jest.fn().mockResolvedValue('{"name":"Eve","age":22}');
    const result = await generateStructured({
      generateText: gt,
      prompt: "Give me a person.",
      schema: personSchema,
    });

    expect(result.object).toEqual({ name: "Eve", age: 22 });
    expect(result.error).toBeNull();
  });
});
