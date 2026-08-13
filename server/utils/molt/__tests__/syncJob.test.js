const {
  runMoltBridgeSyncOnce,
  startMoltBridgeSyncJob,
  stopMoltBridgeSyncJob,
} = require("../syncJob");

describe("Molt sync job", () => {
  const originalEnv = process.env.MOLT_SYNC_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.MOLT_SYNC_ENABLED;
    else process.env.MOLT_SYNC_ENABLED = originalEnv;
    stopMoltBridgeSyncJob();
    jest.useRealTimers();
  });

  test("runMoltBridgeSyncOnce is skipped unless explicitly enabled", async () => {
    process.env.MOLT_SYNC_ENABLED = "false";

    await expect(runMoltBridgeSyncOnce()).resolves.toEqual({
      success: true,
      skipped: true,
      reason: "MOLT_SYNC_ENABLED=false",
    });
  });

  test("startMoltBridgeSyncJob does not start by default", () => {
    process.env.MOLT_SYNC_ENABLED = "false";

    expect(startMoltBridgeSyncJob()).toEqual({
      started: false,
      reason: "MOLT_SYNC_ENABLED=false",
    });
  });
});
