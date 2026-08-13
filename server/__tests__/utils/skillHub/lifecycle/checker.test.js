const fs = require("fs");
const os = require("os");
const path = require("path");

const { LocalRegistry } = require("../../../../utils/plugins/skillHub/registry/localRegistry");
const { SkillChecker } = require("../../../../utils/plugins/skillHub/lifecycle/checker");
const { generateContentHash } = require("../../../../utils/plugins/MarkdownParser");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-checker-"));
}

function writeSkillMd(skillDir, frontmatter, body = "") {
  const yaml = require("js-yaml");
  const content = `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n\n${String(body).trim()}\n`;
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "skill.md"), content, "utf8");
  return content;
}

describe("SkillChecker", () => {
  test("check() reports outdated when remote hash differs", async () => {
    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "invoice-organizer");

    const localSkillMd = writeSkillMd(
      skillDir,
      {
        name: "Invoice Organizer",
        description: "Local",
        tools: ["http-request"],
        sourceType: "github",
        sourceUrl: "https://github.com/acme/invoice-organizer",
        sourceHash: "old-hash",
      },
      "Local body"
    );

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });

    const remoteSkillMd = `---\nname: Invoice Organizer\ndescription: Remote\ntools:\n  - http-request\n---\n\nRemote body\n`;
    const expectedRemoteHash = generateContentHash(remoteSkillMd);

    const checker = new SkillChecker({
      localRegistry,
      fetchText: async (url) => {
        if (String(url).includes("/skill.md")) return remoteSkillMd;
        throw new Error(`unexpected url: ${url}`);
      },
    });

    const result = await checker.check("custom:invoice-organizer");
    expect(result.skillId).toBe("custom:invoice-organizer");
    expect(result.status).toBe("outdated");
    expect(result.currentHash).toBe("old-hash");
    expect(result.remoteHash).toBe(expectedRemoteHash);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("check() reports current when hashes match", async () => {
    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "invoice-organizer");

    const remoteSkillMd = `---\nname: Invoice Organizer\ndescription: Remote\ntools:\n  - http-request\n---\n\nRemote body\n`;
    const remoteHash = generateContentHash(remoteSkillMd);

    writeSkillMd(
      skillDir,
      {
        name: "Invoice Organizer",
        description: "Local",
        tools: ["http-request"],
        sourceType: "github",
        sourceUrl: "https://github.com/acme/invoice-organizer",
        sourceHash: remoteHash,
      },
      "Local body"
    );

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });

    const checker = new SkillChecker({
      localRegistry,
      fetchText: async (url) => {
        if (String(url).includes("/skill.md")) return remoteSkillMd;
        throw new Error(`unexpected url: ${url}`);
      },
    });

    const result = await checker.check("custom:invoice-organizer");
    expect(result.status).toBe("current");
    expect(result.currentHash).toBe(remoteHash);
    expect(result.remoteHash).toBe(remoteHash);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});

