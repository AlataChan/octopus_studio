const fs = require("fs");
const os = require("os");
const path = require("path");

// NOTE: Modules do not exist yet. These tests are written first (TDD).
const { LocalRegistry } = require("../../../utils/plugins/skillHub/registry/localRegistry");
const { ExternalRegistry } = require("../../../utils/plugins/skillHub/registry/externalRegistry");
const {
  UnifiedSkillSearch,
} = require("../../../utils/plugins/skillHub/registry/unifiedSearch");

function writeFileSyncRecursive(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

describe("UnifiedSkillSearch", () => {
  let tempDir;
  let builtinBaseRoot;
  let customBaseRoot;
  let builtinSkillsDir;
  let customSkillsDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-unified-"));
    builtinBaseRoot = path.join(tempDir, "builtin");
    customBaseRoot = path.join(tempDir, "custom");
    builtinSkillsDir = path.join(builtinBaseRoot, "skills");
    customSkillsDir = path.join(customBaseRoot, "skills");

    writeFileSyncRecursive(
      path.join(customSkillsDir, "pdf-processor", "skill.md"),
      `---\nname: PDF Processor\ndescription: process PDFs quickly\ntags: [pdf]\nicon: 📄\ntools: [read-file]\n---\n\n# PDF\n`
    );
  });

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("search() returns both local and external results", async () => {
    const localRegistry = new LocalRegistry({
      builtinSkillsDir,
      customSkillsDir,
      builtinBaseRoot,
      customBaseRoot,
    });
    await localRegistry.scan({ forceRefresh: true });

    const externalRegistry = new ExternalRegistry({
      bundledIndex: [
        {
          skillId: "github:invoice-organizer",
          name: "invoice-organizer",
          description: "Organize invoices",
          tags: ["invoice"],
          sourceType: "github",
          verified: true,
        },
      ],
    });
    await externalRegistry.loadIndex();

    const unified = new UnifiedSkillSearch({ localRegistry, externalRegistry });
    const result = await unified.search("invoice", { topN: 10 });

    expect(result.query).toBe("invoice");
    expect(Array.isArray(result.local)).toBe(true);
    expect(Array.isArray(result.external)).toBe(true);
    expect(result.external[0].skillId).toBe("github:invoice-organizer");
  });
});

