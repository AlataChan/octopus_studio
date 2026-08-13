const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { PermissionMode } = require("../../../../utils/permissions/constants");

function loadFakeModel() {
  return require("../../../../utils/agents/coding/__fixtures__/fakeModel");
}

function loadAdapter() {
  return require("../../../../utils/agents/coding/codingModelAdapter");
}

function loadToolRuntime() {
  return require("../../../../utils/agents/coding/codingToolRuntime");
}

function loadLoop() {
  return require("../../../../utils/agents/coding/codingAgentLoop");
}

function loadSession() {
  return require("../../../../utils/agents/coding/codingSession");
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-m1-source-"));
  writeFile(path.join(root, "src/math.js"), "export function answer() {\n  return 1;\n}\n");
  writeFile(path.join(root, "README.md"), "fixture\n");
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

function fileHashes(root) {
  const hashes = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
        hashes[relativePath] = crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
      }
    }
  }
  walk(root);
  return hashes;
}

async function createSession(tempDir, sourceRepo, runId = "run-m1") {
  const { CodingSession } = loadSession();
  return CodingSession.create({
    sourceRepoPath: sourceRepo,
    runId,
    storageRoot: path.join(tempDir, "storage"),
    allowedSourceRoots: [sourceRepo],
    policy: { shellApprovalRequired: false },
  });
}

function createLoop({ modelTurns, toolRuntime, maxTurns = 20 }) {
  const { createFakeModel } = loadFakeModel();
  const { CodingModelAdapter } = loadAdapter();
  const { CodingAgentLoop } = loadLoop();
  return new CodingAgentLoop({
    modelAdapter: new CodingModelAdapter({ model: createFakeModel(modelTurns) }),
    toolRuntime,
    maxTurns,
  });
}

describe("coding loop and session M1 behavior", () => {
  let tempDir;
  let sourceRepo;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-m1-"));
    sourceRepo = makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(sourceRepo, { recursive: true, force: true });
  });

  test("T-L1 loop drives read edit patch final on a fixture bug-fix", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    const session = await createSession(tempDir, sourceRepo, "run-l1");
    const toolRuntime = CodingToolRuntime.createDefault({
      runtime: session.runtime,
      workspace: session.workspace,
      permissionBridge: {
        evaluate: () => ({ decision: "allow", reason: "test allow" }),
      },
    });
    const loop = createLoop({
      toolRuntime,
      modelTurns: [
        [
          { type: "tool_use", id: "read-1", name: "code_read", input: { path: "src/math.js" } },
          { type: "stop_reason", stop_reason: "tool_use" },
        ],
        [
          {
            type: "tool_use",
            id: "edit-1",
            name: "code_edit",
            input: { path: "src/math.js", findText: "return 1;", replaceText: "return 2;" },
          },
          { type: "stop_reason", stop_reason: "tool_use" },
        ],
        [
          { type: "tool_use", id: "patch-1", name: "code_patch", input: {} },
          { type: "stop_reason", stop_reason: "tool_use" },
        ],
        [{ type: "text", text: "Changed the answer." }, { type: "stop_reason", stop_reason: "end_turn" }],
      ],
    });

    const result = await loop.run("fix the answer");

    expect(result.status).toBe("completed");
    expect(fs.readFileSync(path.join(session.workspace.sandboxPath, "src/math.js"), "utf8")).toContain("return 2;");
    const patchResult = result.messages.find((message) => message.tool_use_id === "patch-1");
    expect(patchResult.content).toContain("-  return 1;");
    expect(patchResult.content).toContain("+  return 2;");
    expect(result.finalText).toContain("Changed the answer.");
  });

  test("T-L2 invalid tool becomes an error and the loop recovers", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    const session = await createSession(tempDir, sourceRepo, "run-l2");
    const toolRuntime = CodingToolRuntime.createDefault({
      runtime: session.runtime,
      workspace: session.workspace,
    });
    const loop = createLoop({
      toolRuntime,
      modelTurns: [
        [
          { type: "tool_use", id: "bad-1", name: "does_not_exist", input: {} },
          { type: "stop_reason", stop_reason: "tool_use" },
        ],
        [{ type: "text", text: "Recovered after tool error." }, { type: "stop_reason", stop_reason: "end_turn" }],
      ],
    });

    const result = await loop.run("recover");
    const failedTool = result.messages.find((message) => message.tool_use_id === "bad-1");

    expect(failedTool).toMatchObject({ is_error: true });
    expect(result.status).toBe("completed");
    expect(result.finalText).toContain("Recovered");
  });

  test("T-L3 max-turns stops the loop even when cost metadata is absent", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    const session = await createSession(tempDir, sourceRepo, "run-l3");
    const toolRuntime = CodingToolRuntime.createDefault({
      runtime: session.runtime,
      workspace: session.workspace,
    });
    const loop = createLoop({
      toolRuntime,
      maxTurns: 2,
      modelTurns: [
        [
          { type: "tool_use", id: "status-1", name: "code_status", input: {} },
          { type: "stop_reason", stop_reason: "tool_use" },
        ],
        [
          { type: "tool_use", id: "status-2", name: "code_status", input: {} },
          { type: "stop_reason", stop_reason: "tool_use" },
        ],
        [{ type: "text", text: "should not reach" }, { type: "stop_reason", stop_reason: "end_turn" }],
      ],
    });

    const result = await loop.run("loop");

    expect(result.status).toBe("max_turns");
    expect(result.turns).toBe(2);
    expect(result.finalText).not.toContain("should not reach");
  });

  test("T-L4 final answer distinguishes verified from unverified changes", async () => {
    const session = await createSession(tempDir, sourceRepo, "run-l4");
    await session.runtime.writeFile("src/math.js", "export function answer() {\n  return 2;\n}\n");

    const verified = await session.finalizeRun({
      loopResult: { status: "completed", finalText: "Changed answer.", messages: [] },
      commandHistory: [{ command: "npm test", status: "passed", exitCode: 0 }],
    });
    const unverified = await session.finalizeRun({
      loopResult: { status: "completed", finalText: "Changed answer.", messages: [] },
      commandHistory: [{ command: "npm test", status: "not_run" }],
    });

    expect(verified.finalAnswer).toContain("Verified changes");
    expect(verified.finalAnswer).not.toContain("Unverified changes");
    expect(unverified.finalAnswer).toContain("Unverified changes");
    expect(unverified.finalAnswer).toContain("npm test");
    expect(verified.patchArtifact.text).toContain("+  return 2;");
  });

  test("T-I1 integration leaves the source repo byte-for-byte unchanged after a full autonomous run", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    const before = fileHashes(sourceRepo);
    const session = await createSession(tempDir, sourceRepo, "run-i1");
    const toolRuntime = CodingToolRuntime.createDefault({
      runtime: session.runtime,
      workspace: session.workspace,
      permissionBridge: {
        evaluate: () => ({ decision: "allow", reason: "test allow" }),
      },
    });
    const loop = createLoop({
      toolRuntime,
      modelTurns: [
        [
          { type: "tool_use", id: "read-i1", name: "code_read", input: { path: "src/math.js" } },
          { type: "stop_reason", stop_reason: "tool_use" },
        ],
        [
          {
            type: "tool_use",
            id: "edit-i1",
            name: "code_edit",
            input: { path: "src/math.js", findText: "return 1;", replaceText: "return 2;" },
          },
          { type: "stop_reason", stop_reason: "tool_use" },
        ],
        [{ type: "text", text: "Ready for review." }, { type: "stop_reason", stop_reason: "end_turn" }],
      ],
    });

    const loopResult = await loop.run("fix");
    const final = await session.finalizeRun({
      loopResult,
      commandHistory: toolRuntime.getCommandHistory(),
    });

    expect(fileHashes(sourceRepo)).toEqual(before);
    expect(fs.readFileSync(path.join(sourceRepo, "src/math.js"), "utf8")).toContain("return 1;");
    expect(final.patchArtifact.text).toContain("+  return 2;");
    expect(final.finalAnswer).toContain("Unverified changes");
  });
});
