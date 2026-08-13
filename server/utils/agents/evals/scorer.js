"use strict";

/**
 * scorer.js — Deterministic heuristic regression tripwires for LLM output evaluation.
 *
 * IMPORTANT: These scorers are HEURISTIC regression tripwires, NOT authoritative quality metrics.
 * They are designed to catch obvious failures (empty answers, missing key points, invalid JSON,
 * prohibited keywords, gross length drift). They do NOT measure semantic quality — paraphrasing
 * or synonyms will confuse them. For semantic quality assessment, use an LLM-judge scorer instead.
 *
 * Scorer interface:
 *   { name: string, score({ input, output, expected?, context? }) => { score: 0..1, passed?: boolean, detail: string } }
 *
 * Expected structure (per evaluation case):
 *   {
 *     mustContain?: string[],      // all must appear
 *     shouldContain?: string[],    // coverage ratio (keywordCoverage)
 *     mustNotContain?: string[],   // none must appear
 *     schema?: ZodSchema,          // for jsonValidity zod check
 *     minLength?: number,          // for lengthSanity
 *     maxLength?: number,          // for lengthSanity
 *   }
 *
 * Exports:
 *   createKeywordCoverageScorer()
 *   createMustContainScorer()
 *   createMustNotContainScorer()
 *   createLengthSanityScorer(opts?)
 *   createJsonValidityScorer()
 *   createSafetyKeywordFlagScorer(opts?)
 *   runScorers(scorers, sample) => { [name]: result }
 *   BUILTIN_SCORERS  { name => factory }
 */

// ---------------------------------------------------------------------------
// Internal: reuse Cap1 extractJson for JSON parsing
// ---------------------------------------------------------------------------
const { extractJson } = require("../structured/generateStructured");

// ---------------------------------------------------------------------------
// Internal: reuse Cap3 injection detection patterns for safetyKeywordFlag
// ---------------------------------------------------------------------------
const {
  INJECTION_PATTERNS,
} = require("../guardrails/processors/injectionDetection");

// ---------------------------------------------------------------------------
// Default length bounds (used when expected.minLength/maxLength are absent)
// ---------------------------------------------------------------------------
const DEFAULT_MIN_LENGTH = 1;
const DEFAULT_MAX_LENGTH = 32000;

// ---------------------------------------------------------------------------
// keywordCoverage
// ---------------------------------------------------------------------------

/**
 * Measures the fraction of `expected.shouldContain` keywords present in output.
 * Empty list → score 1 (no keywords required = full coverage).
 *
 * @returns {{ name: string, score: Function }}
 */
function createKeywordCoverageScorer() {
  return {
    name: "keywordCoverage",
    score({ output, expected = {} }) {
      const keywords = expected.shouldContain || [];
      if (keywords.length === 0) {
        return { score: 1, passed: true, detail: "no shouldContain keywords specified" };
      }
      const lower = String(output || "").toLowerCase();
      const hit = keywords.filter((kw) => lower.includes(String(kw).toLowerCase()));
      const ratio = hit.length / keywords.length;
      return {
        score: ratio,
        passed: ratio === 1,
        detail: `${hit.length}/${keywords.length} shouldContain keywords found`,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// mustContain
// ---------------------------------------------------------------------------

/**
 * All keywords in `expected.mustContain` must appear in output.
 * score = (found / total); passed = (found === total).
 *
 * @returns {{ name: string, score: Function }}
 */
function createMustContainScorer() {
  return {
    name: "mustContain",
    score({ output, expected = {} }) {
      const keywords = expected.mustContain || [];
      if (keywords.length === 0) {
        return { score: 1, passed: true, detail: "no mustContain keywords specified" };
      }
      const lower = String(output || "").toLowerCase();
      const missing = keywords.filter((kw) => !lower.includes(String(kw).toLowerCase()));
      const found = keywords.length - missing.length;
      const ratio = found / keywords.length;
      return {
        score: ratio,
        passed: missing.length === 0,
        detail:
          missing.length === 0
            ? `all ${keywords.length} mustContain keywords found`
            : `missing ${missing.length}/${keywords.length} mustContain keywords`,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// mustNotContain
// ---------------------------------------------------------------------------

/**
 * None of the keywords in `expected.mustNotContain` may appear in output.
 * Any hit → score 0, passed false.
 *
 * @returns {{ name: string, score: Function }}
 */
function createMustNotContainScorer() {
  return {
    name: "mustNotContain",
    score({ output, expected = {} }) {
      const keywords = expected.mustNotContain || [];
      if (keywords.length === 0) {
        return { score: 1, passed: true, detail: "no mustNotContain keywords specified" };
      }
      const lower = String(output || "").toLowerCase();
      const hits = keywords.filter((kw) => lower.includes(String(kw).toLowerCase()));
      if (hits.length > 0) {
        return {
          score: 0,
          passed: false,
          detail: `${hits.length} mustNotContain keyword(s) found in output`,
        };
      }
      return {
        score: 1,
        passed: true,
        detail: `none of the ${keywords.length} mustNotContain keywords found`,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// lengthSanity
// ---------------------------------------------------------------------------

/**
 * Checks output length is within [minLength, maxLength].
 * Out-of-bounds → score decays proportionally (never negative).
 *
 * @param {{ defaultMin?: number, defaultMax?: number }} [opts]
 * @returns {{ name: string, score: Function }}
 */
function createLengthSanityScorer({
  defaultMin = DEFAULT_MIN_LENGTH,
  defaultMax = DEFAULT_MAX_LENGTH,
} = {}) {
  return {
    name: "lengthSanity",
    score({ output, expected = {} }) {
      const min = expected.minLength !== undefined ? expected.minLength : defaultMin;
      const max = expected.maxLength !== undefined ? expected.maxLength : defaultMax;
      const len = String(output || "").length;

      if (len >= min && len <= max) {
        return { score: 1, passed: true, detail: `length ${len} within [${min}, ${max}]` };
      }

      if (len < min) {
        // Decay: ratio of actual to min (0 → 0, approaching min → approaching 1)
        const decay = min > 0 ? Math.max(0, len / min) : 0;
        return {
          score: decay,
          passed: false,
          detail: `length ${len} below minimum ${min}`,
        };
      }

      // len > max: decay based on how far over we are
      const overflow = len - max;
      // Penalize proportionally: every extra `max` chars cuts score by half (capped at 0)
      const decay = Math.max(0, 1 - overflow / (max || 1));
      return {
        score: decay,
        passed: false,
        detail: `length ${len} exceeds maximum ${max}`,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// jsonValidity
// ---------------------------------------------------------------------------

/**
 * Checks whether output contains valid JSON (using Cap1 extractJson).
 * If `expected.schema` is a Zod schema, also validates parsed object against it.
 * score: 1 = valid (and schema-valid if given), 0 = invalid.
 *
 * @returns {{ name: string, score: Function }}
 */
function createJsonValidityScorer() {
  return {
    name: "jsonValidity",
    score({ output, expected = {} }) {
      const str = String(output || "");
      const jsonStr = extractJson(str);

      if (jsonStr === null) {
        return { score: 0, passed: false, detail: "no valid JSON found in output" };
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        return { score: 0, passed: false, detail: "JSON parse error" };
      }

      // If a Zod schema is provided, validate against it
      if (expected.schema && typeof expected.schema.safeParse === "function") {
        const result = expected.schema.safeParse(parsed);
        if (!result.success) {
          return {
            score: 0,
            passed: false,
            detail: "JSON valid but schema validation failed",
          };
        }
      }

      return { score: 1, passed: true, detail: "valid JSON" };
    },
  };
}

// ---------------------------------------------------------------------------
// safetyKeywordFlag
// ---------------------------------------------------------------------------

/**
 * Heuristic safety keyword flag — NOT a toxicity classifier.
 * Flags outputs that contain prompt-injection patterns (from Cap3 INJECTION_PATTERNS)
 * or entries from an optional additional blocklist.
 *
 * Naming: "safetyKeywordFlag" — honest naming, this is a keyword/pattern check only.
 * detail: records type+count of matches only — NEVER echoes raw matched content.
 *
 * @param {{ additionalBlocklist?: string[] }} [opts]
 * @returns {{ name: string, score: Function }}
 */
function createSafetyKeywordFlagScorer({ additionalBlocklist = [] } = {}) {
  return {
    name: "safetyKeywordFlag",
    score({ output }) {
      const str = String(output || "");
      const findings = [];

      // Check Cap3 injection patterns
      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.re.test(str)) {
          findings.push({ type: "injection", code: pattern.code, severity: pattern.severity });
        }
      }

      // Check optional additional blocklist
      const lower = str.toLowerCase();
      let blocklistHits = 0;
      for (const word of additionalBlocklist) {
        if (lower.includes(String(word).toLowerCase())) {
          blocklistHits++;
        }
      }
      if (blocklistHits > 0) {
        findings.push({ type: "blocklist", code: "safety.blocklist", count: blocklistHits });
      }

      if (findings.length > 0) {
        // Summarize by type+code count — NO raw content echoed
        const summary = findings
          .map((f) => `${f.type}:${f.code}`)
          .join(", ");
        return {
          score: 0,
          passed: false,
          detail: `safetyKeywordFlag: ${findings.length} match(es) — types: [${summary}]`,
        };
      }

      return { score: 1, passed: true, detail: "no safety keyword patterns matched" };
    },
  };
}

// ---------------------------------------------------------------------------
// runScorers
// ---------------------------------------------------------------------------

/**
 * Run multiple scorers against a single evaluation sample.
 *
 * @param {Array<{ name: string, score: Function }>} scorers
 * @param {{ input?: string, output: string, expected?: object, context?: any }} sample
 * @returns {{ [scorerName: string]: { score: number, passed?: boolean, detail: string } }}
 */
function runScorers(scorers, sample) {
  const results = {};
  for (const scorer of scorers) {
    results[scorer.name] = scorer.score(sample);
  }
  return results;
}

// ---------------------------------------------------------------------------
// BUILTIN_SCORERS registry — name → factory
// ---------------------------------------------------------------------------

const BUILTIN_SCORERS = {
  keywordCoverage: createKeywordCoverageScorer,
  mustContain: createMustContainScorer,
  mustNotContain: createMustNotContainScorer,
  lengthSanity: createLengthSanityScorer,
  jsonValidity: createJsonValidityScorer,
  safetyKeywordFlag: createSafetyKeywordFlagScorer,
};

module.exports = {
  createKeywordCoverageScorer,
  createMustContainScorer,
  createMustNotContainScorer,
  createLengthSanityScorer,
  createJsonValidityScorer,
  createSafetyKeywordFlagScorer,
  runScorers,
  BUILTIN_SCORERS,
};
