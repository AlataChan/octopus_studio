const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const os = require("os");
const path = require("path");

const { LocalRegistry } = require("../../../../utils/plugins/skillHub/registry/localRegistry");
const { SkillUpgrader } = require("../../../../utils/plugins/skillHub/lifecycle/upgrader");
const {
  generateContentHash,
  parseFrontmatter,
} = require("../../../../utils/plugins/MarkdownParser");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-upgrader-"));
}

function writeSkillMd(skillDir, frontmatter, body = "") {
  const yaml = require("js-yaml");
  const content = `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n\n${String(body).trim()}\n`;
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "skill.md"), content, "utf8");
  return content;
}

describe("SkillUpgrader", () => {
  test("upgrade() overwrites skill.md from remote and re-stitches local evolution", async () => {
    const original = process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = "true";

    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "invoice-organizer");
    fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });

    const oldSkillMd = writeSkillMd(
      skillDir,
      {
        name: "Invoice Organizer",
        description: "Old",
        tools: ["http-request"],
        sourceType: "github",
        sourceUrl: "https://github.com/acme/invoice-organizer",
        sourceHash: "old-hash",
        verified: true,
      },
      "Old body"
    );

    fs.writeFileSync(
      path.join(skillDir, "evolution.json"),
      JSON.stringify(
        {
          version: 1,
          entries: [
            { id: "e1", title: "Tip", content: "Always validate inputs." },
          ],
        },
        null,
        2
      ),
      "utf8"
    );

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });

    const remoteSkillMd = `---\nname: Invoice Organizer\ndescription: New\ntools:\n  - http-request\n---\n\nNew body\n`;
    const newHash = generateContentHash(remoteSkillMd);

    const upgrader = new SkillUpgrader({
      localRegistry,
      fetchText: async (url) => {
        if (String(url).includes("/skill.md")) return remoteSkillMd;
        throw new Error(`unexpected url: ${url}`);
      },
    });

    const result = await upgrader.upgrade("custom:invoice-organizer");
    expect(result.upgraded).toBe(true);
    expect(result.oldHash).toBe("old-hash");
    expect(result.newHash).toBe(newHash);

    const updated = fs.readFileSync(path.join(skillDir, "skill.md"), "utf8");
    const { data: frontmatter } = parseFrontmatter(updated);
    expect(updated).toContain("description: New");
    expect(frontmatter.sourceHash).toBe(newHash);
    expect(updated).toContain("<!-- SKILL_EVOLUTION_START -->");
    expect(updated).toContain("Always validate inputs.");

    fs.rmSync(tmpRoot, { recursive: true, force: true });
    if (original === undefined) {
      delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    } else {
      process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = original;
    }
  });

  test("upgrade({dryRun:true}) does not modify files", async () => {
    const original = process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = "true";

    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "invoice-organizer");
    fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });

    writeSkillMd(
      skillDir,
      {
        name: "Invoice Organizer",
        description: "Old",
        tools: ["http-request"],
        sourceType: "github",
        sourceUrl: "https://github.com/acme/invoice-organizer",
        sourceHash: "old-hash",
        verified: true,
      },
      "Old body"
    );

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });

    const remoteSkillMd = `---\nname: Invoice Organizer\ndescription: New\ntools:\n  - http-request\n---\n\nNew body\n`;
    const upgrader = new SkillUpgrader({
      localRegistry,
      fetchText: async () => remoteSkillMd,
    });

    const before = fs.readFileSync(path.join(skillDir, "skill.md"), "utf8");
    const result = await upgrader.upgrade("custom:invoice-organizer", {
      dryRun: true,
    });
    const after = fs.readFileSync(path.join(skillDir, "skill.md"), "utf8");

    expect(result.upgraded).toBe(false);
    expect(before).toBe(after);
    expect(result.changes?.wouldUpdate).toBe(true);
    expect(result.changes?.frontmatter?.changed?.description?.from).toBe("Old");
    expect(result.changes?.frontmatter?.changed?.description?.to).toBe("New");
    expect(result.changes?.prompt?.changed).toBe(true);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
    if (original === undefined) {
      delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    } else {
      process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = original;
    }
  });

  test("upgrade() rejects unverified GitHub skills unless allow_all", async () => {
    const original = process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = "true"; // verified-only mode

    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "invoice-organizer");
    fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });

    writeSkillMd(
      skillDir,
      {
        name: "Invoice Organizer",
        description: "Old",
        tools: ["http-request"],
        sourceType: "github",
        sourceUrl: "https://github.com/acme/invoice-organizer",
        sourceHash: "old-hash",
        verified: false,
      },
      "Old body"
    );

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });

    const remoteSkillMd = `---\nname: Invoice Organizer\ndescription: New\ntools:\n  - http-request\n---\n\nNew body\n`;
    const upgrader = new SkillUpgrader({
      localRegistry,
      fetchText: async () => remoteSkillMd,
    });

    const before = fs.readFileSync(path.join(skillDir, "skill.md"), "utf8");
    await expect(upgrader.upgrade("custom:invoice-organizer")).rejects.toThrow(
      /verified/i
    );
    const after = fs.readFileSync(path.join(skillDir, "skill.md"), "utf8");
    expect(after).toBe(before);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
    if (original === undefined) {
      delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    } else {
      process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = original;
    }
  });

  test("upgrade() supports registry bundle skills (enterprise git registry)", async () => {
    const original = process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = "true"; // verified-only mode

    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "foo-skill");
    fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });

    // Create local skill (installed from registry bundle).
    writeSkillMd(
      skillDir,
      {
        name: "Foo Skill",
        description: "Old",
        tools: ["http-request"],
        sourceType: "registry",
        sourceUrl: "http://127.0.0.1:0/foo.zip",
        sourceHash: "sha256:old",
        verified: true,
      },
      "Old body"
    );

    fs.writeFileSync(
      path.join(skillDir, "evolution.json"),
      JSON.stringify(
        {
          version: 1,
          entries: [{ id: "e1", title: "Tip", content: "Keep it safe." }],
        },
        null,
        2
      ),
      "utf8"
    );

    // Build a bundle zip with updated skill.md.
    const remoteSkillDir = path.join(tmpRoot, "remote", "foo-skill");
    fs.mkdirSync(path.join(remoteSkillDir, "scripts"), { recursive: true });
    writeSkillMd(
      remoteSkillDir,
      {
        name: "Foo Skill",
        description: "New",
        tools: ["http-request"],
        sourceType: "registry",
        verified: true,
      },
      "New body"
    );
    fs.writeFileSync(
      path.join(remoteSkillDir, "evolution.json"),
      JSON.stringify({ version: 1, entries: [] }, null, 2),
      "utf8"
    );

    const AdmZip = require("adm-zip");
    const zip = new AdmZip();
    zip.addLocalFolder(remoteSkillDir, "foo-skill");
    const zipBuffer = zip.toBuffer();
    const zipHash = crypto.createHash("sha256").update(zipBuffer).digest("hex");

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" });
      res.end(zipBuffer);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const bundleUrl = `http://127.0.0.1:${port}/foo.zip`;

    try {
      // Patch local skill sourceUrl to point to our test server.
      const skillMdPath = path.join(skillDir, "skill.md");
      const skillMd = fs
        .readFileSync(skillMdPath, "utf8")
        .replace("http://127.0.0.1:0/foo.zip", bundleUrl);
      fs.writeFileSync(skillMdPath, skillMd, "utf8");

      const localRegistry = new LocalRegistry({
        builtinBaseRoot: builtinRoot,
        customBaseRoot: customRoot,
        builtinSkillsDir: path.join(builtinRoot, "skills"),
        customSkillsDir,
      });

      const upgrader = new SkillUpgrader({ localRegistry });

      const before = fs.readFileSync(skillMdPath, "utf8");
      const dryRun = await upgrader.upgrade("custom:foo-skill", { dryRun: true });
      expect(dryRun.changes?.wouldUpdate).toBe(true);
      expect(dryRun.changes?.frontmatter?.changed?.description?.from).toBe("Old");
      expect(dryRun.changes?.frontmatter?.changed?.description?.to).toBe("New");
      expect(fs.readFileSync(skillMdPath, "utf8")).toBe(before);

      const result = await upgrader.upgrade("custom:foo-skill");
      expect(result.upgraded).toBe(true);

      const updated = fs.readFileSync(skillMdPath, "utf8");
      const { data: frontmatter } = parseFrontmatter(updated);
      expect(updated).toContain("description: New");
      expect(frontmatter.sourceHash).toBe(`sha256:${zipHash}`);
      expect(updated).toContain("<!-- SKILL_EVOLUTION_START -->");
      expect(updated).toContain("Keep it safe.");
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      if (original === undefined) {
        delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
      } else {
        process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = original;
      }
    }
  });
});
