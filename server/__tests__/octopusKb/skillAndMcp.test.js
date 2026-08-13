const fs = require("fs");
const os = require("os");
const path = require("path");

function tempPath(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

describe("Octopus KB skill and MCP registration", () => {
  afterEach(() => {
    try {
      require("../../utils/MCP")._instance = null;
    } catch {}
    jest.resetModules();
  });

  it("defines a builtin skill that binds the octopus-kb MCP server by serverName", () => {
    const { OctopusKbSkill } = require("../../utils/skills/builtin/OctopusKbSkill");
    const skill = new OctopusKbSkill();
    const definition = skill.getDefinition();

    expect(definition.metadata).toEqual(
      expect.objectContaining({
        id: "builtin:octopus-kb",
        name: "知识库 (octopus-kb)",
      })
    );
    expect(definition.tools).toEqual([]);
    expect(definition.mcpServers).toEqual([{ serverName: "octopus-kb" }]);
    expect(definition.mcpServers[0].serverId).toBeUndefined();
    expect(definition.configSchema.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "enabled", type: "boolean" }),
        expect.objectContaining({ key: "vaultRoot", type: "string" }),
      ])
    );
    expect(skill.getSystemPrompt()).toContain("octopus-kb");
  });

  it("registers the builtin skill through the shared SkillRegistry and index export", () => {
    const { skillRegistry, OctopusKbSkill } = require("../../utils/skills");
    const skill = skillRegistry.getSkill("builtin:octopus-kb");

    expect(skill).toBeInstanceOf(OctopusKbSkill);
    expect(skill.getMCPBindings()).toEqual([{ serverName: "octopus-kb" }]);
  });

  it("writes resolved absolute MCP stdio config with a narrow env allowlist", async () => {
    const tmpRoot = tempPath("octopus-kb-mcp-");
    const configPath = path.join(tmpRoot, "plugins", "anythingllm_mcp_servers.json");
    const vaultRoot = path.join(tmpRoot, "vaults");
    const settings = {
      OCTOPUS_KB_ENABLED: "true",
      OCTOPUS_KB_COMMAND: "/usr/bin/python3",
      OCTOPUS_KB_ARGS: JSON.stringify(["-I"]),
      OCTOPUS_KB_VAULT_ROOT: vaultRoot,
    };
    const SystemSettingsModel = {
      get: jest.fn(async ({ label }) =>
        Object.prototype.hasOwnProperty.call(settings, label)
          ? { value: settings[label] }
          : null
      ),
    };

    const { registerOctopusKbMcp } = require("../../utils/octopusKb/registerMcp");
    const result = await registerOctopusKbMcp({
      mcpConfigPath: configPath,
      SystemSettingsModel,
      env: {},
    });

    expect(result).toEqual(
      expect.objectContaining({ enabled: true, registered: true })
    );
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const server = config.mcpServers["octopus-kb"];
    expect(server.command).toBe("/usr/bin/python3");
    expect(path.isAbsolute(server.command)).toBe(true);
    expect(server.command).not.toContain("${");
    expect(server.args).toEqual(["-I", "-m", "octopus_kb_mcp.server"]);
    expect(server.env).toEqual({
      OCTOPUS_KB_VAULT_ROOT: vaultRoot,
      PYTHONPATH: expect.stringContaining(
        path.join("server", "integrations", "octopus-kb", "src")
      ),
    });
    expect(server.env.JWT_SECRET).toBeUndefined();
    expect(server.env.OPEN_AI_KEY).toBeUndefined();
    expect(server.anythingllm).toEqual(
      expect.objectContaining({ autoStart: false })
    );
  });

  it("does not register when the feature is disabled", async () => {
    const tmpRoot = tempPath("octopus-kb-mcp-disabled-");
    const configPath = path.join(tmpRoot, "plugins", "anythingllm_mcp_servers.json");
    const SystemSettingsModel = {
      get: jest.fn(async () => null),
    };
    const { registerOctopusKbMcp } = require("../../utils/octopusKb/registerMcp");

    const result = await registerOctopusKbMcp({
      mcpConfigPath: configPath,
      SystemSettingsModel,
      env: {},
    });

    expect(result).toEqual({ enabled: false, registered: false });
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it("wraps octopus-kb MCP tools as callable descriptors through serverName", async () => {
    const MCPCompatibilityLayer = require("../../utils/MCP");
    const layer = new MCPCompatibilityLayer();
    layer.mcps = {
      "octopus-kb": {
        listTools: jest.fn(async () => ({
          tools: [
            {
              name: "kb_lookup",
              description: "Lookup a page in octopus-kb",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string" } },
              },
              annotations: { readOnlyHint: true },
            },
          ],
        })),
        callTool: jest.fn(async ({ name, arguments: args }) => ({
          ok: true,
          name,
          args,
        })),
      },
    };

    const descriptors = await layer.convertServerToolsToDescriptors("octopus-kb");

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({
      name: "octopus-kb-kb_lookup",
      source: "mcp",
      mcpInfo: {
        serverName: "octopus-kb",
        toolName: "kb_lookup",
      },
      isReadOnly: true,
    });
    await expect(
      descriptors[0].handler({ query: "GraphRAG" })
    ).resolves.toContain('"ok":true');
    expect(layer.mcps["octopus-kb"].callTool).toHaveBeenCalledWith({
      name: "kb_lookup",
      arguments: { query: "GraphRAG" },
    });
  });
});
