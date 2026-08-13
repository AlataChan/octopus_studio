const { MoltHealthMonitor } = require("../healthMonitor");

describe("MoltHealthMonitor", () => {
  let client;

  beforeEach(() => {
    jest.useFakeTimers();
    client = {
      health: jest.fn(),
      capabilitySnapshot: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test("first successful check handshakes and emits connected", async () => {
    client.health.mockResolvedValue({ ok: true, status: "live" });
    client.capabilitySnapshot.mockResolvedValue({
      version: "1.2.3",
      capabilities: ["agents"],
    });
    const monitor = new MoltHealthMonitor({ client });
    const connected = jest.fn();
    monitor.on("connected", connected);

    await monitor.start({ pollIntervalMs: 60_000 });

    expect(monitor.isAvailable()).toBe(true);
    expect(monitor.status()).toEqual(
      expect.objectContaining({
        state: "CONNECTED",
        version: "1.2.3",
        capabilities: ["agents"],
      })
    );
    expect(connected).toHaveBeenCalledWith({
      version: "1.2.3",
      capabilities: ["agents"],
    });
    monitor.stop();
  });

  test("failures below debounceCount keep connected state", async () => {
    client.health.mockResolvedValueOnce({ ok: true, status: "live" });
    client.capabilitySnapshot.mockResolvedValueOnce({
      version: "1.2.3",
      capabilities: [],
    });
    const monitor = new MoltHealthMonitor({ client });
    await monitor.start({ debounceCount: 3 });

    client.health
      .mockResolvedValueOnce({ ok: false, error: "temporary" })
      .mockResolvedValueOnce({ ok: false, error: "temporary" });
    await monitor.checkOnce();
    await monitor.checkOnce();

    expect(monitor.status().state).toBe("CONNECTED");
    monitor.stop();
  });

  test("failures at debounceCount transition to offline and emit offline", async () => {
    client.health.mockResolvedValueOnce({ ok: true, status: "live" });
    client.capabilitySnapshot.mockResolvedValueOnce({
      version: "1.2.3",
      capabilities: [],
    });
    const monitor = new MoltHealthMonitor({ client });
    const offline = jest.fn();
    monitor.on("offline", offline);
    await monitor.start({ debounceCount: 3 });

    client.health.mockResolvedValue({ ok: false, error: "down" });
    await monitor.checkOnce();
    await monitor.checkOnce();
    await monitor.checkOnce();

    expect(monitor.isAvailable()).toBe(false);
    expect(monitor.status().state).toBe("OFFLINE");
    expect(offline).toHaveBeenCalled();
    monitor.stop();
  });

  test("offline recovery performs a new handshake", async () => {
    client.health.mockResolvedValue({ ok: false, error: "down" });
    const monitor = new MoltHealthMonitor({ client });
    await monitor.start({ debounceCount: 1 });
    expect(monitor.status().state).toBe("OFFLINE");

    client.health.mockResolvedValue({ ok: true, status: "live" });
    client.capabilitySnapshot.mockResolvedValue({
      version: "2.0.0",
      capabilities: ["km"],
    });
    await monitor.checkOnce();

    expect(monitor.isAvailable()).toBe(true);
    expect(monitor.status()).toEqual(
      expect.objectContaining({
        state: "CONNECTED",
        version: "2.0.0",
        capabilities: ["km"],
      })
    );
    monitor.stop();
  });

  test("health success with failed capability handshake is degraded", async () => {
    client.health.mockResolvedValue({ ok: true, status: "live" });
    client.capabilitySnapshot.mockResolvedValue({
      ok: false,
      error: "capability failed",
    });
    const monitor = new MoltHealthMonitor({ client });

    await monitor.start();

    expect(monitor.isAvailable()).toBe(false);
    expect(monitor.status()).toEqual(
      expect.objectContaining({
        state: "DEGRADED",
        error: "capability failed",
      })
    );
    monitor.stop();
  });
});
