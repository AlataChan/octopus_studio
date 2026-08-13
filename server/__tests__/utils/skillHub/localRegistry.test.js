const fs = require("fs");
const os = require("os");
const path = require("path");

// NOTE: Module does not exist yet. This test is written first (TDD).
const { LocalRegistry } = require("../../../utils/plugins/skillHub/registry/localRegistry");

function writeFileSyncRecursive(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

describe("LocalRegistry", () => {
  let tempDir;
  let builtinBaseRoot;
  let customBaseRoot;
  let builtinSkillsDir;
  let customSkillsDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-local-"));
    builtinBaseRoot = path.join(tempDir, "builtin");
    customBaseRoot = path.join(tempDir, "custom");
    builtinSkillsDir = path.join(builtinBaseRoot, "skills");
    customSkillsDir = path.join(customBaseRoot, "skills");

    writeFileSyncRecursive(
      path.join(builtinSkillsDir, "starter-pack", "skill-seeker", "skill.md"),
      `---\nname: Starter Skill Seeker\ndescription: builtin skill\nversion: 1.0.0\ntags: [test]\nicon: 🧪\ntools: [http-request]\n---\n\n# Starter Skill Seeker\n`
    );

    writeFileSyncRecursive(
      path.join(customSkillsDir, "nested", "invoice-skill", "skill.md"),
      `---\nname: Invoice Skill\ndescription: extract invoice data\ntags:\n  - invoice\n  - pdf\nicon: 🧾\ntools:\n  - http-request\npermissionMode: default\nallowedTools:\n  - http-request\nautoApprovedTools: []\nresourceScopes:\n  allowedHosts:\n    - example.com\n---\n\n# Invoice\n`
    );
  });

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("scan() returns stable skillIds (builtin:/custom:)", async () => {
    const registry = new LocalRegistry({
      builtinSkillsDir,
      customSkillsDir,
      builtinBaseRoot,
      customBaseRoot,
    });

    const skills = await registry.scan({ forceRefresh: true });

    const ids = skills.map((s) => s.skillId).sort();
    expect(ids).toContain("builtin:starter-pack__skill-seeker");
    expect(ids).toContain("custom:nested__invoice-skill");
  });

  test("search() matches by name/description/tags", async () => {
    const registry = new LocalRegistry({
      builtinSkillsDir,
      customSkillsDir,
      builtinBaseRoot,
      customBaseRoot,
    });

    await registry.scan({ forceRefresh: true });

    const results = registry.search("invoice", { topN: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("Invoice Skill");
  });
});
