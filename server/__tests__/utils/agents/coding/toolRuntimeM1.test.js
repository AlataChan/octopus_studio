const fs = require("fs");
const os = require("os");
const path = require("path");

const { RiskLevel } = require("../../../../utils/permissions/constants");
const { LocalExecutionRuntime } = require("../../../../utils/workAgent/tools/localExecution");
const { createExecutionPolicy } = require("../../../../utils/workAgent/security/policy");

function loadToolRuntime() {
  return require("../../../../utils/agents/coding/codingToolRuntime");
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function allowBridge() {
  return { evaluate: () => ({ decision: "allow", reason: "test allow" }) };
}

function makeRuntime(root, policy = {}) {
  return new LocalExecutionRuntime({
    policy: createExecutionPolicy({
      workspaceRoots: [root],
      cwd: root,
      ...policy,
    }),
  });
}

describe("coding tool runtime M1 tools", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-tools-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("T-T1 each M1 tool is registered with correct risk and output is capped and redacted", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    writeFile(
      path.join(tempDir, "secret.txt"),
      `OPENAI_API_KEY=sk-1234567890abcdef\n${"x".repeat(300)}`
    );
    const runtime = makeRuntime(tempDir);
    await runtime.captureWorkspaceBaseline();
    const tools = CodingToolRuntime.createDefault({
      runtime,
      workspace: { sandboxPath: tempDir },
      permissionBridge: allowBridge(),
      outputCapBytes: 140,
    });

    const risks = Object.fromEntries(
      tools.getToolDescriptors().map((tool) => [tool.name, tool.riskLevel])
    );
    expect(risks).toEqual({
      code_read: RiskLevel.SAFE_READ,
      code_grep: RiskLevel.SAFE_READ,
      code_write: RiskLevel.WRITE,
      code_edit: RiskLevel.WRITE,
      code_shell: RiskLevel.EXECUTE,
      code_patch: RiskLevel.SAFE_READ,
      code_apply_patch: RiskLevel.WRITE,
      code_list: RiskLevel.SAFE_READ,
      code_status: RiskLevel.SAFE_READ,
    });

    const result = await tools.executeToolUse({
      id: "read-secret",
      name: "code_read",
      input: { path: "secret.txt" },
    });

    expect(result.is_error).toBe(false);
    expect(result.content).toContain("[REDACTED]");
    expect(result.content).not.toContain("sk-1234567890abcdef");
    expect(Buffer.byteLength(result.content)).toBeLessThanOrEqual(180);
    expect(result.content).toContain("truncated");
  });

  test("T-D1 no-install reports dependency-backed test commands as not run without failing the run", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    const runtime = makeRuntime(tempDir, { shellApprovalRequired: false });
    const tools = CodingToolRuntime.createDefault({
      runtime,
      workspace: { sandboxPath: tempDir },
      permissionBridge: allowBridge(),
      dependencyMode: "no-install",
    });

    const result = await tools.executeToolUse({
      id: "test-command",
      name: "code_shell",
      input: { command: "npm test" },
    });

    expect(result.is_error).toBe(false);
    expect(JSON.parse(result.content)).toMatchObject({
      status: "not_run",
      command: "npm test",
      reason: "dependency_mode_no_install",
    });
    expect(tools.getCommandHistory()).toEqual([
      expect.objectContaining({ command: "npm test", status: "not_run" }),
    ]);
  });
});
