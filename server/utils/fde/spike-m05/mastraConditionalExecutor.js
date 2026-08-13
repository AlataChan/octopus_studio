const { createStep, createWorkflow } = require("@mastra/core/workflows");
const { z } = require("zod");
const { prepareConditionalRun, renderBranch } = require("./conditionalRuntime");

async function executeWithMastraBranch(spec, context) {
  const prepared = prepareConditionalRun(spec, context);
  const branches = new Map(
    prepared.branches.map((branch) => [branch.when, branch])
  );
  const schema = z.object({ selected: z.boolean() });
  const outputSchema = z.object({ output: z.any(), trace: z.array(z.any()) });

  const trueStep = createStep({
    id: "true-branch",
    inputSchema: schema,
    outputSchema,
    execute: async () =>
      renderBranch(prepared.specId, branches.get(true), prepared.context),
  });
  const falseStep = createStep({
    id: "false-branch",
    inputSchema: schema,
    outputSchema,
    execute: async () =>
      renderBranch(prepared.specId, branches.get(false), prepared.context),
  });

  const workflow = createWorkflow({
    id: "m05-conditional",
    inputSchema: schema,
    outputSchema: z.any(),
  })
    .branch([
      [async ({ inputData }) => inputData.selected, trueStep],
      [async ({ inputData }) => !inputData.selected, falseStep],
    ])
    .commit();

  const run = await workflow.createRun();
  const result = await run.start({
    inputData: { selected: prepared.selected },
  });
  if (result.status !== "success") {
    throw new Error("Mastra conditional did not complete");
  }
  return Object.values(result.result)[0];
}

module.exports = { executeWithMastraBranch };
