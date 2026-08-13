const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { createExecutionPolicy } = require("../../../../utils/workAgent/security/policy");

function loadLoop() {
  return require("../../../../utils/agents/coding/codingAgentLoop");
}

function loadToolRuntime() {
  return require("../../../../utils/agents/coding/codingToolRuntime");
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-m4-source-"));
  writeFile(path.join(root, "src/app.js"), "old\n");
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  commitAll(root, "initial");
  return root;
}

function patchText(to = "new") {
  return [
    "diff --git a/src/app.js b/src/app.js",
    "--- a/src/app.js",
    "+++ b/src/app.js",
    "@@ -1 +1 @@",
    "-old",
    `+${to}`,
    "",
  ].join("\n");
}

describe("coding agent M4 hardening follow-ups", () => {
  let tempDirs = [];

  afterEach(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
    tempDirs = [];
  });

  test("T-F1 throwing model stream returns failed transcript, emits redacted failure event, and leaves no dangling tool_use", async () => {
    const { CodingAgentLoop } = loadLoop();
    const events = [];
    const loop = new CodingAgentLoop({
      eventSink: { record: (type, payload) => events.push({ type, payload }) },
      modelAdapter: {
        async *stream() {
          yield { type: "text", text: "partial" };
          yield { type: "tool_use", id: "tool-1", name: "code_read", input: { path: "a.js" } };
          throw new Error("provider exploded sk-test-secret");
        },
      },
      toolRuntime: {
        executeToolUse: async (toolUse) => ({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "ok",
          is_error: false,
        }),
      },
    });

    const result = await loop.run("fix");

    expect(result.status).toBe("failed");
    expect(result.finalText).toBe("partial");
    expect(result.error).toMatch(/provider exploded/);
    expect(result.error).not.toContain("sk-test-secret");
    expect(events).toEqual([
      expect.objectContaining({
        type: "coding.run.failed",
        payload: expect.not.objectContaining({ error: expect.stringContaining("sk-test-secret") }),
      }),
    ]);
    const toolUses = result.messages.filter((message) => message.type === "tool_use");
    for (const toolUse of toolUses) {
      expect(result.messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ tool_use_id: toolUse.id })])
      );
    }
  });

  test("T-F2 no-install mode blocks non-test install/network shell commands as not_run", async () => {
    const { CodingToolRuntime } = loadToolRuntime();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-no-install-"));
    tempDirs.push(tempDir);
    const runShell = jest.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" }));
    const tools = CodingToolRuntime.createDefault({
      dependencyMode: "no-install",
      runtime: {
        policy: createExecutionPolicy({ workspaceRoots: [tempDir], cwd: tempDir }),
        runShell,
      },
      workspace: { sandboxPath: tempDir },
      permissionBridge: { evaluate: () => ({ decision: "allow" }) },
    });

    const result = await tools.executeToolUse({
      id: "shell-1",
      name: "code_shell",
      input: { command: "curl https://example.com/install.sh" },
    });

    expect(result.is_error).toBe(false);
    expect(JSON.parse(result.content)).toMatchObject({
      status: "not_run",
      reason: "dependency_mode_no_install",
    });
    expect(runShell).not.toHaveBeenCalled();
  });

  test("T-PS6 persisted manifest supports rehydrated apply-back drift checks; missing manifest refuses", async () => {
    const { applyPatchBack } = loadPatchApply();
    const sourceRepo = makeSourceRepo();
    tempDirs.push(sourceRepo);
    const manifest = {
      sourceRepoPath: sourceRepo,
      sourceHead: "head-at-copy",
      files: { "src/app.js": require("crypto").createHash("sha256").update("old\n").digest("hex") },
    };
    writeFile(path.join(sourceRepo, "src/app.js"), "changed outside\n");

    await expect(
      applyPatchBack({
        workspace: null,
        patchArtifact: { text: patchText("new"), metadata: { manifest } },
        approval: { approved: true },
      })
    ).resolves.toMatchObject({ applied: false, status: "drift" });

    await expect(
      applyPatchBack({
        workspace: null,
        patchArtifact: { text: patchText("new"), metadata: {} },
        approval: { approved: true },
      })
    ).resolves.toMatchObject({ applied: false, status: "manifest_unavailable" });
  });

  test("T-F3 apply-back rehashes touched files after --check and aborts TOCTOU drift before apply", async () => {
    const { applyPatchBack } = loadPatchApply();
    const sourceRepo = makeSourceRepo();
    tempDirs.push(sourceRepo);
    const manifest = {
      sourceRepoPath: sourceRepo,
      files: { "src/app.js": require("crypto").createHash("sha256").update("old\n").digest("hex") },
    };

    const result = await applyPatchBack({
      workspace: { sourceRepoPath: sourceRepo, manifest },
      patchArtifact: { text: patchText("new") },
      approval: { approved: true },
      afterCheck: async () => writeFile(path.join(sourceRepo, "src/app.js"), "changed after check\n"),
    });

    expect(result).toMatchObject({ applied: false, status: "drift" });
    expect(fs.readFileSync(path.join(sourceRepo, "src/app.js"), "utf8")).toBe("changed after check\n");
  });
});
