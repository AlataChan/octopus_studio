const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function loadSandboxWorkspace() {
  return require("../../../../utils/agents/coding/sandboxWorkspace");
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function makeTempRepo(prefix = "octopus-coding-source-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  writeFile(path.join(root, "src/index.js"), "console.log('hello');\n");
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

describe("sandboxWorkspace M0 contract", () => {
  let tempDir;
  let sourceRepo;
  let storageRoot;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-workspace-"));
    sourceRepo = makeTempRepo();
    storageRoot = path.join(tempDir, "storage");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(sourceRepo, { recursive: true, force: true });
  });

  test("T-W1 sandbox excludes git metadata, dependencies, and secret files", async () => {
    const { createSandboxWorkspace } = loadSandboxWorkspace();
    fs.mkdirSync(path.join(sourceRepo, "node_modules/pkg"), { recursive: true });
    writeFile(path.join(sourceRepo, "node_modules/pkg/index.js"), "module.exports = 1;");
    writeFile(path.join(sourceRepo, ".env"), "TOKEN=secret");
    writeFile(path.join(sourceRepo, "cert.pem"), "secret-cert");
    writeFile(path.join(sourceRepo, "private.key"), "secret-key");

    const workspace = await createSandboxWorkspace({
      sourceRepoPath: sourceRepo,
      runId: "run-w1",
      storageRoot,
      allowedSourceRoots: [sourceRepo],
    });

    expect(fs.existsSync(path.join(workspace.sandboxPath, ".git"))).toBe(false);
    expect(fs.existsSync(path.join(workspace.sandboxPath, "node_modules"))).toBe(false);
    expect(fs.existsSync(path.join(workspace.sandboxPath, ".env"))).toBe(false);
    expect(fs.existsSync(path.join(workspace.sandboxPath, "cert.pem"))).toBe(false);
    expect(fs.existsSync(path.join(workspace.sandboxPath, "private.key"))).toBe(false);
    expect(fs.existsSync(path.join(workspace.sandboxPath, "src/index.js"))).toBe(true);
  });

  test("T-W2 unauthorized source path is refused and sandbox path stays inside storage root", async () => {
    const { createSandboxWorkspace } = loadSandboxWorkspace();
    const unauthorized = makeTempRepo("octopus-coding-unauthorized-");

    await expect(
      createSandboxWorkspace({
        sourceRepoPath: unauthorized,
        runId: "run-w2-denied",
        storageRoot,
        allowedSourceRoots: [sourceRepo],
      })
    ).rejects.toThrow(/not authorized/i);

    const workspace = await createSandboxWorkspace({
      sourceRepoPath: sourceRepo,
      runId: "../escape",
      storageRoot,
      allowedSourceRoots: [sourceRepo],
    });
    expect(path.relative(storageRoot, workspace.sandboxPath)).not.toMatch(/^\.\./);
    expect(workspace.sandboxPath).toContain("escape");
    fs.rmSync(unauthorized, { recursive: true, force: true });
  });

  test("T-W3 disk-floor breach refuses before copy and concurrency cap is enforced", async () => {
    const { createSandboxWorkspace } = loadSandboxWorkspace();

    await expect(
      createSandboxWorkspace({
        sourceRepoPath: sourceRepo,
        runId: "run-w3-disk",
        storageRoot,
        allowedSourceRoots: [sourceRepo],
        minFreeBytes: Number.MAX_SAFE_INTEGER,
      })
    ).rejects.toThrow(/free space/i);

    await createSandboxWorkspace({
      sourceRepoPath: sourceRepo,
      runId: "run-w3-open",
      storageRoot,
      allowedSourceRoots: [sourceRepo],
      maxConcurrentSandboxes: 1,
    });

    await expect(
      createSandboxWorkspace({
        sourceRepoPath: sourceRepo,
        runId: "run-w3-over-cap",
        storageRoot,
        allowedSourceRoots: [sourceRepo],
        maxConcurrentSandboxes: 1,
      })
    ).rejects.toThrow(/concurrent sandbox/i);
  });

  test("T-W4 manifest records source HEAD and copied file hashes", async () => {
    const { createSandboxWorkspace } = loadSandboxWorkspace();

    const workspace = await createSandboxWorkspace({
      sourceRepoPath: sourceRepo,
      runId: "run-w4",
      storageRoot,
      allowedSourceRoots: [sourceRepo],
    });

    const expectedHead = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: sourceRepo,
      encoding: "utf8",
    }).trim();
    expect(workspace.manifest.sourceHead).toBe(expectedHead);
    expect(workspace.manifest.files["src/index.js"]).toMatch(/^[a-f0-9]{64}$/);
  });

  test("T-B1 initBaseline commits with no global git identity present", async () => {
    const { createSandboxWorkspace } = loadSandboxWorkspace();
    const workspace = await createSandboxWorkspace({
      sourceRepoPath: sourceRepo,
      runId: "run-b1",
      storageRoot,
      allowedSourceRoots: [sourceRepo],
    });

    await workspace.initBaseline({
      env: {
        ...process.env,
        HOME: path.join(tempDir, "empty-home"),
        XDG_CONFIG_HOME: path.join(tempDir, "empty-xdg"),
      },
    });

    const baseline = execFileSync("git", ["-C", workspace.sandboxPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    expect(baseline).toMatch(/^[a-f0-9]{40}$/);
  });
});
