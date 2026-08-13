"use strict";

const { DataSanitizer } = require("../../../dataSanitizer");

/**
 * PII Redaction Processor
 *
 * - Reset-safe: clones regex before use, never mutates DataSanitizer.PII_PATTERNS
 * - Stable numbered placeholders: [EMAIL_REDACTED_1], [EMAIL_REDACTED_2], ...
 * - findings contain ONLY { type, severity, code, count } — no raw matched content
 * - config.piiRedact controls redaction (true=redact, false=detect-only)
 *
 * @param {Object} options
 * @param {Object} [options.patterns] - Pattern map { name: RegExp } (defaults to DataSanitizer.PII_PATTERNS)
 * @param {boolean} [options.redact=true] - Default redact behavior (overridden by config.piiRedact)
 */
function createPiiRedactionProcessor({
  patterns = DataSanitizer.PII_PATTERNS,
  redact = true,
} = {}) {
  return {
    name: "pii_redaction",

    run({ text, config }) {
      const doRedact = config?.piiRedact ?? redact;
      let out = String(text ?? "");
      const findings = [];

      for (const [type, re] of Object.entries(patterns)) {
        // Clone regex and ensure global flag — never mutate the shared pattern
        const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
        const rxFind = new RegExp(re.source, flags);

        // Find all matches (reset-safe: new regex has lastIndex=0)
        const matches = out.match(rxFind) || [];

        if (matches.length > 0) {
          // Record finding with count only — no raw content
          findings.push({
            type,
            severity: "info",
            code: `pii.${type}`,
            count: matches.length,
          });

          if (doRedact) {
            // Replace with stable numbered placeholders
            // Use a fresh clone for replace to reset lastIndex
            const rxReplace = new RegExp(re.source, flags);
            let n = 0;
            out = out.replace(rxReplace, () => `[${type.toUpperCase()}_REDACTED_${++n}]`);
          }
        }
      }

      return { text: out, findings };
    },
  };
}

module.exports = { createPiiRedactionProcessor };
