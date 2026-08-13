const fs = require("fs");
const os = require("os");
const path = require("path");

const { LocalRegistry } = require("../../../../utils/plugins/skillHub/registry/localRegistry");
const { ExternalRegistry } = require("../../../../utils/plugins/skillHub/registry/externalRegistry");
const { SkillInstaller } = require("../../../../utils/plugins/skillHub/lifecycle/installer");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-mcp-"));
}

function writeSkillMd(skillDir, frontmatter, body = "") {
  const yaml = require("js-yaml");
  const content = `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n\n${String(body).trim()}\n`;
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "skill.md"), content, "utf8");
}

describe("SkillInstaller MCP auto-manage", () => {
  test("install() upserts MCP server config from templates and starts server", async () => {
    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "local-skill");

    writeSkillMd(skillDir, {
      name: "Local Skill",
      description: "Test",
      tools: ["http-request"],
      sourceType: "local",
      mcpBindings: ["playwright"],
    });

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });
    const externalRegistry = new ExternalRegistry({ bundledIndex: [] });

    const mcpConfigPath = path.join(tmpRoot, "plugins", "anythingllm_mcp_servers.json");
    const mockMcpLayer = {
      mcpServerJSONPath: mcpConfigPath,
      startMCPServer: jest.fn(async () => ({ success: true, error: null })),
    };

    const installer = new SkillInstaller({
      localRegistry,
      externalRegistry,
      skillCatalog: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
      skillInstallations: { bind: jest.fn().mockResolvedValue({ id: 2 }) },
      creator: { createFromGitHub: jest.fn() },
      mcpLayer: mockMcpLayer,
    });

    await installer.install("custom:local-skill", { workspaceId: 1 });

    const json = JSON.parse(fs.readFileSync(mcpConfigPath, "utf8"));
    expect(json.mcpServers).toHaveProperty("playwright");
    expect(json.mcpServers.playwright.anythingllm).toEqual(
      expect.objectContaining({
        skillHubManaged: true,
        requiredBySkills: expect.arrayContaining(["custom:local-skill"]),
      })
    );
    expect(mockMcpLayer.startMCPServer).toHaveBeenCalledWith("playwright");

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("uninstall() prunes MCP server config when no longer required by any installations", async () => {
    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "local-skill");

    writeSkillMd(skillDir, {
      name: "Local Skill",
      description: "Test",
      tools: ["http-request"],
      sourceType: "local",
      mcpBindings: ["playwright"],
    });

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });
    const externalRegistry = new ExternalRegistry({ bundledIndex: [] });

    const mcpConfigPath = path.join(tmpRoot, "plugins", "anythingllm_mcp_servers.json");
    fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
    fs.writeFileSync(
      mcpConfigPath,
      JSON.stringify(
        {
          mcpServers: {
            playwright: {
              command: "npx",
              args: ["-y", "@playwright/mcp@latest", "--headless"],
              env: {},
              anythingllm: {
                skillHubManaged: true,
                requiredBySkills: ["custom:local-skill"],
              },
            },
          },
        },
        null,
        2
      ),
      "utf8"
    );

    const mockMcpLayer = {
      mcpServerJSONPath: mcpConfigPath,
      pruneMCPServer: jest.fn(() => true),
    };

    const skillInstallations = {
      unbind: jest.fn(async () => 1),
      listAll: jest.fn(async () => []),
    };

    const installer = new SkillInstaller({
      localRegistry,
      externalRegistry,
      skillCatalog: { setEnabled: jest.fn(async () => true) },
      skillInstallations,
      creator: { createFromGitHub: jest.fn() },
      mcpLayer: mockMcpLayer,
    });

    await installer.uninstall("custom:local-skill", { workspaceId: 1 });

    const updated = JSON.parse(fs.readFileSync(mcpConfigPath, "utf8"));
    expect(updated.mcpServers.playwright).toBeUndefined();
    expect(mockMcpLayer.pruneMCPServer).toHaveBeenCalledWith("playwright");

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});

