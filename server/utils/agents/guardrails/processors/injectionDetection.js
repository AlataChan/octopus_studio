"use strict";

/**
 * Injection Detection Processor
 *
 * Heuristic patterns for prompt injection attempts (EN + ZH).
 * Default behavior: flag only (no block).
 * Blocking requires: config.injectionBlock=true (or constructor block=true)
 * AND a high-severity finding.
 *
 * findings: { type: "injection", severity, code, count: 1 }
 * text is never modified.
 */

const INJECTION_PATTERNS = [
  {
    code: "inj.ignore_prev",
    severity: "high",
    re: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts)/i,
  },
  {
    code: "inj.disregard_system",
    severity: "high",
    re: /(disregard|forget|override)\s+(the\s+)?(system\s+prompt|your\s+instructions)/i,
  },
  {
    code: "inj.role_override",
    severity: "medium",
    re: /you\s+are\s+now\s+(a|an|the)\b/i,
  },
  {
    code: "inj.reveal_system",
    severity: "medium",
    re: /(reveal|show|print|repeat)\s+(your\s+)?(system\s+prompt|instructions)/i,
  },
  {
    code: "inj.zh_ignore",
    severity: "high",
    re: /(忽略|无视|忘记)\s*(之前|上面|以上|所有)?\s*(的)?\s*(指令|指示|提示|规则|设定)/,
  },
];

/**
 * @param {Object} options
 * @param {boolean} [options.block=false] - Default block behavior (overridden by config.injectionBlock)
 */
function createInjectionDetectionProcessor({ block = false } = {}) {
  return {
    name: "injection_detection",

    run({ text, config }) {
      const doBlock = config?.injectionBlock ?? block;
      const str = String(text ?? "");
      const findings = [];

      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.re.test(str)) {
          findings.push({
            type: "injection",
            severity: pattern.severity,
            code: pattern.code,
            count: 1,
          });
        }
      }

      // Only block when: explicit block config AND at least one high-severity finding
      const hasHigh = findings.some((f) => f.severity === "high");
      const blocked = doBlock && hasHigh;

      return { text, findings, blocked };
    },
  };
}

module.exports = { createInjectionDetectionProcessor, INJECTION_PATTERNS };
