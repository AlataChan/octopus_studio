const fs = require("fs");
const os = require("os");
const path = require("path");

const { LocalRegistry } = require("../../../../utils/plugins/skillHub/registry/localRegistry");
const { SkillValidator } = require("../../../../utils/plugins/skillHub/lifecycle/validator");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-registry-export-"));
}

function writeFileSyncRecursive(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

describe("Git Registry Exporter", () => {
  test("exportGitRegistry creates bundles and registry index", async () => {
    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");

    writeFileSyncRecursive(
      path.join(customSkillsDir, "foo", "skill.md"),
      `---\nname: Foo\ndescription: ok\ntools: [http-request]\npermissionMode: default\nautoApprovedTools: []\n---\n\n# Foo\n`
    );
    writeFileSyncRecursive(
      path.join(customSkillsDir, "foo", "evolution.json"),
      JSON.stringify({ version: 1, entries: [] }, null, 2)
    );
    fs.mkdirSync(path.join(customSkillsDir, "foo", "scripts"), { recursive: true });

    const localRegistry = new LocalRegistry({
      customBaseRoot: customRoot,
      customSkillsDir,
      builtinBaseRoot: builtinRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
    });
    await localRegistry.scan({ forceRefresh: true });

    const validator = new SkillValidator({ localRegistry });
    const outputDir = path.join(tmpRoot, "export");

    const {
      exportGitRegistry,
    } = require("../../../../utils/plugins/skillHub/gitRegistry/exporter");

    const result = await exportGitRegistry({
      localRegistry,
      validator,
      outputDir,
    });

    expect(fs.existsSync(result.indexPath)).toBe(true);
    const index = JSON.parse(fs.readFileSync(result.indexPath, "utf8"));
    expect(Array.isArray(index.skills)).toBe(true);
    expect(index.skills[0].skillId).toBe("registry:foo");
    expect(index.skills[0].bundleUrl).toBe("bundles/foo.zip");
    expect(index.skills[0].sourceHash).toMatch(/^sha256:/);

    const bundlePath = path.join(outputDir, "bundles", "foo.zip");
    expect(fs.existsSync(bundlePath)).toBe(true);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});

