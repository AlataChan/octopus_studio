const { BaseSkill } = require("../../../utils/skills/BaseSkill");
const { SkillCategory } = require("../../../utils/skills/constants");

class TestSkill extends BaseSkill {
  constructor(requires) {
    super({
      id: "custom_test",
      name: "test",
      description: "test",
      category: SkillCategory.UTILITY,
      requires,
    });
  }

  getToolBindings() {
    return [];
  }
}

describe("BaseSkill channel gating", () => {
  test("defaults to wildcard channel", () => {
    const skill = new TestSkill();
    expect(skill.isAvailableInChannel("web")).toBe(true);
    expect(skill.isAvailableInChannel("feishu")).toBe(true);
  });

  test("supports explicit channels", () => {
    const skill = new TestSkill({ channels: ["web", "feishu"] });
    expect(skill.isAvailableInChannel("web")).toBe(true);
    expect(skill.isAvailableInChannel("feishu")).toBe(true);
    expect(skill.isAvailableInChannel("wecom")).toBe(false);
  });
});
