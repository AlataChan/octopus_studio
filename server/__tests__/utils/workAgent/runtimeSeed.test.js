describe("work-agent runtime assistant reseed", () => {
  it("always runs the additive seed with demo templates included", async () => {
    const seedDefaultAssistants = jest.fn(async () => ({
      created: 3,
      updated: 0,
      skipped: 20,
    }));
    const getBooleanWorkAgentSetting = jest.fn(async () => false);
    const { reseedWorkAgentAssistants } = require("../../../utils/workAgent/runtimeSeed");

    const result = await reseedWorkAgentAssistants({
      getBooleanWorkAgentSetting,
      seedDefaultAssistants,
      env: {},
    });

    expect(seedDefaultAssistants).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        includeDemo: true,
        includeGstack: false,
        env: {},
      })
    );
    expect(result).toEqual(
      expect.objectContaining({ skipped: false, includeDemo: true })
    );
  });

  it("passes through the DB-backed gstack flag when enabled", async () => {
    const seedDefaultAssistants = jest.fn(async () => ({
      created: 48,
      updated: 0,
      skipped: 29,
    }));
    const getBooleanWorkAgentSetting = jest.fn(async () => true);
    const { reseedWorkAgentAssistants } = require("../../../utils/workAgent/runtimeSeed");

    const result = await reseedWorkAgentAssistants({
      getBooleanWorkAgentSetting,
      seedDefaultAssistants,
      env: {},
    });

    expect(seedDefaultAssistants).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        includeDemo: true,
        includeGstack: true,
      })
    );
    expect(result).toEqual(
      expect.objectContaining({ skipped: false, includeGstack: true })
    );
  });
});
