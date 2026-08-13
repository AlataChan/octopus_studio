"use strict";

/**
 * Guardrail Pipeline
 *
 * A declarative, deterministic, DI-friendly pipeline for processing text
 * through ordered processors (PII redaction, injection detection, moderation, etc.)
 *
 * processor interface:
 *   { name: string, run({ text, context, config }) => { text?, findings?:[{type,severity,code,count}], blocked?:boolean } }
 *
 * findings shape: { type, severity, code, count }  — NO raw matched content
 */

/**
 * Create a guardrail pipeline with input and output processor chains.
 *
 * @param {Object} options
 * @param {Array}  options.inputProcessors  - Processors run on user input (default [])
 * @param {Array}  options.outputProcessors - Processors run on model output (default [])
 * @param {Object} options.config           - Config passed to every processor (default {})
 * @returns {{ runInput, runOutput }}
 */
function createGuardrailPipeline({
  inputProcessors = [],
  outputProcessors = [],
  config = {},
} = {}) {
  async function _run(processors, text, context) {
    let current = String(text ?? "");
    const findings = [];
    let blocked = false;

    for (const p of processors) {
      const r = await p.run({ text: current, context, config });
      if (typeof r?.text === "string") current = r.text;
      if (Array.isArray(r?.findings)) {
        findings.push(...r.findings.map((f) => ({ ...f, processor: p.name })));
      }
      if (r?.blocked) blocked = true;
    }

    return { text: current, findings, blocked };
  }

  return {
    /**
     * Run input processors (e.g. check/redact user message before sending to LLM)
     * @param {string} text
     * @param {Object} context
     */
    runInput: (text, context) => _run(inputProcessors, text, context),

    /**
     * Run output processors (e.g. redact/moderate model response before returning)
     * @param {string} text
     * @param {Object} context
     */
    runOutput: (text, context) => _run(outputProcessors, text, context),
  };
}

module.exports = { createGuardrailPipeline };
