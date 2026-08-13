"use strict";

/**
 * Moderation Processor
 *
 * - Blocklist: flags text containing any blocked word (case-insensitive)
 *   config.blocklist overrides constructor blocklist
 * - moderateFn: optional async function(text) => { flagged, severity? }
 *   Allows injecting LLM-based moderation without coupling to a provider
 * - Never blocks (blocked always false) — callers handle blocking via pipeline config
 * - text is never modified
 *
 * findings: { type: "moderation", severity, code: "mod.blocklist"|"mod.llm", count: 1 }
 */

/**
 * @param {Object} options
 * @param {Function|null} [options.moderateFn=null] - Async moderation hook: (text) => { flagged, severity? }
 * @param {string[]}      [options.blocklist=[]]    - Default word blocklist
 */
function createModerationProcessor({ moderateFn = null, blocklist = [] } = {}) {
  return {
    name: "moderation",

    async run({ text, config }) {
      const str = String(text ?? "");
      const activeBlocklist = config?.blocklist || blocklist;
      const findings = [];

      // Blocklist check (case-insensitive)
      for (const word of activeBlocklist) {
        if (str.toLowerCase().includes(String(word).toLowerCase())) {
          findings.push({
            type: "moderation",
            severity: "medium",
            code: "mod.blocklist",
            count: 1,
          });
        }
      }

      // External moderation hook
      if (typeof moderateFn === "function") {
        const r = await moderateFn(str);
        if (r?.flagged) {
          findings.push({
            type: "moderation",
            severity: r.severity || "medium",
            code: "mod.llm",
            count: 1,
          });
        }
      }

      return { text, findings, blocked: false };
    },
  };
}

module.exports = { createModerationProcessor };
