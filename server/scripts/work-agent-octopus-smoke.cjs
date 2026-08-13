#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");

function createNoopKbPort() {
  return {
    lookup: async (input) => ({
      term: input.term,
      canonical: null,
      aliases: [],
      ambiguous: false,
      collisions: [],
      next: [],
    }),
    retrieveBundle: async (input) => ({
      query: input.query,
      bundle: { schema: [], index: [], concepts: [], entities: [], raw_sources: [] },
      warnings: [],
      token_estimate: 0,
      next: [],
    }),
    neighbors: async (input) => ({
      page: input.pagePath,
      inbound: [],
      outbound: [],
      aliases: [],
      canonical_identity: null,
      next: [],
    }),
    impactedPages: async (input) => ({
      page: input.pagePath,
      impacted: [],
      next: [],
    }),
    inboxList: async () => [],
    inboxGet: async () => null,
    inboxAccept: async (input) => ({ id: input.id, finalStatus: "deferred" }),
    inboxReject: async (input) => ({ id: input.id, finalStatus: "rejected" }),
    propose: async () => {
      throw new Error("Octopus smoke disables KB proposal subprocesses.");
    },
    lookupPage: async () => null,
    available: async () => ({ available: false, reason: "disabled" }),
  };
}

async function main() {
  const [
    workCore,
    runtimeEmbedded,
    execSubstrate,
    observability,
    security,
    stateStore,
    workContracts,
  ] = await Promise.all([
    import("@alatastudio/work-core"),
    import("@alatastudio/runtime-embedded"),
    import("@alatastudio/exec-substrate"),
    import("@alatastudio/observability"),
    import("@alatastudio/security"),
    import("@alatastudio/state-store"),
    import("@alatastudio/work-contracts"),
  ]);

  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alata-octopus-smoke-workspace-"));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alata-octopus-smoke-state-"));
  const events = [];
  const eventBus = new observability.EventBus();
  eventBus.onAny((event) => events.push(event));

  const runtimeConfig = {
    provider: "openai-compatible",
    model: "mock-model",
    apiKey: "sk-mock",
    baseUrl: "http://127.0.0.1:7777/v1",
    maxTokens: 1024,
    temperature: 0,
    allowModelApiCall: true,
  };
  const runtime = new runtimeEmbedded.EmbeddedRuntime(
    runtimeConfig,
    runtimeEmbedded.selectModelClientForRuntime(
      runtimeConfig,
      new runtimeEmbedded.HttpModelClient()
    ),
    eventBus
  );
  const substrate = new execSubstrate.ExecutionSubstrate();
  const store = new stateStore.FileStateStore(stateRoot);
  const { policy } = security.createPolicy("safe-local", {
    allowModelApiCall: true,
    workspaceRoot,
  });
  const engine = new workCore.WorkEngine(
    runtime,
    substrate,
    store,
    eventBus,
    policy,
    { kbPort: createNoopKbPort() }
  );

  const goal = workContracts.createWorkGoal({
    description: "create file result.txt with content: hello from octopus",
  });
  const session = await engine.executeGoal(goal, {
    workspaceRoot,
    workspaceId: "smoke-workspace",
    createdBy: "octopus-smoke",
    taskTitle: goal.description,
    memory: { enabled: false },
    kb: { enabled: false },
  });
  const resultPath = path.join(workspaceRoot, "result.txt");
  const result = fs.readFileSync(resultPath, "utf8");
  if (session.state !== "idle" || result !== "hello from octopus") {
    throw new Error(
      `Octopus smoke failed: state=${session.state} result=${JSON.stringify(result)}`
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionState: session.state,
        workspaceRoot,
        stateRoot,
        resultPath,
        result,
        artifactPaths: session.artifacts.map((artifact) => artifact.path),
        eventTypes: events.map((event) => event.type),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[octopus-smoke] failed:", error);
  process.exit(1);
});
