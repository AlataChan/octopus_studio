"use strict";

const { createGuardrailPipeline } = require("./pipeline");
const {
  createPiiRedactionProcessor,
  createInjectionDetectionProcessor,
} = require("./processors");

function buildGuardrailPipeline({
  inputRedact = false,
  blockInjection = false,
  outputRedact = true,
} = {}) {
  return createGuardrailPipeline({
    inputProcessors: [
      createPiiRedactionProcessor({ redact: inputRedact }),
      createInjectionDetectionProcessor({ block: blockInjection }),
    ],
    outputProcessors: [
      createPiiRedactionProcessor({ redact: outputRedact }),
    ],
    config: {},
  });
}

module.exports = { buildGuardrailPipeline };
