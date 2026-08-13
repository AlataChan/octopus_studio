const {
  resolveEngineSelection,
} = require("../../../utils/workAgent/enginePolicy");

describe("workAgent enginePolicy", () => {
  it("defaults to Mastra when no explicit or global engine is set", () => {
    expect(resolveEngineSelection({}).engine).toBe("mastra");
  });

  it("honors an explicit Mastra selection", () => {
    expect(resolveEngineSelection({ requestedEngine: "mastra" }).engine).toBe(
      "mastra"
    );
  });

  it("fails closed when a retired or unknown engine is requested", () => {
    expect(() =>
      resolveEngineSelection({ requestedEngine: "octopus" })
    ).toThrow("Unsupported work-agent engine");
    expect(() =>
      resolveEngineSelection({ globalDefaultEngine: "unknown" })
    ).toThrow("Unsupported work-agent engine");
  });
});
