function loadMastra() {
  const { Agent } = require("@mastra/core/agent");
  const { createTool } = require("@mastra/core/tools");
  const { z } = require("zod");
  const { createWorkflow, createStep } = require("@mastra/core/workflows");

  return {
    Agent,
    createTool,
    z,
    createWorkflow,
    createStep,
  };
}

module.exports = { loadMastra };
