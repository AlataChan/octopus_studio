const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseFrontmatter } = require("../../../../utils/plugins/MarkdownParser");

describe("Skill Hub flowTemplates writer", () => {
  test("upserts a flow template into skill.md frontmatter", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-skillmd-"));
    const skillMdPath = path.join(tmpRoot, "skill.md");

    fs.writeFileSync(
      skillMdPath,
      `---\nname: Demo\ndescription: Demo skill\ntools: [\"http-request\"]\n---\n\nBody\n`,
      "utf8"
    );

    const { upsertFlowTemplateInSkillMd } = require("../../../../utils/plugins/skillHub/lifecycle/flowTemplates");

    upsertFlowTemplateInSkillMd(skillMdPath, {
      id: "my-flow",
      name: "My Flow",
      description: "demo",
      slashCommand: "/my-flow",
      flowDefinition: {
        name: "My Flow",
        description: "demo",
        active: true,
        steps: [{ type: "start", config: { variables: [] } }],
      },
    });

    const updated = fs.readFileSync(skillMdPath, "utf8");
    const { data } = parseFrontmatter(updated);
    expect(Array.isArray(data.flowTemplates)).toBe(true);
    expect(data.flowTemplates.length).toBe(1);
    expect(data.flowTemplates[0].id).toBe("my-flow");

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});

