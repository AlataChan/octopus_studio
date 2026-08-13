const { SkillRegistry } = require("../../utils/skills/SkillRegistry");
const { MarkdownSkill } = require("../../utils/skills/MarkdownSkill");

describe("SkillRegistry.refreshFromSkillHubLocalRegistry()", () => {
  test("ingests builtin starter-pack markdown skills into customSkills", async () => {
    const registry = new SkillRegistry();

    const result = await registry.refreshFromSkillHubLocalRegistry({ forceRefresh: true });

    const skill = registry.getSkill("builtin:starter-pack__skill-seeker");
    expect(skill).toBeTruthy();
    expect(skill).toBeInstanceOf(MarkdownSkill);
    expect(result.loaded).toBeGreaterThan(0);
  });
});

