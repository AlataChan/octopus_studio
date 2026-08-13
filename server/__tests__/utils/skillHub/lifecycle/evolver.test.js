const fs = require("fs");
const os = require("os");
const path = require("path");

const { LocalRegistry } = require("../../../../utils/plugins/skillHub/registry/localRegistry");
const { SkillEvolver } = require("../../../../utils/plugins/skillHub/lifecycle/evolver");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-evolver-"));
}

function writeSkillMd(skillDir, frontmatter, body = "") {
  const yaml = require("js-yaml");
  const content = `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n\n${String(body).trim()}\n`;
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "skill.md"), content, "utf8");
}

describe("SkillEvolver", () => {
  test("addEvolutionEntry() writes evolution.json and stitches into skill.md", async () => {
    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "my-skill");
    fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });

    writeSkillMd(
      skillDir,
      {
        name: "My Skill",
        description: "Test",
        tools: ["http-request"],
        sourceType: "local",
      },
      "Hello"
    );

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });

    const evolver = new SkillEvolver({ localRegistry });
    const result = await evolver.addEvolutionEntry("custom:my-skill", {
      title: "Tip",
      content: "Always write tests first.",
    });

    expect(fs.existsSync(result.evolutionPath)).toBe(true);
    const evolution = JSON.parse(fs.readFileSync(result.evolutionPath, "utf8"));
    expect(evolution.version).toBe(1);
    expect(evolution.entries).toHaveLength(1);
    expect(evolution.entries[0].title).toBe("Tip");

    const updatedSkillMd = fs.readFileSync(result.skillMdPath, "utf8");
    expect(updatedSkillMd).toContain("<!-- SKILL_EVOLUTION_START -->");
    expect(updatedSkillMd).toContain("Always write tests first.");

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});

