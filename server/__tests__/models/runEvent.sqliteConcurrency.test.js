const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { createRunEventModel } = require("../../models/runEvent");

describe("RunEvent SQLite sequence allocation", () => {
  let directory;
  let database;
  let first;
  let second;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "fde-event-race-"));
    database = path.join(directory, "race.db");
    fs.copyFileSync(
      path.resolve(__dirname, "../../storage/anythingllm.db"),
      database
    );
    first = new PrismaClient({ datasourceUrl: `file:${database}` });
    second = new PrismaClient({ datasourceUrl: `file:${database}` });
  });

  afterEach(async () => {
    await Promise.allSettled([first?.$disconnect(), second?.$disconnect()]);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("allocates contiguous unique sequences from two independent clients", async () => {
    const eventCount = 6;
    const workspace = await first.workspaces.create({
      data: {
        name: "RunEvent concurrency test",
        slug: `run-event-race-${randomUUID()}`,
      },
      select: { id: true },
    });
    const runId = randomUUID();
    await first.runs.create({
      data: {
        id: runId,
        threadId: "event-race",
        workspaceId: workspace.id,
        triggerType: "manual",
        engine: "mastra",
        status: "running",
        metadata: "{}",
      },
    });
    const models = [createRunEventModel(first), createRunEventModel(second)];

    await Promise.all(
      Array.from({ length: eventCount }, (_, index) =>
        models[index % 2].append({
          runId,
          type: "step.completed",
          payload: { nodeId: `node-${index}` },
        })
      )
    );

    const [events, run] = await Promise.all([
      first.run_events.findMany({ where: { runId }, orderBy: { seq: "asc" } }),
      first.runs.findUnique({
        where: { id: runId },
        select: { eventSeq: true },
      }),
    ]);
    expect(events.map((event) => event.seq)).toEqual(
      Array.from({ length: eventCount }, (_, index) => index + 1)
    );
    expect(new Set(events.map((event) => event.seq)).size).toBe(eventCount);
    expect(run.eventSeq).toBe(eventCount);
  });
});
