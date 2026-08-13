const fs = require("fs");
const fsPromises = require("fs/promises");
const os = require("os");
const path = require("path");

describe("Molt token rotation", () => {
  const originalEnv = { ...process.env };
  let tempDir;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "molt-rotation-"));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test("single reload reads token file", async () => {
    const tokenPath = path.join(tempDir, "gateway.token");
    fs.writeFileSync(tokenPath, " file-token\n", "utf8");
    const { reloadMoltToken } = require("../tokenSource");

    await expect(
      reloadMoltToken({ filePath: tokenPath, envName: "MOLT_API_TOKEN" })
    ).resolves.toBe("file-token");
  });

  test("100 concurrent reload calls share one file read", async () => {
    const tokenPath = path.join(tempDir, "gateway.token");
    fs.writeFileSync(tokenPath, " file-token\n", "utf8");
    const readSpy = jest.spyOn(fsPromises, "readFile");
    const { reloadMoltToken } = require("../tokenSource");

    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        reloadMoltToken({ filePath: tokenPath, envName: "MOLT_API_TOKEN" })
      )
    );

    expect(new Set(results)).toEqual(new Set(["file-token"]));
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  test("reload completion clears pendingReload so next reload reads again", async () => {
    const tokenPath = path.join(tempDir, "gateway.token");
    fs.writeFileSync(tokenPath, " token-1\n", "utf8");
    const readSpy = jest.spyOn(fsPromises, "readFile");
    const { reloadMoltToken } = require("../tokenSource");

    await expect(reloadMoltToken({ filePath: tokenPath })).resolves.toBe(
      "token-1"
    );
    fs.writeFileSync(tokenPath, " token-2\n", "utf8");
    await expect(reloadMoltToken({ filePath: tokenPath })).resolves.toBe(
      "token-2"
    );

    expect(readSpy).toHaveBeenCalledTimes(2);
  });

  test("concurrent reload read failure returns null without deadlock", async () => {
    const tokenPath = path.join(tempDir, "gateway.token");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest
      .spyOn(fsPromises, "readFile")
      .mockRejectedValue(new Error("disk unavailable"));
    const { reloadMoltToken } = require("../tokenSource");

    const results = await Promise.all(
      Array.from({ length: 5 }, () => reloadMoltToken({ filePath: tokenPath }))
    );

    expect(results).toEqual([null, null, null, null, null]);
    expect(warn).toHaveBeenCalled();
  });

  test("missing token file returns null without throwing", async () => {
    const { reloadMoltToken } = require("../tokenSource");

    await expect(
      reloadMoltToken({ filePath: path.join(tempDir, "missing.token") })
    ).resolves.toBeNull();
  });

  test("unlinked token file warns and returns null", async () => {
    const tokenPath = path.join(tempDir, "gateway.token");
    fs.writeFileSync(tokenPath, "token", "utf8");
    fs.unlinkSync(tokenPath);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { reloadMoltToken } = require("../tokenSource");

    await expect(reloadMoltToken({ filePath: tokenPath })).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[MoltToken] Unable to reload token"),
      expect.any(String)
    );
  });

  test("reload falls back to env when no token file is available", async () => {
    process.env.MOLT_API_TOKEN = "env-token";
    const { reloadMoltToken } = require("../tokenSource");

    await expect(
      reloadMoltToken({
        filePath: path.join(tempDir, "missing.token"),
        envName: "MOLT_API_TOKEN",
      })
    ).resolves.toBe("env-token");
  });

  test("health monitor reloads token and reconnects after 401", async () => {
    const { MoltHealthMonitor } = require("../healthMonitor");
    const reloadToken = jest.fn(async () => "rotated-token");
    const client = {
      health: jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          statusCode: 401,
          error: "Unauthorized",
        })
        .mockResolvedValueOnce({ ok: true, status: "live" }),
      capabilitySnapshot: jest.fn(async () => ({
        version: "1.2.3",
        capabilities: ["agents"],
      })),
    };
    const monitor = new MoltHealthMonitor({
      client,
      reloadToken,
      tokenReloadOptions: { filePath: "/run/molt/gateway.token" },
    });

    await monitor.checkOnce();

    expect(reloadToken).toHaveBeenCalledWith({
      filePath: "/run/molt/gateway.token",
    });
    expect(client.health).toHaveBeenCalledTimes(2);
    expect(monitor.status()).toEqual(
      expect.objectContaining({ state: "CONNECTED", version: "1.2.3" })
    );
  });

  test("three consecutive 401 reload failures transition offline", async () => {
    const { MoltHealthMonitor } = require("../healthMonitor");
    const reloadToken = jest.fn(async () => null);
    const client = {
      health: jest.fn(async () => ({
        ok: false,
        statusCode: 401,
        error: "Unauthorized",
      })),
      capabilitySnapshot: jest.fn(),
    };
    const monitor = new MoltHealthMonitor({
      client,
      reloadToken,
      tokenReloadOptions: { filePath: "/run/molt/gateway.token" },
    });

    await monitor.start({ debounceCount: 3 });
    await monitor.checkOnce();
    await monitor.checkOnce();

    expect(reloadToken).toHaveBeenCalledTimes(3);
    expect(monitor.status()).toEqual(
      expect.objectContaining({
        state: "OFFLINE",
        error: expect.stringContaining("Unauthorized"),
      })
    );
    monitor.stop();
  });

  test("manualReconnect triggers an immediate health check", async () => {
    const { MoltHealthMonitor } = require("../healthMonitor");
    const client = {
      health: jest.fn(async () => ({ ok: true, status: "live" })),
      capabilitySnapshot: jest.fn(async () => ({
        version: "2.0.0",
        capabilities: ["km"],
      })),
    };
    const monitor = new MoltHealthMonitor({ client });

    await expect(monitor.manualReconnect()).resolves.toEqual(
      expect.objectContaining({ state: "CONNECTED", version: "2.0.0" })
    );
    expect(client.health).toHaveBeenCalledTimes(1);
  });
});
