const {
  mergeEvolution,
} = require("../../../../utils/plugins/skillHub/format/evolutionMerger");

describe("mergeEvolution", () => {
  test("initializes when missing", () => {
    const merged = mergeEvolution(null, {
      title: "Tip",
      content: "Always validate inputs",
    });

    expect(merged.version).toBe(1);
    expect(Array.isArray(merged.entries)).toBe(true);
    expect(merged.entries.length).toBe(1);
  });

  test("dedupes identical entries", () => {
    const existing = {
      version: 1,
      entries: [{ id: "a", title: "Tip", content: "X", createdAt: "t" }],
    };

    const merged = mergeEvolution(existing, {
      title: "Tip",
      content: "X",
    });

    expect(merged.entries.length).toBe(1);
  });
});

