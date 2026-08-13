const fs = require("fs");
const os = require("os");
const path = require("path");

describe("octopus-kb audit log", () => {
  it("appends redacted curation audit events as JSONL", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-kb-audit-"));
    const { appendAuditEvent, auditLogPath } = require("../../utils/octopusKb/audit");

    await appendAuditEvent(
      {
        workspaceId: 7,
        slug: "workspace-a",
        stage: "propose",
        status: "completed",
        path: "raw/a.md",
        result: {
          proposalPath: "proposals/a.json",
          apiKey: "sk-secret",
          nested: { KB_LLM_API_KEY: "another-secret" },
        },
      },
      { root }
    );

    const file = auditLogPath("workspace-a", { root });
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]);
    expect(event).toEqual(
      expect.objectContaining({
        workspaceId: 7,
        slug: "workspace-a",
        stage: "propose",
        status: "completed",
        path: "raw/a.md",
      })
    );
    expect(event.result.apiKey).toBe("[REDACTED]");
    expect(event.result.nested.KB_LLM_API_KEY).toBe("[REDACTED]");
  });

  it("records propose, validate, and apply outcomes in append order", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-kb-audit-"));
    const { appendAuditEvent, auditLogPath } = require("../../utils/octopusKb/audit");

    await appendAuditEvent(
      { workspaceId: 7, slug: "workspace-a", stage: "propose", status: "completed" },
      { root }
    );
    await appendAuditEvent(
      { workspaceId: 7, slug: "workspace-a", stage: "validate", status: "deferred" },
      { root }
    );
    await appendAuditEvent(
      { workspaceId: 7, slug: "workspace-a", stage: "apply", status: "applied" },
      { root }
    );

    const events = fs
      .readFileSync(auditLogPath("workspace-a", { root }), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(events.map((event) => [event.stage, event.status])).toEqual([
      ["propose", "completed"],
      ["validate", "deferred"],
      ["apply", "applied"],
    ]);
  });
});
