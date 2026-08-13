const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { RiskLevel } = require("../../../../utils/permissions/constants");
const { createExecutionPolicy } = require("../../../../utils/workAgent/security/policy");

function loadToolRuntime() {
  return require("../../../../utils/agents/coding/codingToolRuntime");
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function gitCommit(root) {
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
}

function fakeRuntime(root, runShellImpl) {
  return {
    policy: createExecutionPolicy({
      workspaceRoots: [root],
      cwd: root,
      shellApprovalRequired: true,
    }),
    runShell: runShellImpl,
  };
}

describe("coding tool runtime M2 approvals and patching", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-m2-tools-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("T-R4 install/network shell commands classify as EXTERNAL and other shell as EXECUTE; both require approval", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    const seen = [];
    const tools = CodingToolRuntime.createDefault({
      runtime: fakeRuntime(tempDir, async () => {
        throw new Error("must not run without approval");
      }),
      workspace: { sandboxPath: tempDir },
      dependencyMode: "install-in-sandbox",
      permissionBridge: {
        evaluate: (tool) => {
          seen.push({ name: tool.name, riskLevel: tool.riskLevel });
          return { decision: "require_confirmation", reason: "approval needed" };
        },
      },
    });

    const install = await tools.executeToolUse({
      id: "install",
      name: "code_shell",
      input: { command: "npm install" },
    });
    const local = await tools.executeToolUse({
      id: "local",
      name: "code_shell",
      input: { command: "node scripts/check.js" },
    });

    expect(seen).toEqual([
      { name: "code_shell", riskLevel: RiskLevel.EXTERNAL },
      { name: "code_shell", riskLevel: RiskLevel.EXECUTE },
    ]);
    expect(JSON.parse(install.content)).toMatchObject({
      status: "approval_required",
      riskLevel: RiskLevel.EXTERNAL,
    });
    expect(JSON.parse(local.content)).toMatchObject({
      status: "approval_required",
      riskLevel: RiskLevel.EXECUTE,
    });
  });

  test("T-shell-approval only passes approved true to runShell after durable approval and emits approval-required event", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    const runShellCalls = [];
    const events = [];
    const tools = CodingToolRuntime.createDefault({
      runtime: fakeRuntime(tempDir, async (command, options) => {
        runShellCalls.push({ command, options });
        return { exitCode: 0, stdout: "ok\n", stderr: "", timedOut: false, aborted: false };
      }),
      workspace: { sandboxPath: tempDir },
      dependencyMode: "install-in-sandbox",
      permissionBridge: {
        evaluate: () => ({ decision: "require_confirmation", reason: "needs user" }),
      },
      eventSink: {
        record: (type, payload) => events.push({ type, payload }),
      },
    });

    const pending = await tools.executeToolUse({
      id: "shell-1",
      name: "code_shell",
      input: { command: "echo ok" },
    });
    const pendingPayload = JSON.parse(pending.content);

    expect(runShellCalls).toEqual([]);
    expect(pending).toMatchObject({ is_error: true, reason: "approval_required" });
    expect(pendingPayload).toMatchObject({ status: "approval_required", command: "echo ok" });
    expect(events).toEqual([
      expect.objectContaining({
        type: "coding.tool.approval_required",
        payload: expect.objectContaining({ approvalId: pendingPayload.approvalId }),
      }),
    ]);

    const resumed = await tools.resumeApprovedToolUse(pendingPayload.approvalId, {
      approved: true,
      approvedBy: "tester",
    });

    expect(resumed.is_error).toBe(false);
    expect(runShellCalls).toEqual([
      { command: "echo ok", options: { approved: true } },
    ]);
  });

  test("T-AP1 code_apply_patch applies unified diff in-sandbox via git apply check and 3way", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    writeFile(path.join(tempDir, "src/app.js"), "old\n");
    gitCommit(tempDir);
    const { LocalExecutionRuntime } = require("../../../../utils/workAgent/tools/localExecution");
    const runtime = new LocalExecutionRuntime({
      policy: createExecutionPolicy({ workspaceRoots: [tempDir], cwd: tempDir }),
    });
    const tools = CodingToolRuntime.createDefault({
      runtime,
      workspace: { sandboxPath: tempDir },
      permissionBridge: { evaluate: () => ({ decision: "allow", reason: "test" }) },
    });

    const patch = [
      "diff --git a/src/app.js b/src/app.js",
      "--- a/src/app.js",
      "+++ b/src/app.js",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "",
    ].join("\n");

    const result = await tools.executeToolUse({
      id: "apply-1",
      name: "code_apply_patch",
      input: { patch },
    });

    expect(result.is_error).toBe(false);
    expect(JSON.parse(result.content)).toMatchObject({ applied: true });
    expect(fs.readFileSync(path.join(tempDir, "src/app.js"), "utf8")).toBe("new\n");
  });

  test("T-D2 install-in-sandbox install commands are gated behind EXTERNAL approval before execution", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    const runShellCalls = [];
    const tools = CodingToolRuntime.createDefault({
      runtime: fakeRuntime(tempDir, async (command, options) => {
        runShellCalls.push({ command, options });
        return { exitCode: 0, stdout: "", stderr: "", timedOut: false, aborted: false };
      }),
      workspace: { sandboxPath: tempDir },
      dependencyMode: "install-in-sandbox",
      permissionBridge: {
        evaluate: () => ({ decision: "require_confirmation", reason: "network install" }),
      },
    });

    const pending = await tools.executeToolUse({
      id: "install-1",
      name: "code_shell",
      input: { command: "pnpm install" },
    });
    const approvalId = JSON.parse(pending.content).approvalId;
    expect(JSON.parse(pending.content)).toMatchObject({
      status: "approval_required",
      riskLevel: RiskLevel.EXTERNAL,
    });
    expect(runShellCalls).toEqual([]);

    await tools.resumeApprovedToolUse(approvalId, { approved: true });

    expect(runShellCalls).toEqual([
      { command: "pnpm install", options: { approved: true } },
    ]);
    expect(tools.getCommandHistory()).toEqual([
      expect.objectContaining({ command: "pnpm install", status: "passed" }),
    ]);
  });
});
