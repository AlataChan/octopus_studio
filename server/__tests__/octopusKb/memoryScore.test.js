describe("octopus-kb memory scoring", () => {
  it("scores newer candidates higher at the same source priority", () => {
    const { scoreCandidate } = require("../../utils/octopusKb/memoryScore");
    const now = new Date("2026-06-16T00:00:00.000Z");

    const newer = scoreCandidate(
      { sourcePriority: 2, created: "2026-06-15T00:00:00.000Z" },
      { now, halfLifeDays: 7 }
    );
    const older = scoreCandidate(
      { sourcePriority: 2, created: "2026-06-01T00:00:00.000Z" },
      { now, halfLifeDays: 7 }
    );

    expect(newer).toBeGreaterThan(older);
    expect(newer).toBeCloseTo(2 * Math.pow(0.5, 1 / 7));
    expect(older).toBeCloseTo(2 * Math.pow(0.5, 15 / 7));
  });

  it("pins open questions independently from their decayed score", () => {
    const { isPinned, scoreCandidate } = require("../../utils/octopusKb/memoryScore");
    const now = new Date("2026-06-16T00:00:00.000Z");

    const score = scoreCandidate(
      {
        sourcePriority: 1,
        kind: "open_question",
        created: "2026-01-01T00:00:00.000Z",
      },
      { now, halfLifeDays: 7 }
    );

    expect(score).toBeLessThan(0.001);
    expect(isPinned("open_question")).toBe(true);
    expect(isPinned("decision")).toBe(false);
  });
});
