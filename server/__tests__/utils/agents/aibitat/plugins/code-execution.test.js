const fs = require("fs");
const os = require("os");
const path = require("path");

const AgentPlugins = require("../../../../../utils/agents/aibitat/plugins");
const {
  evaluateToolCall,
  PermissionMode,
} = require("../../../../../utils/permissions");

function installTool(plugin, aibitat) {
  const functions = new Map();
  const fakeAibitat = {
    handlerProps: {
      workspaceId: 7,
      workspace: { id: 7, slug: "code-tools-test" },
      log: jest.fn(),
    },
    function(fn) {
      functions.set(fn.name, fn);
      return this;
    },
    ...(aibitat || {}),
  };

  plugin.plugin().setup(fakeAibitat);
  return { aibitat: fakeAibitat, fn: functions.get(plugin.name) };
}

describe("AIbitat code execution tools", () => {
  let tempDir;
  let originalStorageDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alata-code-tools-"));
    originalStorageDir = process.env.STORAGE_DIR;
    process.env.STORAGE_DIR = tempDir;
  });

  afterEach(() => {
    if (originalStorageDir === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = originalStorageDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function parse(result) {
    return JSON.parse(result);
  }

  it("registers all code_* tools as loadable AIbitat plugins", () => {
    for (const name of [
      "code_read",
      "code_write",
      "code_edit",
      "code_grep",
      "code_patch",
      "code_shell",
    ]) {
      expect(AgentPlugins[name]).toBeTruthy();
      expect(typeof AgentPlugins[name].plugin).toBe("function");
    }
  });

  it("reads, writes, greps, and returns a unified patch inside the workspace sandbox", async () => {
    const sharedAibitat = {
      handlerProps: {
        workspaceId: 7,
        workspace: { id: 7, slug: "patchable" },
        log: jest.fn(),
      },
      function(fn) {
        this.functions.set(fn.name, fn);
        return this;
      },
      functions: new Map(),
    };

    for (const plugin of [
      AgentPlugins.code_write,
      AgentPlugins.code_read,
      AgentPlugins.code_grep,
      AgentPlugins.code_edit,
      AgentPlugins.code_patch,
    ]) {
      plugin.plugin().setup(sharedAibitat);
    }

    const write = sharedAibitat.functions.get("code_write");
    const read = sharedAibitat.functions.get("code_read");
    const grep = sharedAibitat.functions.get("code_grep");
    const edit = sharedAibitat.functions.get("code_edit");
    const patch = sharedAibitat.functions.get("code_patch");

    expect(
      parse(
        await write.handler.call(write, {
          path: "src/app.js",
          content: "hello old\n",
        })
      ).success
    ).toBe(true);
    expect(
      parse(await read.handler.call(read, { path: "src/app.js" })).content
    ).toBe("hello old\n");

    await edit.handler.call(edit, {
      path: "src/app.js",
      findText: "old",
      replaceText: "new",
    });
    expect(
      parse(await grep.handler.call(grep, { pattern: "new" })).results
    ).toEqual([expect.objectContaining({ path: "src/app.js", line: 1 })]);

    const patchResult = parse(await patch.handler.call(patch, {}));
    expect(patchResult.patch.format).toBe("unified_diff");
    expect(patchResult.patch.text).toContain(
      "diff --git a/src/app.js b/src/app.js"
    );
    expect(patchResult.patch.text).toContain("+hello new");
  });

  it("refuses traversal outside the workspace sandbox", async () => {
    const { fn } = installTool(AgentPlugins.code_write);
    const result = parse(
      await fn.handler.call(fn, { path: "../escape.txt", content: "nope" })
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not under an allowed workspace root/);
    expect(fs.existsSync(path.join(tempDir, "escape.txt"))).toBe(false);
  });

  it("uses DB configured code execution root before storage/env fallback", async () => {
    jest.resetModules();
    const dbRoot = path.join(tempDir, "db-root");
    fs.mkdirSync(dbRoot, { recursive: true });

    let result;
    await jest.isolateModulesAsync(async () => {
      jest.doMock("../../../../../utils/workAgent/settings", () => ({
        WORK_AGENT_SETTINGS: { codeExecutionRoot: "ALATA_CODE_EXECUTION_ROOT" },
        getWorkAgentSetting: jest.fn(async () => dbRoot),
      }));
      const { codeWrite } = require("../../../../../utils/agents/aibitat/plugins/code-execution");
      const { fn } = installTool(codeWrite);
      result = parse(
        await fn.handler.call(fn, { path: "from-db.txt", content: "ok" })
      );
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(dbRoot, "from-db.txt"), "utf8")).toBe(
      "ok"
    );
    jest.dontMock("../../../../../utils/workAgent/settings");
  });

  it("keeps write and shell tools behind the existing AIbitat permission gate", () => {
    expect(
      evaluateToolCall({
        toolName: "code_write",
        permissionMode: PermissionMode.DEFAULT,
        allowedTools: [],
        autoApprovedTools: [],
      }).decision
    ).toBe("require_confirmation");
    expect(
      evaluateToolCall({
        toolName: "code_shell",
        permissionMode: PermissionMode.DEFAULT,
        allowedTools: [],
        autoApprovedTools: [],
      }).decision
    ).toBe("require_confirmation");
    expect(
      evaluateToolCall({
        toolName: "code_read",
        permissionMode: PermissionMode.DEFAULT,
        allowedTools: [],
        autoApprovedTools: [],
      }).decision
    ).toBe("allow");
  });

  it("rejects obvious shell workspace escapes before spawning", async () => {
    const { fn } = installTool(AgentPlugins.code_shell);
    const result = parse(
      await fn.handler.call(fn, { command: "cat /etc/passwd" })
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/absolute filesystem paths are not allowed/);
  });
});
