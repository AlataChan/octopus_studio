const { MarkdownSkill } = require("../../../utils/skills/MarkdownSkill");

describe("MarkdownSkill", () => {
  test("exposes configSchema + flowTemplates from metadata", () => {
    const meta = {
      skillId: "custom:test-skill",
      name: "Test Skill",
      description: "desc",
      version: "1.0.0",
      category: "general",
      tags: ["test"],
      icon: "🧩",
      tools: ["http-request"],
      systemPrompt: "Hello",
      configSchema: {
        version: "1.0",
        fields: [
          { key: "foo", label: "Foo", type: "string", defaultValue: "bar" },
        ],
      },
      flowTemplates: [
        {
          id: "flow-1",
          name: "Flow",
          description: "demo flow",
          slashCommand: "/flow",
          flowDefinition: { name: "Flow", steps: [] },
        },
      ],
    };

    const skill = new MarkdownSkill(meta);
    expect(skill.getConfigSchema().version).toBe("1.0");
    expect(skill.getConfigSchema().fields[0].key).toBe("foo");
    expect(skill.getFlowTemplates().length).toBe(1);
    expect(skill.getFlowTemplates()[0].id).toBe("flow-1");
  });

  test("maps mcpBindings string arrays to serverName bindings", () => {
    const meta = {
      skillId: "custom:test-skill",
      name: "Test Skill",
      description: "desc",
      tools: ["http-request"],
      mcpBindings: ["docker-mcp", "git-mcp"],
    };

    const skill = new MarkdownSkill(meta);
    const bindings = skill.getMCPBindings();
    expect(bindings.length).toBe(2);
    expect(bindings[0].serverName).toBe("docker-mcp");
  });
});

