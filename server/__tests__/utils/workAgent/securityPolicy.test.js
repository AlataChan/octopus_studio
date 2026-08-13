const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  createExecutionPolicy,
  resolveAllowedPath,
  buildShellEnv,
  redactSecrets,
} = require("../../../utils/workAgent/security/policy");

describe("work-agent security policy", () => {
  let tempDir;
  let workspaceRoot;
  let outsideRoot;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alata-work-agent-policy-"));
    workspaceRoot = path.join(tempDir, "workspace");
    outsideRoot = path.join(tempDir, "outside");
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(outsideRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("allows paths under an approved workspace root", () => {
    const policy = createExecutionPolicy({ workspaceRoots: [workspaceRoot] });

    expect(resolveAllowedPath(policy, "notes/todo.md")).toBe(
      path.join(fs.realpathSync.native(workspaceRoot), "notes/todo.md")
    );
  });

  it("rejects path traversal outside the approved root", () => {
    const policy = createExecutionPolicy({ workspaceRoots: [workspaceRoot] });

    expect(() => resolveAllowedPath(policy, "../outside/secrets.txt")).toThrow(
      /not under an allowed workspace root/
    );
  });

  it("rejects symlinks that escape the approved root", () => {
    const target = path.join(outsideRoot, "secrets.txt");
    const symlink = path.join(workspaceRoot, "linked-secret.txt");
    fs.writeFileSync(target, "secret", "utf8");
    fs.symlinkSync(target, symlink);
    const policy = createExecutionPolicy({ workspaceRoots: [workspaceRoot] });

    expect(() => resolveAllowedPath(policy, "linked-secret.txt")).toThrow(
      /not under an allowed workspace root/
    );
  });

  it("builds a shell environment from an explicit allowlist only", () => {
    const env = buildShellEnv({
      PATH: "/usr/bin",
      HOME: "/Users/test",
      OPEN_AI_KEY: "should-not-leak",
      CUSTOM_SAFE: "yes",
    }, ["PATH", "CUSTOM_SAFE"]);

    expect(env).toEqual({ PATH: "/usr/bin", CUSTOM_SAFE: "yes" });
  });

  it("redacts secrets from audit output", () => {
    const text = [
      "OPEN_AI_KEY=sk-live-secret",
      "Authorization: Bearer abc.def.ghi",
      "regular output",
    ].join("\n");

    expect(redactSecrets(text)).toContain("OPEN_AI_KEY=[REDACTED]");
    expect(redactSecrets(text)).toContain("Authorization: Bearer [REDACTED]");
    expect(redactSecrets(text)).toContain("regular output");
  });
});
