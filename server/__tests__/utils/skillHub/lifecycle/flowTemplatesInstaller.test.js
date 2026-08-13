const fs = require("fs");
const os = require("os");
const path = require("path");

const { LocalRegistry } = require("../../../../utils/plugins/skillHub/registry/localRegistry");
const { ExternalRegistry } = require("../../../../utils/plugins/skillHub/registry/externalRegistry");
const { SkillInstaller } = require("../../../../utils/plugins/skillHub/lifecycle/installer");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-flowtemplates-"));
}

function writeSkillMd(skillDir, frontmatter, body = "") {
  const yaml = require("js-yaml");
  const content = `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n\n${String(body).trim()}\n`;
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "skill.md"), content, "utf8");
}

describe("SkillInstaller flowTemplates instantiation", () => {
  test("install() instantiates compatible flowTemplates via AgentFlows.saveFlow", async () => {
    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "local-skill");
    fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });

    writeSkillMd(
      skillDir,
      {
        name: "Local Skill",
        description: "Test",
        tools: ["http-request"],
        sourceType: "local",
        flowTemplates: [
          {
            id: "my-flow",
            name: "My Flow",
            description: "demo flow",
            slashCommand: "/my-flow",
            flowDefinition: {
              name: "My Flow",
              description: "demo flow",
              active: true,
              steps: [
                { type: "start", config: { variables: [] } },
                {
                  type: "apiCall",
                  config: { url: "https://example.com", method: "GET" },
                },
              ],
            },
          },
        ],
      },
      "Body"
    );

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });
    const externalRegistry = new ExternalRegistry({ bundledIndex: [] });

    const skillCatalog = { upsert: jest.fn().mockResolvedValue({ id: 1 }) };
    const skillInstallations = { bind: jest.fn().mockResolvedValue({ id: 2 }) };

    const mockAgentFlows = {
      getAllFlows: jest.fn(() => ({})),
      saveFlow: jest.fn(() => ({
        success: true,
        uuid: "11111111-1111-4111-8111-111111111111",
      })),
    };

    const installer = new SkillInstaller({
      localRegistry,
      externalRegistry,
      skillCatalog,
      skillInstallations,
      creator: { createFromGitHub: jest.fn() },
      agentFlows: mockAgentFlows,
    });

    await installer.install("custom:local-skill", { workspaceId: 1 });

    expect(mockAgentFlows.saveFlow).toHaveBeenCalledTimes(1);
    const [name, config] = mockAgentFlows.saveFlow.mock.calls[0] || [];
    expect(name).toBe("My Flow");
    expect(config).toEqual(
      expect.objectContaining({
        skillHub: expect.objectContaining({
          skillId: "custom:local-skill",
          templateId: "my-flow",
        }),
      })
    );

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("install() is idempotent when a flow for the (skillId, templateId) already exists", async () => {
    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "local-skill");
    fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });

    writeSkillMd(skillDir, {
      name: "Local Skill",
      description: "Test",
      tools: ["http-request"],
      sourceType: "local",
      flowTemplates: [
        {
          id: "my-flow",
          name: "My Flow",
          description: "demo flow",
          flowDefinition: {
            name: "My Flow",
            description: "demo flow",
            active: true,
            steps: [{ type: "start", config: { variables: [] } }],
          },
        },
      ],
    });

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });
    const externalRegistry = new ExternalRegistry({ bundledIndex: [] });

    const mockAgentFlows = {
      getAllFlows: jest.fn(() => ({
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": {
          name: "Existing Flow",
          description: "demo",
          steps: [{ type: "start", config: { variables: [] } }],
          skillHub: { skillId: "custom:local-skill", templateId: "my-flow" },
          active: true,
        },
      })),
      saveFlow: jest.fn(),
    };

    const installer = new SkillInstaller({
      localRegistry,
      externalRegistry,
      skillCatalog: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
      skillInstallations: { bind: jest.fn().mockResolvedValue({ id: 2 }) },
      creator: { createFromGitHub: jest.fn() },
      agentFlows: mockAgentFlows,
    });

    await installer.install("custom:local-skill", { workspaceId: 1 });

    expect(mockAgentFlows.saveFlow).toHaveBeenCalledTimes(0);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});

