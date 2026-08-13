"use strict";

/**
 * Guardrail Processors — aggregated exports
 *
 * Usage:
 *   const { createPiiRedactionProcessor, createInjectionDetectionProcessor, createModerationProcessor } =
 *     require('./utils/agents/guardrails/processors');
 */

const { createPiiRedactionProcessor } = require("./piiRedaction");
const { createInjectionDetectionProcessor, INJECTION_PATTERNS } = require("./injectionDetection");
const { createModerationProcessor } = require("./moderation");

module.exports = {
  createPiiRedactionProcessor,
  createInjectionDetectionProcessor,
  createModerationProcessor,
  INJECTION_PATTERNS,
};
