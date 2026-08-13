"use strict";

/**
 * datasetLoader.js — Validates and normalizes an eval dataset.
 *
 * Each valid case must have:
 *   - id: string (non-empty, unique)
 *   - output OR generate (at least one)
 *
 * Optional fields:
 *   - tags?: string[]
 *   - input?: string
 *   - expected?: { mustContain?, shouldContain?, mustNotContain?, schema?, minLength?, maxLength? }
 *   - generate?: (input) => Promise<string>
 *   - thresholds?: { [scorerName]: number }
 *
 * Returns:
 *   { cases: NormalizedCase[], errors: string[] }
 *
 * Errors are SURFACED (not silently dropped). Invalid items go to errors; valid items go to cases.
 * Duplicate ids: the first occurrence wins; subsequent duplicates go to errors.
 */

/**
 * @typedef {Object} EvalCase
 * @property {string} id
 * @property {string[]} tags
 * @property {string|undefined} input
 * @property {Object} expected
 * @property {string|undefined} output
 * @property {Function|undefined} generate
 * @property {Object} thresholds
 */

/**
 * Validate and normalize a dataset.
 *
 * @param {Array<any>} dataset - Raw input array of case objects
 * @returns {{ cases: EvalCase[], errors: string[] }}
 */
function loadDataset(dataset) {
  const cases = [];
  const errors = [];
  const seenIds = new Set();

  if (!Array.isArray(dataset)) {
    errors.push("dataset must be an array");
    return { cases, errors };
  }

  for (let i = 0; i < dataset.length; i++) {
    const raw = dataset[i];
    const prefix = `case[${i}]`;

    // Validate id
    if (raw.id === undefined || raw.id === null) {
      errors.push(`${prefix}: missing required field "id"`);
      continue;
    }
    if (typeof raw.id !== "string") {
      errors.push(`${prefix}: "id" must be a string (got ${typeof raw.id})`);
      continue;
    }
    if (raw.id.trim() === "") {
      errors.push(`${prefix}: "id" must be a non-empty string`);
      continue;
    }

    // Validate uniqueness
    if (seenIds.has(raw.id)) {
      errors.push(`case id "${raw.id}" (index ${i}): duplicate id — skipping`);
      continue;
    }

    // Validate output | generate
    const hasOutput = raw.output !== undefined && raw.output !== null;
    const hasGenerate = typeof raw.generate === "function";
    if (!hasOutput && !hasGenerate) {
      errors.push(
        `case id "${raw.id}": must have at least one of "output" or "generate"`
      );
      continue;
    }

    // Valid — normalize
    seenIds.add(raw.id);
    cases.push({
      id: raw.id,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      input: raw.input,
      expected: raw.expected && typeof raw.expected === "object" ? raw.expected : {},
      output: hasOutput ? raw.output : undefined,
      generate: hasGenerate ? raw.generate : undefined,
      thresholds:
        raw.thresholds && typeof raw.thresholds === "object" ? raw.thresholds : {},
    });
  }

  return { cases, errors };
}

module.exports = { loadDataset };
