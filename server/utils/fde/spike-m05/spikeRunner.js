const fs = require("fs");
const path = require("path");
const { executeWithOwnOrchestrator } = require("./ownConditionalExecutor");
const { executeWithMastraBranch } = require("./mastraConditionalExecutor");
const {
  inMemoryEvidence,
  resumeFresh,
  suspendAndHold,
} = require("./resumeProbe");
const { loopEvidence } = require("./loopProbe");

const SPEC = {
  id: "priority-route",
  type: "condition",
  condition: {
    operator: "equals",
    source: "input",
    field: "priority",
    value: "high",
  },
  branches: [
    {
      when: true,
      route: "urgent",
      message: "ticket ${input.ticket} uses model ${binding.urgentModel}",
    },
    {
      when: false,
      route: "standard",
      message: "ticket ${input.ticket} uses model ${binding.standardModel}",
    },
  ],
};

const CONTEXT = {
  inputs: { priority: "high", ticket: "T-42" },
  bindings: { urgentModel: "model-urgent", standardModel: "model-standard" },
};

function sourceLines(filename) {
  const source = fs.readFileSync(path.join(__dirname, filename), "utf-8");
  return source
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("//")).length;
}

async function captureError(run) {
  try {
    await run();
  } catch (error) {
    return error.code || error.name;
  }
  return "NO_ERROR";
}

async function main() {
  const command = process.argv[2];
  if (command === "branch") {
    const [own, mastra] = await Promise.all([
      executeWithOwnOrchestrator(SPEC, CONTEXT),
      executeWithMastraBranch(SPEC, CONTEXT),
    ]);
    process.stdout.write(
      JSON.stringify({
        own: { ...own, sloc: sourceLines("ownConditionalExecutor.js") },
        mastra: {
          ...mastra,
          sloc: sourceLines("mastraConditionalExecutor.js"),
        },
        shared: { sloc: sourceLines("conditionalRuntime.js") },
      })
    );
    return;
  }
  if (command === "branch-invalid") {
    const invalid = { ...SPEC, condition: { operator: "regex" } };
    process.stdout.write(
      JSON.stringify({
        own: await captureError(() =>
          executeWithOwnOrchestrator(invalid, CONTEXT)
        ),
        mastra: await captureError(() =>
          executeWithMastraBranch(invalid, CONTEXT)
        ),
      })
    );
    return;
  }
  if (command === "resume-in-memory") {
    process.stdout.write(JSON.stringify(await inMemoryEvidence()));
    return;
  }
  if (command === "resume-hold") {
    await suspendAndHold(process.argv[3], process.argv[4]);
    return;
  }
  if (command === "resume-fresh") {
    process.stdout.write(
      JSON.stringify(await resumeFresh(process.argv[3], process.argv[4]))
    );
    return;
  }
  if (command === "loops") {
    process.stdout.write(JSON.stringify(await loopEvidence()));
    return;
  }
  throw new Error("unknown M0.5 spike command");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
