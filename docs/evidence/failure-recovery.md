# Failure and recovery record

Record date: 2026-08-09. Evidence source:
`server/__tests__/utils/fde/ecommerceFaqE2E.test.js`.

## Injected failure

The test copies the migrated SQLite database into a temporary directory,
creates a published e-commerce run, and starts
`fdeEcommerceRestartWorker.js crash <runId>` as a separate process. When the
child prints `CHECKPOINT_WRITTEN`, the parent sends `SIGKILL`. This is a hard
process boundary: no finally block or in-memory workflow object can finish the
run.

At the crash boundary, the billable/nondeterministic LLM result has already
been stored in the checkpoint node output under the attempt token, but the
cursor has not advanced past the interrupted continuation.

## Fresh-process recovery

The parent then launches a new Node process with
`fdeEcommerceRestartWorker.js resume <runId>` against the same copied database.
The new process claims the expired/recoverable checkpoint through the Prisma
CAS protocol, reuses the attempt-token result instead of billing/re-generating,
advances the graph, and persists the JSON output artifact.

Assertions from the green test:

- run status: `succeeded`;
- checkpoint status: `completed`;
- output: `{answer, confidence, escalate}` matching the JSON Schema;
- one `application/json` download artifact;
- event types include `step`, `tool`, `cost`, `status`, and `artifact`;
- draft remains `published` with distinct author/reviewer/publisher IDs.

The test removes the temporary database after each run. No Mastra snapshot is
created; recovery relies only on Studio/Prisma state.
