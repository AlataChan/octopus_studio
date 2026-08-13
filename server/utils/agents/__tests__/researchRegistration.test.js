describe("research-subagent flag gating in defaults", () => {
  const KEY = "READONLY_SUBAGENT_ENABLED";
  afterEach(() => { delete process.env[KEY]; jest.resetModules(); });

  function loadSkills() {
    jest.resetModules();
    const defaults = require("../defaults");
    const { researchSubagent } = require("../aibitat/plugins/research-subagent");
    // DEFAULT_SKILLS 需从 defaults 导出；若未导出，在 module.exports 增加 DEFAULT_SKILLS（仅暴露，无副作用）
    return { skills: defaults.DEFAULT_SKILLS, name: researchSubagent.name };
  }

  it("flag off → research not in DEFAULT_SKILLS", () => {
    process.env[KEY] = "false";
    const { skills, name } = loadSkills();
    expect(skills).not.toContain(name);
  });
  it("flag on → research in DEFAULT_SKILLS", () => {
    process.env[KEY] = "true";
    const { skills, name } = loadSkills();
    expect(skills).toContain(name);
  });
});
