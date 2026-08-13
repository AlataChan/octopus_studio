const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");

const {
  LocalExecutionRuntime,
  ExecutionApprovalRequiredError,
} = require("../../../utils/workAgent/tools/localExecution");
const { createExecutionPolicy } = require("../../../utils/workAgent/security/policy");

describe("LocalExecutionRuntime", () => {
  let tempDir;
  let workspaceRoot;
  let events;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alata-work-agent-runtime-"));
    workspaceRoot = path.join(tempDir, "workspace");
    fs.mkdirSync(workspaceRoot, { recursive: true });
    events = [];
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.OPEN_AI_KEY;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function runtime(overrides = {}) {
    const { policy: policyOverrides = {}, ...runtimeOverrides } = overrides;
    return new LocalExecutionRuntime({
      policy: createExecutionPolicy({
        workspaceRoots: [workspaceRoot],
        shellTimeoutMs: 200,
        maxOutputBytes: 80,
        ...policyOverrides,
      }),
      audit: async (type, payload) => events.push({ type, payload }),
      ...runtimeOverrides,
    });
  }

  function mockChild({ pid = 1234 } = {}) {
    const child = new EventEmitter();
    child.pid = pid;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();
    return child;
  }

  async function waitForSpawn(spawnFn) {
    for (let i = 0; i < 50; i++) {
      if (spawnFn.mock.calls.length) return;
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("spawn was not called");
  }

  it("refuses file writes outside approved workspace roots", async () => {
    await expect(
      runtime().writeFile("../outside.txt", "nope")
    ).rejects.toThrow(/not under an allowed workspace root/);
  });

  it("writes, reads, edits, greps, and creates patch artifacts inside the root", async () => {
    const agentRuntime = runtime();

    await agentRuntime.writeFile("notes.txt", "hello\nold\n", { overwrite: true });
    expect(await agentRuntime.readFile("notes.txt")).toContain("old");

    await agentRuntime.editFile("notes.txt", "old", "new");
    expect(await agentRuntime.grep("new")).toEqual([
      expect.objectContaining({ path: "notes.txt", line: 2, text: "new" }),
    ]);

    const patch = await agentRuntime.createPatch();
    expect(patch.text).toContain("notes.txt");
    expect(patch.text).toContain("+hello");
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["tool.call", "tool.result"])
    );
  });

  it("creates unified diffs against the baseline captured before tool edits", async () => {
    fs.writeFileSync(path.join(workspaceRoot, "notes.txt"), "hello\nold\n", "utf8");
    const agentRuntime = runtime();

    await agentRuntime.editFile("notes.txt", "old", "new");
    const patch = await agentRuntime.createPatch();

    expect(patch.format).toBe("unified_diff");
    expect(patch.text).toContain("diff --git a/notes.txt b/notes.txt");
    expect(patch.text).toContain("--- a/notes.txt");
    expect(patch.text).toContain("+++ b/notes.txt");
    expect(patch.text).toContain("-old");
    expect(patch.text).toContain("+new");
    expect(patch.text).not.toContain("--- /dev/null");
  });

  it("requires approval before running shell commands by default", async () => {
    await expect(runtime().runShell("echo denied")).rejects.toBeInstanceOf(
      ExecutionApprovalRequiredError
    );
  });

  it("runs approved shell commands with a scrubbed environment", async () => {
    process.env.OPEN_AI_KEY = "sk-should-not-leak";
    const result = await runtime({
      policy: {
        shellApprovalRequired: false,
        shellTimeoutMs: 3_000,
        envAllowlist: ["PATH"],
      },
    }).runShell(`${process.execPath} -e "console.log(process.env.OPEN_AI_KEY || 'missing')"`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("missing");
  });

  it("kills shell commands that exceed the timeout", async () => {
    const result = await runtime({
      policy: { shellApprovalRequired: false, shellTimeoutMs: 300 },
    }).runShell(`${process.execPath} -e "setTimeout(() => console.log('late'), 10000)"`);

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(null);
  });

  it("caps shell output and records that truncation happened", async () => {
    const result = await runtime({
      policy: {
        shellApprovalRequired: false,
        shellTimeoutMs: 3_000,
        maxOutputBytes: 40,
      },
    }).runShell(`${process.execPath} -e "console.log('x'.repeat(200))"`);

    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(40);
  });

  it("resolves with a failed shell result when spawn emits an error", async () => {
    const child = mockChild();
    const spawnFn = jest.fn(() => child);
    const resultPromise = runtime({
      policy: { shellApprovalRequired: false },
      spawnFn,
    }).runShell("not-a-real-command");

    await waitForSpawn(spawnFn);
    child.emit("error", new Error("spawn failed"));
    const result = await resultPromise;

    expect(result.exitCode).toBe(null);
    expect(result.spawnError).toBe("spawn failed");
    expect(result.stderr).toContain("spawn failed");
  });

  it("escalates timed-out shell processes from SIGTERM to SIGKILL", async () => {
    jest.useFakeTimers();
    const child = mockChild({ pid: 4321 });
    const spawnFn = jest.fn(() => child);
    const killProcessGroup = jest.fn();
    const agentRuntime = runtime({
      policy: {
        shellApprovalRequired: false,
        shellTimeoutMs: 5,
        shellKillGraceMs: 10,
      },
      spawnFn,
      killProcessGroup,
    });
    agentRuntime.workspaceBaselineCaptured = true;

    const resultPromise = agentRuntime.runShell("sleep forever");

    await Promise.resolve();
    await Promise.resolve();
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(killProcessGroup).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(5);
    expect(killProcessGroup).toHaveBeenCalledWith(4321, "SIGTERM");

    await jest.advanceTimersByTimeAsync(10);
    expect(killProcessGroup).toHaveBeenCalledWith(4321, "SIGKILL");

    child.emit("close", null, "SIGKILL");
    const result = await resultPromise;
    expect(result.timedOut).toBe(true);
    expect(result.signal).toBe("SIGKILL");
  });

  it("kills the shell process group when the run abort signal fires", async () => {
    const child = mockChild({ pid: 8765 });
    const spawnFn = jest.fn(() => child);
    const killProcessGroup = jest.fn();
    const controller = new AbortController();
    const resultPromise = runtime({
      policy: { shellApprovalRequired: false, shellKillGraceMs: 100 },
      spawnFn,
      killProcessGroup,
      signal: controller.signal,
    }).runShell("sleep forever");

    await waitForSpawn(spawnFn);
    controller.abort();
    expect(killProcessGroup).toHaveBeenCalledWith(8765, "SIGTERM");

    child.emit("close", null, "SIGTERM");
    const result = await resultPromise;
    expect(result.aborted).toBe(true);
    expect(result.signal).toBe("SIGTERM");
  });
});
