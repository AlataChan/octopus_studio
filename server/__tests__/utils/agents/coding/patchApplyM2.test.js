const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function loadSandboxWorkspace() {
  return require("../../../../utils/agents/coding/sandboxWorkspace");
}

function loadPatchArtifact() {
  return require("../../../../utils/agents/coding/patchArtifact");
}

function loadPatchApply() {
  return require("../../../../utils/agents/coding/patchApply");
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function commitAll(root, message = "commit") {
  execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.local",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      message,
    ],
    { cwd: root, stdio: "ignore" }
  );
}

function makeSourceRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-apply-source-"));
  writeFile(path.join(root, "src/app.js"), "old\n");
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  commitAll(root, "initial");
  return root;
}

async function makeWorkspace(tempDir, sourceRepo, runId = "run-ab") {
  const { createSandboxWorkspace } = loadSandboxWorkspace();
  const workspace = await createSandboxWorkspace({
    sourceRepoPath: sourceRepo,
    runId,
    storageRoot: path.join(tempDir, "storage"),
    allowedSourceRoots: [sourceRepo],
  });
  await workspace.initBaseline({
    env: {
      ...process.env,
      HOME: path.join(tempDir, `${runId}-home`),
      XDG_CONFIG_HOME: path.join(tempDir, `${runId}-xdg`),
    },
  });
  return workspace;
}

async function patchFromSandbox(workspace, content = "new\n") {
  const { generatePatchArtifact } = loadPatchArtifact();
  writeFile(path.join(workspace.sandboxPath, "src/app.js"), content);
  return generatePatchArtifact({ workspace });
}

describe("patch apply-back M2 contract", () => {
  let tempDir;
  let sourceRepo;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-apply-"));
    sourceRepo = makeSourceRepo();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(sourceRepo, { recursive: true, force: true });
  });

  test("T-AB1 coding_patch_apply applies back after confirmation into a temp source repo", async () => {
    const { applyPatchBack } = loadPatchApply();
    const workspace = await makeWorkspace(tempDir, sourceRepo, "run-ab1");
    const patchArtifact = await patchFromSandbox(workspace, "new\n");

    const result = await applyPatchBack({
      workspace,
      patchArtifact,
      approval: { approved: true, approvedBy: "tester" },
    });

    expect(result).toMatchObject({ applied: true, status: "applied" });
    expect(fs.readFileSync(path.join(sourceRepo, "src/app.js"), "utf8")).toBe("new\n");
  });

  test("T-AB2 apply-back race guard refuses when touched source files changed post-copy", async () => {
    const { applyPatchBack } = loadPatchApply();
    const workspace = await makeWorkspace(tempDir, sourceRepo, "run-ab2");
    const patchArtifact = await patchFromSandbox(workspace, "new\n");
    writeFile(path.join(sourceRepo, "src/app.js"), "user changed\n");

    const result = await applyPatchBack({
      workspace,
      patchArtifact,
      approval: { approved: true },
    });

    expect(result).toMatchObject({ applied: false, status: "drift" });
    expect(result.driftedFiles).toContain("src/app.js");
    expect(fs.readFileSync(path.join(sourceRepo, "src/app.js"), "utf8")).toBe("user changed\n");
  });

  test("T-AB3 apply-back conflict is refused unless an explicit conflict policy is provided", async () => {
    const { applyPatchBack } = loadPatchApply();
    const workspace = await makeWorkspace(tempDir, sourceRepo, "run-ab3");
    const patchArtifact = {
      text: [
        "diff --git a/src/app.js b/src/app.js",
        "--- a/src/app.js",
        "+++ b/src/app.js",
        "@@ -1 +1 @@",
        "-missing context",
        "+new",
        "",
      ].join("\n"),
    };

    const result = await applyPatchBack({
      workspace,
      patchArtifact,
      approval: { approved: true },
    });

    expect(result.applied).toBe(false);
    expect(result.status).toBe("conflict");
    expect(result.reason).toMatch(/git apply --check/i);
    expect(fs.readFileSync(path.join(sourceRepo, "src/app.js"), "utf8")).toBe("old\n");
  });
});
