describe("octopus-kb graceful degradation", () => {
  afterEach(() => {
    jest.resetModules();
  });

  it("healthcheck returns false when kb is enabled but no command is configured", async () => {
    const { KbClient } = require("../../utils/octopusKb/KbClient");
    const client = new KbClient({
      env: { OCTOPUS_KB_ENABLED: "true" },
      SystemSettingsModel: { get: jest.fn(async () => null) },
    });

    await expect(client.healthcheck()).resolves.toBe(false);
  });

  it("chat retrieval helper keeps vector context when kb is disabled", async () => {
    const {
      applyOctopusKbRetrieval,
    } = require("../../utils/octopusKb/retrievalMerge");
    const retrieveBundle = jest.fn();

    const result = await applyOctopusKbRetrieval({
      workspace: { slug: "workspace-a" },
      query: "question",
      contextTexts: ["vector context"],
      sources: [{ title: "Vector", docpath: "vector.md" }],
      kbClient: {
        enabled: jest.fn(async () => false),
        retrieveBundle,
      },
    });

    expect(result.contextTexts).toEqual(["vector context"]);
    expect(result.sources).toEqual([{ title: "Vector", docpath: "vector.md" }]);
    expect(result.metadata.status).toBe("disabled");
    expect(retrieveBundle).not.toHaveBeenCalled();
  });
});
