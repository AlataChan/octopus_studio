const { createKmBridge, extractKmState } = require("../kmBridge");

describe("Molt KM bridge", () => {
  test("extractKmState normalizes capability snapshot KM fields", () => {
    expect(
      extractKmState({
        state: {
          km: {
            configured: true,
            httpReady: true,
            knowledgeBases: [{ id: "kb-1" }],
            datasets: [{ id: "ds-1" }],
          },
        },
      })
    ).toEqual({
      configured: true,
      httpReady: true,
      knowledgeBases: [{ id: "kb-1" }],
      datasets: [{ id: "ds-1" }],
      defaults: {},
    });
  });

  test("status returns configured=false when Molt has no KM backend", async () => {
    const client = {
      capabilitySnapshot: jest.fn(async () => ({
        state: { km: { configured: false } },
      })),
    };

    await expect(createKmBridge({ client }).status()).resolves.toEqual({
      success: true,
      km: {
        configured: false,
        httpReady: false,
        knowledgeBases: [],
        datasets: [],
        defaults: {},
      },
      raw: { state: { km: { configured: false } } },
    });
  });
});
