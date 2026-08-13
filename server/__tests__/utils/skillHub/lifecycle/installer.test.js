const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const os = require("os");
const path = require("path");

const { LocalRegistry } = require("../../../../utils/plugins/skillHub/registry/localRegistry");
const { ExternalRegistry } = require("../../../../utils/plugins/skillHub/registry/externalRegistry");
const { SkillInstaller } = require("../../../../utils/plugins/skillHub/lifecycle/installer");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-installer-"));
}

function writeSkillMd(skillDir, frontmatter, body = "") {
  const yaml = require("js-yaml");
  const content = `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n\n${String(body).trim()}\n`;
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "skill.md"), content, "utf8");
}

describe("SkillInstaller", () => {
  test("install() binds a local skill to workspace via SkillInstallations and upserts into SkillCatalog", async () => {
    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");
    const skillDir = path.join(customSkillsDir, "local-skill");
    fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });

    writeSkillMd(
      skillDir,
      {
        name: "Local Skill",
        description: "Test",
        tools: ["http-request"],
        sourceType: "local",
      },
      "Body"
    );

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });
    const externalRegistry = new ExternalRegistry({ bundledIndex: [] });

    const skillCatalog = { upsert: jest.fn().mockResolvedValue({ id: 1 }) };
    const skillInstallations = { bind: jest.fn().mockResolvedValue({ id: 2 }) };

    const installer = new SkillInstaller({
      localRegistry,
      externalRegistry,
      skillCatalog,
      skillInstallations,
      creator: { createFromGitHub: jest.fn() },
    });

    const result = await installer.install("custom:local-skill", {
      workspaceId: 1,
    });

    expect(skillInstallations.bind).toHaveBeenCalledWith({
      skillId: "custom:local-skill",
      workspaceId: 1,
      assistantId: null,
    });
    expect(skillCatalog.upsert).toHaveBeenCalled();
    expect(result.skillId).toBe("custom:local-skill");
    expect(result.bound).toBe(true);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("install() can install an external GitHub registry skill via SkillCreator", async () => {
    const original = process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = "true"; // verified-only mode

    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });
    const externalRegistry = new ExternalRegistry({
      bundledIndex: [
        {
          skillId: "github:invoice-organizer",
          name: "invoice-organizer",
          sourceType: "github",
          sourceUrl: "https://github.com/acme/invoice-organizer",
          verified: true,
        },
      ],
    });

    const creator = {
      createFromGitHub: async (_url, options = {}) => {
        const dir = path.join(options.outputDir, "invoice-organizer");
        fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
        writeSkillMd(
          dir,
          {
            name: "Invoice Organizer",
            description: "Imported",
            tools: ["http-request"],
            sourceType: "github",
            sourceUrl: "https://github.com/acme/invoice-organizer",
            sourceHash: "hash",
            verified: true,
          },
          "Body"
        );
        fs.writeFileSync(
          path.join(dir, "evolution.json"),
          JSON.stringify({ version: 1, entries: [] }, null, 2),
          "utf8"
        );
        return { skillId: "custom:invoice-organizer", skillDir: dir, skillMdPath: path.join(dir, "skill.md") };
      },
    };

    const skillCatalog = { upsert: jest.fn().mockResolvedValue({ id: 1 }) };
    const skillInstallations = { bind: jest.fn().mockResolvedValue({ id: 2 }) };

    const installer = new SkillInstaller({
      localRegistry,
      externalRegistry,
      skillCatalog,
      skillInstallations,
      creator,
    });

    const result = await installer.install("github:invoice-organizer", {
      workspaceId: 1,
    });

    expect(result.skillId).toBe("custom:invoice-organizer");
    expect(result.bound).toBe(true);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
    if (original === undefined) {
      delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    } else {
      process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = original;
    }
  });

  test("install() can install an external bundle registry skill (enterprise git registry)", async () => {
    const original = process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = "true"; // verified-only mode

    const tmpRoot = mkTmpDir();
    const builtinRoot = path.join(tmpRoot, "builtin");
    const customRoot = path.join(tmpRoot, "custom");
    const customSkillsDir = path.join(customRoot, "skills");

    // Create a skill folder and zip it.
    const sourceSkillDir = path.join(tmpRoot, "bundle-source", "foo-skill");
    fs.mkdirSync(path.join(sourceSkillDir, "scripts"), { recursive: true });
    writeSkillMd(
      sourceSkillDir,
      {
        name: "Foo Skill",
        description: "Bundle-imported",
        tools: ["http-request"],
        sourceType: "registry",
        verified: true,
      },
      "Body"
    );
    fs.writeFileSync(
      path.join(sourceSkillDir, "evolution.json"),
      JSON.stringify({ version: 1, entries: [] }, null, 2),
      "utf8"
    );

    const AdmZip = require("adm-zip");
    const zip = new AdmZip();
    zip.addLocalFolder(sourceSkillDir, "foo-skill");
    const zipBuffer = zip.toBuffer();
    const zipHash = crypto.createHash("sha256").update(zipBuffer).digest("hex");

    // Serve the bundle over HTTP.
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" });
      res.end(zipBuffer);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const bundleUrl = `http://127.0.0.1:${port}/foo.zip`;

    const localRegistry = new LocalRegistry({
      builtinBaseRoot: builtinRoot,
      customBaseRoot: customRoot,
      builtinSkillsDir: path.join(builtinRoot, "skills"),
      customSkillsDir,
    });
    const externalRegistry = new ExternalRegistry({
      bundledIndex: [
        {
          skillId: "registry:foo-skill",
          name: "Foo Skill",
          sourceType: "bundle",
          bundleUrl,
          verified: true,
          installSlug: "foo-skill",
          sourceHash: `sha256:${zipHash}`,
        },
      ],
    });

    const skillCatalog = { upsert: jest.fn().mockResolvedValue({ id: 1 }) };
    const skillInstallations = { bind: jest.fn().mockResolvedValue({ id: 2 }) };

    const installer = new SkillInstaller({
      localRegistry,
      externalRegistry,
      skillCatalog,
      skillInstallations,
      creator: { createFromGitHub: jest.fn() },
    });

    const result = await installer.install("registry:foo-skill", {
      workspaceId: 1,
    });

    expect(result.skillId).toBe("custom:foo-skill");
    expect(fs.existsSync(path.join(customSkillsDir, "foo-skill", "skill.md"))).toBe(true);
    expect(skillInstallations.bind).toHaveBeenCalledWith({
      skillId: "custom:foo-skill",
      workspaceId: 1,
      assistantId: null,
    });

    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    if (original === undefined) {
      delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    } else {
      process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = original;
    }
  });
});
