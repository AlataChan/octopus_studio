const {
  stitchEvolution,
} = require("../../../../utils/plugins/skillHub/format/skillMdStitcher");

describe("stitchEvolution", () => {
  test("appends a new block when markers are missing", () => {
    const original = `---\nname: Test\n---\n\n# Test\n`;
    const evolved = stitchEvolution(original, {
      version: 1,
      entries: [{ id: "1", title: "Tip", content: "Do X" }],
    });

    expect(evolved).toContain("SKILL_EVOLUTION_START");
    expect(evolved).toContain("Tip");
    expect(evolved).toContain("Do X");
  });

  test("replaces block content when markers exist", () => {
    const original = `# Test\n\n<!-- SKILL_EVOLUTION_START -->\nold\n<!-- SKILL_EVOLUTION_END -->\n`;
    const evolved = stitchEvolution(original, {
      version: 1,
      entries: [{ id: "2", title: "New", content: "Better" }],
    });

    expect(evolved).toContain("New");
    expect(evolved).toContain("Better");
    expect(evolved).not.toContain("\nold\n");
  });
});

