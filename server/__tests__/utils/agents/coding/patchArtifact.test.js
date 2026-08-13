const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  LocalExecutionRuntime,
} = require("../../../../utils/workAgent/tools/localExecution");
const { createExecutionPolicy } = require("../../../../utils/workAgent/security/policy");

function loadSandboxWorkspace() {
  return require("../../../../utils/agents/coding/sandboxWorkspace");
}

function loadPatchArtifact() {
  return require("../../../../utils/agents/coding/patchArtifact");
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-patch-source-"));
  writeFile(path.join(root, "src/index.js"), "console.log('hello');\n");
  writeFile(path.join(root, "src/remove.js"), "remove me\n");
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
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
      "initial",
    ],
    { cwd: root, stdio: "ignore" }
  );
  return root;
}

describe("patchArtifact M0 contract", () => {
  let tempDir;
  let sourceRepo;
  let storageRoot;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-patch-"));
    sourceRepo = makeTempRepo();
    storageRoot = path.join(tempDir, "storage");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(sourceRepo, { recursive: true, force: true });
  });

  async function gitWorkspace(runId = "run-patch") {
    const { createSandboxWorkspace } = loadSandboxWorkspace();
    const workspace = await createSandboxWorkspace({
      sourceRepoPath: sourceRepo,
      runId,
      storageRoot,
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

  test("T-P2 baseline commit succeeds with no global git identity", async () => {
    const workspace = await gitWorkspace("run-p2");
    const head = execFileSync("git", ["-C", workspace.sandboxPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    expect(head).toMatch(/^[a-f0-9]{40}$/);
  });

  test("T-P3 untracked new file appears in patch", async () => {
    const { generatePatchArtifact } = loadPatchArtifact();
    const workspace = await gitWorkspace("run-p3");
    writeFile(path.join(workspace.sandboxPath, "src/new.js"), "new file\n");

    const patch = await generatePatchArtifact({ workspace });

    expect(patch.metadata.mode).toBe("git");
    expect(patch.text).toContain("diff --git a/src/new.js b/src/new.js");
    expect(patch.text).toContain("--- /dev/null");
    expect(patch.text).toContain("+new file");
  });

  test("T-P4 deleted file appears in patch", async () => {
    const { generatePatchArtifact } = loadPatchArtifact();
    const workspace = await gitWorkspace("run-p4");
    fs.rmSync(path.join(workspace.sandboxPath, "src/remove.js"));

    const patch = await generatePatchArtifact({ workspace });

    expect(patch.text).toContain("diff --git a/src/remove.js b/src/remove.js");
    expect(patch.text).toContain("+++ /dev/null");
    expect(patch.text).toContain("-remove me");
  });

  test("T-P5 binary or large file is skipped and not corrupted", async () => {
    const { generatePatchArtifact } = loadPatchArtifact();
    const workspace = await gitWorkspace("run-p5");
    writeFile(path.join(workspace.sandboxPath, "large.bin"), Buffer.alloc(300 * 1024, 1));

    const patch = await generatePatchArtifact({
      workspace,
      maxPatchFileBytes: 256 * 1024,
    });

    expect(patch.text).not.toContain("large.bin");
    expect(patch.metadata.skippedFiles).toContain("large.bin");
  });

  test("T-P6 renamed file is handled", async () => {
    const { generatePatchArtifact } = loadPatchArtifact();
    const workspace = await gitWorkspace("run-p6");
    fs.renameSync(
      path.join(workspace.sandboxPath, "src/index.js"),
      path.join(workspace.sandboxPath, "src/main.js")
    );

    const patch = await generatePatchArtifact({ workspace });

    expect(patch.text).toContain("rename from src/index.js");
    expect(patch.text).toContain("rename to src/main.js");
  });

  test("T-P7 git and baseline-map modes produce equivalent diffs for identical edits", async () => {
    const { generatePatchArtifact } = loadPatchArtifact();
    const gitModeWorkspace = await gitWorkspace("run-p7-git");
    const fallbackWorkspace = await gitWorkspace("run-p7-fallback");
    const runtime = new LocalExecutionRuntime({
      policy: createExecutionPolicy({ workspaceRoots: [fallbackWorkspace.sandboxPath] }),
    });

    await runtime.captureWorkspaceBaseline();
    writeFile(path.join(gitModeWorkspace.sandboxPath, "src/index.js"), "console.log('bye');\n");
    await runtime.writeFile("src/index.js", "console.log('bye');\n");

    const gitPatch = await generatePatchArtifact({ workspace: gitModeWorkspace });
    const fallbackPatch = await generatePatchArtifact({
      workspace: fallbackWorkspace,
      runtime,
      forceBaselineMap: true,
    });

    expect(gitPatch.metadata.mode).toBe("git");
    expect(fallbackPatch.metadata.mode).toBe("baseline-map");
    expect(gitPatch.text).toContain("-console.log('hello');");
    expect(gitPatch.text).toContain("+console.log('bye');");
    expect(fallbackPatch.text).toContain("-console.log('hello');");
    expect(fallbackPatch.text).toContain("+console.log('bye');");
  });
});
