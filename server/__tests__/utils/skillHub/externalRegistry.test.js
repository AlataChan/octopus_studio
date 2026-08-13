// NOTE: Module does not exist yet. This test is written first (TDD).
const { ExternalRegistry } = require("../../../utils/plugins/skillHub/registry/externalRegistry");

describe("ExternalRegistry", () => {
  test("search() works from bundled index without external downloads enabled", async () => {
    delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;

    const registry = new ExternalRegistry({
      bundledIndex: [
        {
          skillId: "github:invoice-organizer",
          name: "invoice-organizer",
          description: "Organize invoices and extract data",
          category: "document",
          tags: ["invoice", "pdf"],
          icon: "🧾",
          sourceType: "github",
          sourceUrl: "https://github.com/example/invoice-organizer",
          verified: true,
        },
      ],
    });

    await registry.loadIndex();
    const results = await registry.search("invoice", { topN: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].skillId).toBe("github:invoice-organizer");
  });

  test("refresh() is blocked when external downloads are disabled", async () => {
    delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    const registry = new ExternalRegistry({ bundledIndex: [] });

    await expect(registry.refresh()).rejects.toThrow(
      /SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED/i
    );
  });
});

