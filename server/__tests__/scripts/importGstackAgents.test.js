const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  importGstackAgents,
  mapAllowedTools,
  parseFrontmatter,
} = require("../../scripts/importGstackAgents");

describe("importGstackAgents", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alata-gstack-import-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeSkill(name, frontmatter) {
    const dir = path.join(tempDir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\n${frontmatter}\n---\n# ${name}\nUse this skill carefully.\n`,
      "utf8"
    );
  }

  it("parses list frontmatter and maps gstack tools to code tools", () => {
    const parsed = parseFrontmatter(
      `---\nname: codex\nallowed-tools:\n  - Bash\n  - Read\n---\nBody`
    );
    expect(parsed.attributes.name).toBe("codex");
    expect(parsed.attributes["allowed-tools"]).toEqual(["Bash", "Read"]);

    expect(mapAllowedTools(["Bash", "Read", "Grep", "Glob", "Write"])).toEqual({
      mapped: [
        "datetime-info",
        "code_shell",
        "code_read",
        "code_grep",
        "code_edit",
        "code_write",
      ],
      unmapped: [],
    });
  });

  it("generates gated gstack templates and skips utility skills", async () => {
    writeSkill(
      "codex",
      [
        "name: codex",
        "description: Code review wrapper. (gstack)",
        "triggers:",
        "  - codex review",
        "allowed-tools:",
        "  - Bash",
        "  - Read",
        "  - Agent",
      ].join("\n")
    );
    writeSkill(
      "setup-browser-cookies",
      [
        "name: setup-browser-cookies",
        "description: Setup helper. (gstack)",
        "allowed-tools:",
        "  - Bash",
      ].join("\n")
    );

    const outputPath = path.join(tempDir, "presetTemplates.gstack.js");
    const result = await importGstackAgents({ rootDir: tempDir, outputPath });
    expect(result.scanned).toBe(2);
    expect(result.generated).toBe(1);

    const generated = require(outputPath);
    expect(generated.GSTACK_TEMPLATES).toHaveLength(1);
    expect(generated.GSTACK_TEMPLATES[0]).toEqual(
      expect.objectContaining({
        id: "gstack-codex",
        seedCategory: "gstack",
        defaultTools: ["datetime-info", "code_shell", "code_read"],
        defaultSkills: ["builtin:code-execution"],
      })
    );
  });
});
