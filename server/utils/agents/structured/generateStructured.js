"use strict";

/**
 * Bounded JSON extraction from arbitrary text.
 * - Prefers ```json fenced blocks
 * - Falls back to finding first { or [ and bracket-matching (bounded, non-greedy)
 * - Caps input at maxRawLen before processing
 * - Returns the JSON string or null
 *
 * @param {string} text
 * @param {{ maxRawLen?: number }} [options]
 * @returns {string|null}
 */
function extractJson(text, { maxRawLen = 20000 } = {}) {
  const s = String(text || "").slice(0, maxRawLen);
  if (!s) return null;

  // 1. Try ```json ... ``` fenced block (take first complete fence)
  const fenceMatch = s.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    const candidate = fenceMatch[1].trim();
    if (candidate) {
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // fallthrough to bracket-matching
      }
    }
  }

  // 2. Find first { or [ and bracket-match to extract the first complete JSON block
  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");

  let startIdx = -1;
  let openChar, closeChar;

  if (firstBrace === -1 && firstBracket === -1) return null;

  if (firstBrace === -1) {
    startIdx = firstBracket;
    openChar = "[";
    closeChar = "]";
  } else if (firstBracket === -1) {
    startIdx = firstBrace;
    openChar = "{";
    closeChar = "}";
  } else if (firstBrace < firstBracket) {
    startIdx = firstBrace;
    openChar = "{";
    closeChar = "}";
  } else {
    startIdx = firstBracket;
    openChar = "[";
    closeChar = "]";
  }

  // Bracket-match from startIdx
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < s.length; i++) {
    const ch = s[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        const candidate = s.slice(startIdx, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/**
 * Schema-constrained structured generation with repair-retry loop.
 *
 * @param {{
 *   generateText: ({system: string, prompt: string, jsonMode?: boolean}) => Promise<string>,
 *   prompt: string,
 *   schema?: { safeParse: (v: any) => { success: boolean, data?: any, error?: any } },
 *   validate?: (obj: any) => { ok: boolean, issues?: any, value?: any },
 *   itemSchema?: { safeParse: (v: any) => { success: boolean, data?: any, error?: any } },
 *   salvageArray?: boolean,
 *   schemaHint?: string,
 *   systemHint?: string,
 *   maxRepairs?: number,
 *   maxRawLen?: number,
 *   maxIssueLen?: number,
 *   jsonMode?: boolean,
 * }} args
 * @returns {Promise<{ object: any|null, raw: string, salvaged?: boolean, error: {code: string, issues: any}|null }>}
 */
async function generateStructured(args) {
  const {
    generateText,
    prompt,
    schema,
    validate,
    itemSchema,
    salvageArray = false,
    schemaHint,
    systemHint,
    maxRepairs = 1,
    maxRawLen = 20000,
    maxIssueLen = 1000,
    jsonMode,
  } = args;

  // Build system prompt
  const baseSystem =
    systemHint ||
    "仅输出 JSON,匹配以下结构,不要额外文字。Only output valid JSON matching the required structure. No extra text.";
  const system = schemaHint ? `${baseSystem}\n\n结构要求 (Schema):\n${schemaHint}` : baseSystem;

  let currentPrompt = prompt;
  let lastRaw = "";

  // Build the generateText call args: thread jsonMode only when explicitly provided.
  // Callers that do not pass jsonMode get the old call shape (no jsonMode key).
  const makeCallArgs = (p) => {
    const callArgs = { system, prompt: p };
    if (jsonMode !== undefined) callArgs.jsonMode = jsonMode;
    return callArgs;
  };

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const raw = await generateText(makeCallArgs(currentPrompt));
    lastRaw = raw;

    // Extract JSON (bounded)
    const jsonStr = extractJson(raw, { maxRawLen });

    let parsed = null;
    if (jsonStr !== null) {
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        parsed = null;
      }
    }

    // If no parseable JSON, treat as validation failure
    if (parsed === null) {
      if (attempt < maxRepairs) {
        const issueText = "无法从输出中提取有效 JSON".slice(0, maxIssueLen);
        currentPrompt = `上次输出不符合要求：${issueText}。请仅输出符合结构的 JSON，不要其他文字。`;
        continue;
      }
      return {
        object: null,
        raw: lastRaw,
        error: { code: "schema_validation_failed", issues: "no valid JSON extracted" },
      };
    }

    // Validate
    let validationOk = false;
    let validatedValue = parsed;
    let issuesSummary = null;

    if (schema) {
      const parseResult = schema.safeParse(parsed);
      if (parseResult.success) {
        validationOk = true;
        validatedValue = parseResult.data;
      } else {
        // Try salvageArray if applicable
        if (
          salvageArray &&
          itemSchema &&
          Array.isArray(parsed) &&
          parsed.length > 0
        ) {
          const validItems = [];
          for (const item of parsed) {
            const itemResult = itemSchema.safeParse(item);
            if (itemResult.success) {
              validItems.push(itemResult.data);
            }
          }
          if (validItems.length > 0) {
            return {
              object: validItems,
              raw: lastRaw,
              salvaged: true,
              error: null,
            };
          }
          // All items failed salvage — fall through to repair
        }

        // Summarize schema errors (truncated, no raw leak)
        const errText = parseResult.error
          ? JSON.stringify(parseResult.error.errors || parseResult.error, null, 0)
          : "schema validation failed";
        issuesSummary = errText.slice(0, maxIssueLen);
      }
    } else if (validate) {
      const vResult = validate(parsed);
      if (vResult.ok) {
        validationOk = true;
        validatedValue = vResult.value !== undefined ? vResult.value : parsed;
      } else {
        const issText =
          typeof vResult.issues === "string"
            ? vResult.issues
            : JSON.stringify(vResult.issues || "validation failed", null, 0);
        issuesSummary = issText.slice(0, maxIssueLen);
      }
    } else {
      // No schema or validate — accept any parseable JSON
      validationOk = true;
    }

    if (validationOk) {
      return {
        object: validatedValue,
        raw: lastRaw,
        error: null,
      };
    }

    // Build repair prompt — NEVER include full raw output, only truncated sanitized issues
    if (attempt < maxRepairs) {
      currentPrompt = `上次输出不符合要求：${issuesSummary}。请仅输出符合结构的 JSON，不要其他文字。`;
    }
  }

  // Exhausted all repairs
  const finalIssues = (() => {
    if (schema) {
      const r = schema.safeParse(
        (() => {
          try {
            return JSON.parse(extractJson(lastRaw, { maxRawLen }) || "null");
          } catch {
            return null;
          }
        })()
      );
      if (!r.success) {
        return JSON.stringify(r.error?.errors || r.error, null, 0).slice(0, maxIssueLen);
      }
    }
    return "schema validation failed after max repairs";
  })();

  return {
    object: null,
    raw: lastRaw,
    error: { code: "schema_validation_failed", issues: finalIssues },
  };
}

module.exports = { generateStructured, extractJson };
