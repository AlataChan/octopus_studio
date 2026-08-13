const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const SERVER_ROOT = path.resolve(__dirname, "../../..");
const SOURCE_DB = path.join(SERVER_ROOT, "storage", "anythingllm.db");
const SETUP = path.join(
  SERVER_ROOT,
  "__tests__",
  "fixtures",
  "fdeEcommerceSetup.js"
);
const WORKER = path.join(
  SERVER_ROOT,
  "__tests__",
  "fixtures",
  "fdeEcommerceRestartWorker.js"
);
const SPEC = require("../../fixtures/ecommerceFaqStudioSpec.json");

function payloadObject(value) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function capturedAuditSample(setup, resumed) {
  return {
    sample_kind: "captured_from_deterministic_e2e",
    source_test: "server/__tests__/utils/fde/ecommerceFaqE2E.test.js",
    workflow: {
      name: SPEC.workflow.name,
      schema_version: SPEC.schema_version,
      target_version: SPEC.target_version,
      source_ir_hash: SPEC.source_ir_hash,
    },
    draft: {
      id: resumed.draft.id,
      lineage_key: resumed.draft.lineageKey,
      revision: resumed.draft.revision,
      status: resumed.draft.status,
      state_version: resumed.draft.stateVersion,
      spec_digest: resumed.draft.specDigest,
      review_subject_digest: resumed.draft.reviewSubjectDigest,
      reviewed_subject_digest: resumed.draft.reviewedSubjectDigest,
      author_user_id: resumed.draft.createdByUserId,
      reviewer_user_id: resumed.draft.reviewedByUserId,
      publisher_user_id: resumed.draft.publishedByUserId,
    },
    run: {
      id: resumed.run.id,
      workspace_id: resumed.run.workspaceId,
      fde_workflow_draft_id: resumed.run.fdeWorkflowDraftId,
      engine: resumed.run.engine,
      status: resumed.run.status,
      event_seq: resumed.run.eventSeq,
    },
    checkpoint: {
      status: resumed.checkpoint.status,
      node_cursor: resumed.checkpoint.nodeCursor,
      state_version: resumed.checkpoint.stateVersion,
      attempt_token_present: Boolean(resumed.checkpoint.attemptToken),
    },
    artifacts: resumed.artifacts.map((artifact) => ({
      id: artifact.id,
      artifact_type: artifact.artifactType,
      mime_type: artifact.mimeType,
      size_bytes: artifact.sizeBytes,
      metadata: payloadObject(artifact.metadata),
    })),
    events: resumed.events.map((event) => ({
      seq: event.seq,
      type: event.type,
      payload: payloadObject(event.payload),
    })),
    fail_closed_checks: {
      missing_binding: setup.unboundPublishCode,
      unpublished_run: setup.unapprovedRunCode,
    },
    redaction:
      "Allowlisted persisted fields from synthetic test rows; no credentials or real customer data.",
  };
}

function runNode(script, args, env) {
  const output = execFileSync(process.execPath, [script, ...args], {
    cwd: SERVER_ROOT,
    env,
    encoding: "utf8",
  });
  return output
    .trim()
    .split("\n")
    .reverse()
    .find((line) => line.startsWith("{"));
}

function killAfterCheckpoint(env, runId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, "crash", runId], {
      cwd: SERVER_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`checkpoint timeout: ${stderr}`));
    }, 10_000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk) => {
      if (!chunk.toString().includes("CHECKPOINT_WRITTEN")) return;
      clearTimeout(timeout);
      child.kill("SIGKILL");
      child.once("close", () => resolve());
    });
    child.once("error", reject);
  });
}

describe("cross-border e-commerce Studio E2E", () => {
  let directory;
  let env;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "ecommerce-studio-e2e-"));
    const database = path.join(directory, "anythingllm.db");
    fs.copyFileSync(SOURCE_DB, database);
    env = {
      ...process.env,
      DATABASE_URL: `file:${database}`,
      STORAGE_DIR: directory,
      ECOMMERCE_E2E_SUFFIX: path.basename(directory).replace(/[^a-z0-9]/gi, ""),
    };
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("runs the structured FAQ through approval, SIGKILL, restart, resume, artifact, and audit", async () => {
    const setup = JSON.parse(runNode(SETUP, [], env));
    expect(setup.authoring.fdeFromTurnId).toContain("requirement");
    expect(setup.authoring.fdeToTurnId).toContain("compiled-ir");
    expect(setup.unboundPublishCode).toBe("STUDIO_BINDING_MISSING");
    expect(setup.unapprovedRunCode).toBe("STUDIO_RUN_PUBLISHED_REQUIRED");

    await killAfterCheckpoint(env, setup.runId);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const resumed = JSON.parse(runNode(WORKER, ["resume", setup.runId], env));

    expect(resumed.run.status).toBe("succeeded");
    expect(resumed.checkpoint.status).toBe("completed");
    expect(resumed.result.outputs.response).toEqual({
      answer:
        "Standard returns are accepted within 30 days when the item meets the workspace policy conditions.",
      confidence: "high",
      escalate: false,
    });
    expect(resumed.artifacts).toHaveLength(1);
    expect(resumed.artifacts[0]).toMatchObject({
      artifactType: "download_file",
      mimeType: "application/json",
    });
    expect(resumed.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["step", "tool", "cost", "status", "artifact"])
    );
    expect(resumed.draft).toMatchObject({
      status: "published",
      schemaVersion: "1.1",
      createdByUserId: 12,
      reviewedByUserId: 44,
      publishedByUserId: 55,
    });
    expect(JSON.parse(resumed.draft.diffJson).changes).toHaveLength(1);

    const audit = capturedAuditSample(setup, resumed);
    expect(audit.draft.review_subject_digest).toBe(
      audit.draft.reviewed_subject_digest
    );
    expect(audit.events.map((event) => event.seq)).toEqual(
      [...audit.events.map((event) => event.seq)].sort((a, b) => a - b)
    );
    if (process.env.FDE_ECOMMERCE_AUDIT_OUT) {
      fs.writeFileSync(
        path.resolve(process.env.FDE_ECOMMERCE_AUDIT_OUT),
        `${JSON.stringify(audit, null, 2)}\n`,
        "utf8"
      );
    }
  }, 30_000);
});
