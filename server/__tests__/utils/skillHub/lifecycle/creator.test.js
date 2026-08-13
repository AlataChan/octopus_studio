const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseFrontmatter } = require("../../../../utils/plugins/MarkdownParser");
const { SkillCreator } = require("../../../../utils/plugins/skillHub/lifecycle/creator");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-creator-"));
}

function readFileUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

describe("SkillCreator", () => {
  test("createFromGitHub is gated behind SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED=allow_all", async () => {
    const original = process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;

    const creator = new SkillCreator({ fetchText: async () => "" });

    await expect(
      creator.createFromGitHub("https://github.com/acme/invoice-organizer", {
        outputDir: mkTmpDir(),
      })
    ).rejects.toThrow(/SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED/i);

    process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = "true";
    await expect(
      creator.createFromGitHub("https://github.com/acme/invoice-organizer", {
        outputDir: mkTmpDir(),
      })
    ).rejects.toThrow(/allow_all/i);

    if (original === undefined) {
      delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    } else {
      process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = original;
    }
  });

  test("createFromGitHub writes skill.md + evolution.json + scripts/ and returns stable custom: skillId", async () => {
    const original = process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = "allow_all";

    const outputDir = mkTmpDir();

    const remoteSkillMd = `---\nname: Invoice Organizer\ndescription: Organize invoices\ntools:\n  - http-request\n---\n\nUse this skill to organize invoices.\n`;

    const creator = new SkillCreator({
      fetchText: async (url) => {
        if (String(url).includes("/skill.md")) return remoteSkillMd;
        throw new Error("not found");
      },
    });

    const result = await creator.createFromGitHub(
      "https://github.com/acme/invoice-organizer",
      { outputDir }
    );

    expect(result.skillId).toBe("custom:invoice-organizer");
    expect(fs.existsSync(result.skillDir)).toBe(true);
    expect(fs.existsSync(result.skillMdPath)).toBe(true);
    expect(fs.existsSync(path.join(result.skillDir, "scripts"))).toBe(true);
    expect(fs.existsSync(path.join(result.skillDir, "evolution.json"))).toBe(
      true
    );

    const written = readFileUtf8(result.skillMdPath);
    const { data: frontmatter } = parseFrontmatter(written);
    expect(written).toContain("name: Invoice Organizer");
    expect(written).toContain("sourceType: github");
    expect(frontmatter.sourceUrl).toBe(
      "https://github.com/acme/invoice-organizer"
    );
    expect(frontmatter.sourceHash).toMatch(/^[a-f0-9]{64}$/);

    const evolution = JSON.parse(
      readFileUtf8(path.join(result.skillDir, "evolution.json"))
    );
    expect(evolution).toEqual({ version: 1, entries: [] });

    fs.rmSync(outputDir, { recursive: true, force: true });
    if (original === undefined) {
      delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    } else {
      process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = original;
    }
  });

  test("createFromGitHub overwrite failure does not destroy existing skill directory", async () => {
    const original = process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = "allow_all";

    const outputDir = mkTmpDir();
    const existingDir = path.join(outputDir, "invoice-organizer");
    fs.mkdirSync(path.join(existingDir, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(existingDir, "skill.md"),
      "---\nname: Existing\ndescription: Old\ntools: [http-request]\n---\n\nOld\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(existingDir, "evolution.json"),
      JSON.stringify({ version: 1, entries: [] }, null, 2),
      "utf8"
    );

    const oldSkillMd = readFileUtf8(path.join(existingDir, "skill.md"));

    jest.resetModules();
    jest.doMock("../../../../utils/plugins/skillHub/format/writeFileAtomic", () => ({
      writeFileAtomic: () => {
        throw new Error("disk full");
      },
    }));

    let SkillCreatorWithMock;
    jest.isolateModules(() => {
      ({ SkillCreator: SkillCreatorWithMock } = require("../../../../utils/plugins/skillHub/lifecycle/creator"));
    });

    const creator = new SkillCreatorWithMock({ fetchText: async () => "" });
    await expect(
      creator.createFromGitHub("https://github.com/acme/invoice-organizer", {
        outputDir,
        overwrite: true,
      })
    ).rejects.toThrow(/disk full/i);

    // Existing skill should remain intact.
    expect(readFileUtf8(path.join(existingDir, "skill.md"))).toBe(oldSkillMd);
    expect(fs.existsSync(path.join(existingDir, "evolution.json"))).toBe(true);

    jest.dontMock("../../../../utils/plugins/skillHub/format/writeFileAtomic");

    fs.rmSync(outputDir, { recursive: true, force: true });
    if (original === undefined) {
      delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    } else {
      process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = original;
    }
  });
});
