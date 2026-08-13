/**
 * Tests for attachAgentPlugins shared plugin loader (M0 Task 3)
 * Covers branch routing and parseCallOptions behavior.
 * Does NOT hit real models, real MCP, or real DB.
 */

// Mock heavy dependencies before requiring the module under test
jest.mock("../../../../utils/agents/aibitat/plugins", () => ({
  // A standard single plugin (function-based)
  webBrowsing: {
    name: "web-browsing",
    plugin: jest.fn(() => "webBrowsingPluginInstance"),
    startupConfig: {
      params: {
        apiKey: { required: false, default: null },
      },
    },
  },
  // A composite plugin (plugin is array)
  sqlAgent: {
    name: "sql-agent",
    plugin: [
      {
        name: "queryChild",
        plugin: jest.fn(() => "queryChildInstance"),
        startupConfig: { params: {} },
      },
    ],
  },
  // chatHistory is used elsewhere — include minimal stub
  chatHistory: {
    name: "chat-history",
    plugin: jest.fn(() => "chatHistoryInstance"),
    startupConfig: { params: {} },
  },
}));

jest.mock("../../../../utils/agentFlows", () => ({
  AgentFlows: {
    loadFlowPlugin: jest.fn(),
  },
}));

jest.mock("../../../../utils/MCP", () => {
  return jest.fn().mockImplementation(() => ({
    convertServerToolsToPlugins: jest.fn(),
  }));
});

jest.mock("../../../../utils/agents/imported", () => ({
  validateImportedPluginHandler: jest.fn(),
  loadPluginByHubId: jest.fn(),
}));

const {
  attachAgentPlugins,
  parseCallOptions,
} = require("../../../../utils/agents/runtime/attachAgentPlugins");
const { AgentFlows } = require("../../../../utils/agentFlows");
const AgentPlugins = require("../../../../utils/agents/aibitat/plugins");
const ImportedPlugin = require("../../../../utils/agents/imported");

// Jest resetMocks:true wipes implementations between tests; restore here.
beforeEach(() => {
  // single plugin
  AgentPlugins.webBrowsing.plugin.mockReturnValue("webBrowsingPluginInstance");
  // composite plugin child
  AgentPlugins.sqlAgent.plugin[0].plugin.mockReturnValue("queryChildInstance");
  // chatHistory stub
  AgentPlugins.chatHistory.plugin.mockReturnValue("chatHistoryInstance");
});

// ─── helpers ────────────────────────────────────────────────────────────────

function makeAibitat() {
  return {
    use: jest.fn(),
    agents: new Map([["@agent", { functions: [] }]]),
  };
}

// ─── parseCallOptions tests ──────────────────────────────────────────────────

describe("parseCallOptions", () => {
  test("returns empty object for empty config", () => {
    const result = parseCallOptions({}, {}, "testPlugin");
    expect(result).toEqual({});
  });

  test("uses provided arg value when present", () => {
    const config = { apiKey: { required: false, default: null } };
    const result = parseCallOptions({ apiKey: "my-key" }, config, "plugin");
    expect(result.apiKey).toBe("my-key");
  });

  test("falls back to definition.default when arg missing", () => {
    const config = { timeout: { required: false, default: 5000 } };
    const result = parseCallOptions({}, config, "plugin");
    expect(result.timeout).toBe(5000);
  });

  test("falls back to null when arg missing and no default", () => {
    const config = { optionalProp: { required: false } };
    const result = parseCallOptions({}, config, "plugin");
    expect(result.optionalProp).toBeNull();
  });

  test("skips required param and calls log when arg missing", () => {
    const log = jest.fn();
    const config = { secret: { required: true } };
    const result = parseCallOptions({}, config, "myPlugin", log);
    // required param missing → skipped (not included in callOpts)
    expect(result).not.toHaveProperty("secret");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("'secret' required parameter for 'myPlugin' plugin is missing")
    );
  });

  test("skips required param when value is null", () => {
    const log = jest.fn();
    const config = { secret: { required: true } };
    const result = parseCallOptions({ secret: null }, config, "myPlugin", log);
    expect(result).not.toHaveProperty("secret");
    expect(log).toHaveBeenCalled();
  });

  test("includes required param when value is provided", () => {
    const log = jest.fn();
    const config = { secret: { required: true } };
    const result = parseCallOptions({ secret: "abc" }, config, "myPlugin", log);
    expect(result.secret).toBe("abc");
    expect(log).not.toHaveBeenCalled();
  });
});

// ─── attachAgentPlugins — Skills skip ───────────────────────────────────────

describe("attachAgentPlugins — Skills skip", () => {
  test("does not call aibitat.use for builtin: and custom: skills", async () => {
    const aibitat = makeAibitat();
    await attachAgentPlugins({
      aibitat,
      funcsToLoad: ["builtin:foo", "custom:bar"],
      args: {},
    });
    expect(aibitat.use).not.toHaveBeenCalled();
  });

  test("logs skip message for each skill", async () => {
    const log = jest.fn();
    const aibitat = makeAibitat();
    await attachAgentPlugins({
      aibitat,
      funcsToLoad: ["builtin:coding", "custom:mySkill"],
      args: {},
      log,
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("builtin:coding is a Skill")
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("custom:mySkill is a Skill")
    );
  });
});

// ─── attachAgentPlugins — single plugin ─────────────────────────────────────

describe("attachAgentPlugins — single plugin", () => {
  test("calls aibitat.use once for a valid single plugin", async () => {
    const aibitat = makeAibitat();
    // webBrowsing is defined in the mock above
    await attachAgentPlugins({
      aibitat,
      funcsToLoad: ["webBrowsing"],
      args: {},
    });
    expect(aibitat.use).toHaveBeenCalledTimes(1);
    expect(aibitat.use).toHaveBeenCalledWith("webBrowsingPluginInstance");
  });

  test("skips and does not throw for unknown plugin name", async () => {
    const log = jest.fn();
    const aibitat = makeAibitat();
    await expect(
      attachAgentPlugins({
        aibitat,
        funcsToLoad: ["nonExistentPlugin"],
        args: {},
        log,
      })
    ).resolves.not.toThrow();
    expect(aibitat.use).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("nonExistentPlugin is not a valid plugin")
    );
  });
});

// ─── attachAgentPlugins — composite plugin ───────────────────────────────────

describe("attachAgentPlugins — composite plugin (array)", () => {
  test("loads all child plugins when parent plugin is an array", async () => {
    const aibitat = makeAibitat();
    await attachAgentPlugins({
      aibitat,
      funcsToLoad: ["sqlAgent"],
      args: {},
    });
    // sqlAgent has 1 child (queryChild)
    expect(aibitat.use).toHaveBeenCalledTimes(1);
    expect(aibitat.use).toHaveBeenCalledWith("queryChildInstance");
  });
});

// ─── attachAgentPlugins — child plugin (# syntax) ────────────────────────────

describe("attachAgentPlugins — child plugin (#)", () => {
  test("loads specific child plugin via parent#child syntax", async () => {
    const aibitat = makeAibitat();
    await attachAgentPlugins({
      aibitat,
      funcsToLoad: ["sqlAgent#queryChild"],
      args: {},
    });
    expect(aibitat.use).toHaveBeenCalledTimes(1);
    expect(aibitat.use).toHaveBeenCalledWith("queryChildInstance");
  });

  test("skips and logs when parent plugin not found", async () => {
    const log = jest.fn();
    const aibitat = makeAibitat();
    await attachAgentPlugins({
      aibitat,
      funcsToLoad: ["unknownParent#child"],
      args: {},
      log,
    });
    expect(aibitat.use).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("unknownParent is not a valid plugin")
    );
  });

  test("skips and logs when child plugin not found in parent", async () => {
    const log = jest.fn();
    const aibitat = makeAibitat();
    await attachAgentPlugins({
      aibitat,
      funcsToLoad: ["sqlAgent#nonExistentChild"],
      args: {},
      log,
    });
    expect(aibitat.use).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("sqlAgent does not have child plugin named nonExistentChild")
    );
  });
});

// ─── attachAgentPlugins — @@flow_ ────────────────────────────────────────────

describe("attachAgentPlugins — @@flow_ plugin", () => {
  beforeEach(() => {
    AgentFlows.loadFlowPlugin.mockReset();
  });

  test("skips and does not throw when flow not found (returns null)", async () => {
    AgentFlows.loadFlowPlugin.mockReturnValue(null);
    const log = jest.fn();
    const aibitat = makeAibitat();
    await expect(
      attachAgentPlugins({
        aibitat,
        funcsToLoad: ["@@flow_some-uuid-1234"],
        args: {},
        log,
      })
    ).resolves.not.toThrow();
    expect(aibitat.use).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("some-uuid-1234 not found in flows directory")
    );
  });

  test("calls aibitat.use when flow found", async () => {
    const mockPluginFn = jest.fn(() => "flowPluginInstance");
    AgentFlows.loadFlowPlugin.mockReturnValue({
      name: "myFlow",
      flowName: "My Flow",
      plugin: mockPluginFn,
    });
    const aibitat = makeAibitat();
    await attachAgentPlugins({
      aibitat,
      funcsToLoad: ["@@flow_abc-123"],
      args: {},
    });
    expect(aibitat.use).toHaveBeenCalledWith("flowPluginInstance");
  });
});

// ─── attachAgentPlugins — @@ imported plugin ─────────────────────────────────

describe("attachAgentPlugins — @@ imported plugin", () => {
  beforeEach(() => {
    ImportedPlugin.validateImportedPluginHandler.mockReset();
    ImportedPlugin.loadPluginByHubId.mockReset();
  });

  test("skips and logs when imported plugin hubId not found", async () => {
    ImportedPlugin.validateImportedPluginHandler.mockReturnValue(false);
    const log = jest.fn();
    const aibitat = makeAibitat();
    await attachAgentPlugins({
      aibitat,
      funcsToLoad: ["@@hub-xyz"],
      args: {},
      log,
    });
    expect(aibitat.use).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("hub-xyz not found in plugin directory")
    );
  });

  test("loads imported plugin when valid", async () => {
    ImportedPlugin.validateImportedPluginHandler.mockReturnValue(true);
    const mockPlugin = {
      name: "myImported",
      parseCallOptions: jest.fn(() => ({})),
      plugin: jest.fn(() => "importedPluginInstance"),
    };
    ImportedPlugin.loadPluginByHubId.mockReturnValue(mockPlugin);
    const aibitat = makeAibitat();
    await attachAgentPlugins({
      aibitat,
      funcsToLoad: ["@@hub-abc"],
      args: {},
    });
    expect(aibitat.use).toHaveBeenCalledWith("importedPluginInstance");
  });
});

// ─── attachAgentPlugins — empty funcsToLoad ──────────────────────────────────

describe("attachAgentPlugins — edge cases", () => {
  test("handles empty funcsToLoad without error", async () => {
    const aibitat = makeAibitat();
    await expect(
      attachAgentPlugins({ aibitat, funcsToLoad: [], args: {} })
    ).resolves.not.toThrow();
    expect(aibitat.use).not.toHaveBeenCalled();
  });

  test("uses default no-op log if none provided", async () => {
    const aibitat = makeAibitat();
    // Should not throw even with no log function
    await expect(
      attachAgentPlugins({
        aibitat,
        funcsToLoad: ["builtin:test"],
        args: {},
        // log omitted
      })
    ).resolves.not.toThrow();
  });
});
