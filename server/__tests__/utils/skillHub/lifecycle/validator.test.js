const fs = require("fs");
const os = require("os");
const path = require("path");

const { LocalRegistry } = require("../../../../utils/plugins/skillHub/registry/localRegistry");
const { SkillValidator } = require("../../../../utils/plugins/skillHub/lifecycle/validator");

function writeFileSyncRecursive(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

describe("SkillValidator", () => {
  let tempDir;
  let customBaseRoot;
  let customSkillsDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-validate-"));
    customBaseRoot = path.join(tempDir, "custom");
    customSkillsDir = path.join(customBaseRoot, "skills");

    writeFileSyncRecursive(
      path.join(customSkillsDir, "good-skill", "skill.md"),
      `---\nname: Good Skill\ndescription: ok\ntools: [http-request, read-file]\npermissionMode: default\nallowedTools: [http-request]\nautoApprovedTools: []\n---\n\n# Good\n`
    );

    writeFileSyncRecursive(
      path.join(customSkillsDir, "bad-skill", "skill.md"),
      `---\nname: Bad Skill\ndescription: nope\ntools: [json-validator]\n---\n\n# Bad\n`
    );

    writeFileSyncRecursive(
      path.join(customSkillsDir, "imported-tool-skill", "skill.md"),
      `---\nname: Imported Tool Skill\ndescription: ok\ntools: ["@@my-plugin"]\n---\n\n# Imported Tool\n`
    );
  });

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("validates a skill with mapped tools", async () => {
    const localRegistry = new LocalRegistry({
      customBaseRoot,
      customSkillsDir,
      builtinSkillsDir: path.join(tempDir, "builtin", "skills"),
      builtinBaseRoot: path.join(tempDir, "builtin"),
    });
    await localRegistry.scan({ forceRefresh: true });

    const validator = new SkillValidator({ localRegistry });
    const result = await validator.validate("custom:good-skill");
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);

    const capsuleDir = path.join(customSkillsDir, "good-skill", ".evo", "capsules");
    expect(fs.existsSync(capsuleDir)).toBe(true);
    const files = fs.readdirSync(capsuleDir);
    expect(files.length).toBeGreaterThan(0);
    const capsule = JSON.parse(
      fs.readFileSync(path.join(capsuleDir, files[0]), "utf8")
    );
    expect(String(capsule.asset_id || "")).toMatch(/^sha256:/);
  });

  test("rejects unmapped tools", async () => {
    const localRegistry = new LocalRegistry({
      customBaseRoot,
      customSkillsDir,
      builtinSkillsDir: path.join(tempDir, "builtin", "skills"),
      builtinBaseRoot: path.join(tempDir, "builtin"),
    });
    await localRegistry.scan({ forceRefresh: true });

    const validator = new SkillValidator({ localRegistry });
    const result = await validator.validate("custom:bad-skill");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/json-validator/i);
  });

  test("accepts special runtime identifiers (@@...)", async () => {
    const localRegistry = new LocalRegistry({
      customBaseRoot,
      customSkillsDir,
      builtinSkillsDir: path.join(tempDir, "builtin", "skills"),
      builtinBaseRoot: path.join(tempDir, "builtin"),
    });
    await localRegistry.scan({ forceRefresh: true });

    const validator = new SkillValidator({ localRegistry });
    const result = await validator.validate("custom:imported-tool-skill");
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});
