const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseMarkdown } = require("../parse-markdown");
const { extractSkills } = require("../extract-skills");
const {
  applyRenderSafeFallbacks,
  validateRenderSafe,
} = require("../render-safe");
const { extractTools, isIncluded } = require("../index");

describe("agency-agents importer utilities", () => {
  test("parseMarkdown extracts frontmatter and body", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "agency-importer-test-")
    );
    const filePath = path.join(tempDir, "agent.md");

    fs.writeFileSync(
      filePath,
      [
        "---",
        "name: Backend Architect",
        "description: Designs systems",
        "tags:",
        "  - backend",
        "  - architecture",
        "---",
        "",
        "# Body",
        "",
        "Build reliable systems.",
      ].join("\n"),
      "utf8"
    );

    const parsed = parseMarkdown(filePath);

    expect(parsed.frontmatter).toMatchObject({
      name: "Backend Architect",
      description: "Designs systems",
      tags: ["backend", "architecture"],
    });
    expect(parsed.body).toContain("# Body");
    expect(parsed.body).toContain("Build reliable systems.");
  });

  test("extractSkills returns at least 3 items", () => {
    const body = [
      "## 🎯 Your Core Mission",
      "Stuff",
      "## API Design",
      "Stuff",
      "### Scalability",
      "Stuff",
    ].join("\n");

    const skills = extractSkills(body, "engineering");

    expect(skills.length).toBeGreaterThanOrEqual(3);
    expect(skills).toEqual(expect.arrayContaining(["API Design", "Scalability"]));
  });

  test("applyRenderSafeFallbacks fills missing required fields", () => {
    const safe = applyRenderSafeFallbacks({
      category: "design",
      description: "",
      skills: ["Visual direction"],
    });

    const validation = validateRenderSafe(safe);

    expect(validation.valid).toBe(true);
    expect(safe.name).toBe("Unnamed Agent");
    expect(safe.icon).toBe("🤖");
    expect(safe.color).toBe("#3B82F6");
    expect(safe.employeeTitle).toBe("design 专家");
    expect(safe.skills.length).toBeGreaterThanOrEqual(3);
  });

  test("extractTools maps keywords to tools advisory", () => {
    const tools = extractTools(
      "This agent can search the web, use RAG, and inspect a knowledge graph."
    );

    expect(tools).toEqual(
      expect.arrayContaining(["web-search", "rag-memory", "knowledge-graph"])
    );
  });

  test("extractTools does not include dangerous keywords", () => {
    const tools = extractTools(
      "This agent can run code in bash, delete files, and publish deploys."
    );

    expect(tools).toEqual([]);
    expect(tools).not.toEqual(
      expect.arrayContaining(["bash", "delete", "deploy", "run code"])
    );
  });

  test("isIncluded respects whitelist rules", () => {
    expect(isIncluded("engineering/engineering-backend-architect.md")).toBe(
      true
    );
    expect(isIncluded("game-development/gameplay-designer.md")).toBe(false);
    expect(
      isIncluded("marketing/marketing-linkedin-content-creator.md")
    ).toBe(false);
    expect(isIncluded("specialized/agents-orchestrator.md")).toBe(true);
    expect(isIncluded("specialized/other-specialist.md")).toBe(false);
  });
});
