const { createStep, createWorkflow } = require("@mastra/core/workflows");
const { z } = require("zod");

const REQUESTED_MAX = 2;

async function runDowhile() {
  let iterations = 0;
  const schema = z.object({ count: z.number() });
  const increment = createStep({
    id: "dowhile-increment",
    inputSchema: schema,
    outputSchema: schema,
    execute: async ({ inputData }) => {
      iterations += 1;
      return { count: inputData.count + 1 };
    },
  });
  const workflow = createWorkflow({
    id: "m05-dowhile",
    inputSchema: schema,
    outputSchema: schema,
  })
    .dowhile(increment, async ({ inputData }) => inputData.count < 5, {
      maxIterations: REQUESTED_MAX,
    })
    .commit();
  const result = await (
    await workflow.createRun()
  ).start({ inputData: { count: 0 } });
  if (result.status !== "success")
    throw new Error("dowhile probe did not complete");
  return iterations;
}

async function runDountil() {
  let iterations = 0;
  const schema = z.object({ count: z.number() });
  const increment = createStep({
    id: "dountil-increment",
    inputSchema: schema,
    outputSchema: schema,
    execute: async ({ inputData }) => {
      iterations += 1;
      return { count: inputData.count + 1 };
    },
  });
  const workflow = createWorkflow({
    id: "m05-dountil",
    inputSchema: schema,
    outputSchema: schema,
  })
    .dountil(increment, async ({ inputData }) => inputData.count >= 5, {
      maxIterations: REQUESTED_MAX,
    })
    .commit();
  const result = await (
    await workflow.createRun()
  ).start({ inputData: { count: 0 } });
  if (result.status !== "success")
    throw new Error("dountil probe did not complete");
  return iterations;
}

async function runForeach() {
  let iterations = 0;
  const visit = createStep({
    id: "foreach-visit",
    inputSchema: z.number(),
    outputSchema: z.number(),
    execute: async ({ inputData }) => {
      iterations += 1;
      return inputData;
    },
  });
  const workflow = createWorkflow({
    id: "m05-foreach",
    inputSchema: z.array(z.number()),
    outputSchema: z.array(z.number()),
  })
    .foreach(visit, { concurrency: 1, maxIterations: REQUESTED_MAX })
    .commit();
  const result = await (
    await workflow.createRun()
  ).start({ inputData: [1, 2, 3, 4] });
  if (result.status !== "success")
    throw new Error("foreach probe did not complete");
  return iterations;
}

async function runGuardedLoop() {
  let attempts = 0;
  const rejectedPayload = "payload-that-must-not-appear-in-errors";
  const schema = z.object({ count: z.number(), payload: z.string() });
  const guarded = createStep({
    id: "guarded-increment",
    inputSchema: schema,
    outputSchema: schema,
    execute: async ({ inputData }) => {
      attempts += 1;
      if (attempts > REQUESTED_MAX) {
        const error = new Error(
          "workflow loop exceeded its declared iteration bound"
        );
        error.code = "M05_LOOP_MAX_ITERATIONS";
        throw error;
      }
      return { ...inputData, count: inputData.count + 1 };
    },
  });
  const workflow = createWorkflow({
    id: "m05-guarded-loop",
    inputSchema: schema,
    outputSchema: schema,
  })
    .dowhile(guarded, async () => true)
    .commit();
  const result = await (
    await workflow.createRun()
  ).start({
    inputData: { count: 0, payload: rejectedPayload },
  });
  const errorText = `${result.error?.message || ""} ${JSON.stringify(result.error || {})}`;
  return {
    guarded: {
      status: result.status,
      error: result.error?.code,
      attempts,
    },
    errorEchoedPayload: errorText.includes(rejectedPayload),
  };
}

async function loopEvidence() {
  const [dowhileIterations, dountilIterations, foreachIterations] =
    await Promise.all([runDowhile(), runDountil(), runForeach()]);
  const guarded = await runGuardedLoop();
  return {
    requestedMax: REQUESTED_MAX,
    dowhileIterations,
    dountilIterations,
    foreachIterations,
    ...guarded,
  };
}

module.exports = { loopEvidence };
