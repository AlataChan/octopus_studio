const fs = require("fs");
const os = require("os");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const {
  canonicalizeJcs,
  computeReviewSubjectDigest,
  computeSpecDigest,
  createFdeWorkflowDraftModel,
} = require("../../models/fdeWorkflowDraft");

const spec = {
  schema_version: "1.0",
  target: "studio",
  workflow: { name: "Race test", nodes: [], edges: [] },
};
const resolved = {
  model: {
    "default-chat-model": { provider: "openai", model: "gpt-4o-mini" },
  },
  dataset: {},
};

function subject(compilerVersion = "compiler/1") {
  return computeReviewSubjectDigest({
    specDigest: computeSpecDigest(spec),
    compilerVersion,
    targetVersion: "1",
    schemaVersion: "1.0",
    engine: "mastra",
    resolvedBindings: resolved,
    studioReviewPolicyVersion: "1",
  });
}

function seedData(overrides = {}) {
  const reviewSubjectDigest = subject();
  return {
    workspaceId: 7,
    lineageKey: "race-test",
    revision: 1,
    name: "Race test",
    contract: "studio-v1",
    targetVersion: "1",
    schemaVersion: "1.0",
    compilerVersion: "compiler/1",
    sourceIrVersion: "0.3",
    sourceIrHash: "a".repeat(64),
    specJson: canonicalizeJcs(spec),
    specDigest: computeSpecDigest(spec),
    reviewSubjectDigest,
    status: "ready",
    engine: "mastra",
    resolvedBindingsJson: canonicalizeJcs(resolved),
    missingBindingsJson: "[]",
    reviewStatus: "requested",
    reviewedSubjectDigest: null,
    createdByUserId: 12,
    ...overrides,
  };
}

function twoPartyResolver() {
  let arrived = 0;
  let release;
  const gate = new Promise((resolveGate) => {
    release = resolveGate;
  });
  return async () => {
    arrived += 1;
    if (arrived === 2) release();
    await gate;
    return { resolved, missing: [] };
  };
}

describe("FdeWorkflowDraft SQLite concurrency", () => {
  let directory;
  let clients;
  let models;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "fde-draft-race-"));
    const datasourceUrl = `file:${path.join(directory, "race.db")}`;
    clients = [
      new PrismaClient({ datasourceUrl }),
      new PrismaClient({ datasourceUrl }),
    ];
    await clients[0].$executeRawUnsafe(`
      CREATE TABLE fde_workflow_drafts (
        id TEXT NOT NULL PRIMARY KEY,
        workspaceId INTEGER NOT NULL,
        fdeSessionId TEXT,
        fdeFromTurnId TEXT,
        fdeToTurnId TEXT,
        diffJson TEXT,
        studioReviewPolicyVersion TEXT NOT NULL DEFAULT '1',
        lineageKey TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        parentDraftId TEXT,
        name TEXT NOT NULL,
        contract TEXT NOT NULL DEFAULT 'studio-v1',
        targetVersion TEXT NOT NULL DEFAULT '1',
        schemaVersion TEXT NOT NULL DEFAULT '1.0',
        compilerVersion TEXT NOT NULL,
        sourceIrVersion TEXT NOT NULL,
        sourceIrHash TEXT NOT NULL,
        specJson TEXT NOT NULL,
        specDigest TEXT NOT NULL,
        reviewSubjectDigest TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        engine TEXT NOT NULL DEFAULT 'mastra',
        stateVersion INTEGER NOT NULL DEFAULT 0,
        resolvedBindingsJson TEXT NOT NULL DEFAULT '{}',
        missingBindingsJson TEXT NOT NULL DEFAULT '[]',
        reviewStatus TEXT NOT NULL DEFAULT 'not_requested',
        reviewedSubjectDigest TEXT,
        assignedReviewerId INTEGER,
        reviewedByUserId INTEGER,
        reviewedAt DATETIME,
        publishedByUserId INTEGER,
        publishedAt DATETIME,
        createdByUserId INTEGER,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL
      )
    `);
    await clients[0].$executeRawUnsafe(
      "CREATE UNIQUE INDEX draft_revision ON fde_workflow_drafts(workspaceId, lineageKey, revision)"
    );
    await clients[0].$queryRawUnsafe("PRAGMA journal_mode=WAL");
    await clients[1].$queryRawUnsafe("PRAGMA journal_mode=WAL");
    models = clients.map((client) => createFdeWorkflowDraftModel(client));
  });

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.$disconnect()));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function seed(overrides = {}) {
    return clients[0].fde_workflow_drafts.create({ data: seedData(overrides) });
  }

  function expectOneConflict(results) {
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect(rejected.reason.code).toMatch(/^STUDIO_DRAFT_/);
  }

  it("serializes duplicate approve from two Prisma clients", async () => {
    const draft = await seed();
    const resolveFreshBindings = twoPartyResolver();
    const results = await Promise.allSettled(
      models.map((model) =>
        model.approve({
          id: draft.id,
          actorUserId: 44,
          separationOfDutySatisfied: true,
          expectedStateVersion: 0,
          resolveFreshBindings,
        })
      )
    );
    expectOneConflict(results);
  });

  it("serializes publish racing publish from two Prisma clients", async () => {
    const digest = subject();
    const draft = await seed({
      reviewStatus: "approved",
      reviewedSubjectDigest: digest,
      reviewedByUserId: 44,
      diffJson: "{}",
    });
    const resolveFreshBindings = twoPartyResolver();
    const results = await Promise.allSettled(
      models.map((model) =>
        model.publish({
          id: draft.id,
          actorUserId: 55,
          separationOfDutySatisfied: true,
          expectedStateVersion: 0,
          resolveFreshBindings,
        })
      )
    );
    expectOneConflict(results);
  });

  it("returns a stable conflict for import racing approve", async () => {
    const draft = await seed();
    const beforeConditionalWrite = twoPartyResolver();
    const raceModels = clients.map((client) =>
      createFdeWorkflowDraftModel(client, { beforeConditionalWrite })
    );
    const approvePromise = raceModels[0].approve({
      id: draft.id,
      actorUserId: 44,
      separationOfDutySatisfied: true,
      expectedStateVersion: 0,
      resolveFreshBindings: async () => ({ resolved, missing: [] }),
    });
    const importPromise = raceModels[1].upsertRevision({
      workspaceId: 7,
      lineageKey: "race-test",
      name: "Race test",
      spec,
      compilerVersion: "compiler/2",
      targetVersion: "1",
      schemaVersion: "1.0",
      engine: "mastra",
      sourceIrVersion: "0.3",
      sourceIrHash: "b".repeat(64),
      resolvedBindings: resolved,
      missingBindings: [],
      createdByUserId: 12,
    });

    const results = await Promise.allSettled([approvePromise, importPromise]);
    expectOneConflict(results);
  });

  it("fails closed with a stable 409 for approve racing publish", async () => {
    const draft = await seed({ diffJson: "{}" });
    const results = await Promise.allSettled([
      models[0].approve({
        id: draft.id,
        actorUserId: 44,
        separationOfDutySatisfied: true,
        expectedStateVersion: 0,
        resolveFreshBindings: async () => ({ resolved, missing: [] }),
      }),
      models[1].publish({
        id: draft.id,
        actorUserId: 55,
        separationOfDutySatisfied: true,
        expectedStateVersion: 0,
        resolveFreshBindings: async () => ({ resolved, missing: [] }),
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect([
      "STUDIO_DRAFT_CONFLICT",
      "STUDIO_DRAFT_STALE",
      "STUDIO_REVIEW_REQUIRED",
    ]).toContain(rejected.reason.code);
  });
});
