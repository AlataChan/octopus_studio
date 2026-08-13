const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  syncEnvToSystemSettings,
  createMoltClientFromSettings,
} = require("../bootstrap");
const { SystemSettings } = require("../../../models/systemSettings");

describe("Molt bootstrap", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  function mockSettings(existing = {}) {
    return {
      get: jest.fn(async ({ label }) =>
        Object.prototype.hasOwnProperty.call(existing, label)
          ? { label, value: existing[label] }
          : null
      ),
      getValueOrFallback: jest.fn(async ({ label }, fallback = null) =>
        Object.prototype.hasOwnProperty.call(existing, label)
          ? existing[label]
          : fallback
      ),
      _updateSettings: jest.fn(async () => ({ success: true })),
    };
  }

  test("writes env values when settings are empty", async () => {
    process.env.MOLT_BASE_URL = "http://host.docker.internal:18889";
    process.env.MOLT_API_TOKEN_FILE = "/run/molt/api.token";
    process.env.MOLT_TOKEN_FILE = "/run/molt/legacy-api.token";
    process.env.MOLT_API_TOKEN = "token-env";
    process.env.MOLT_ADMIN_TOKEN = "admin-token-env";
    process.env.MOLT_DASHBOARD_URL = "http://molt.local";
    process.env.MOLT_ENABLED = "true";
    const settings = mockSettings();

    await syncEnvToSystemSettings({ systemSettings: settings });

    expect(settings._updateSettings).toHaveBeenCalledWith({
      MOLT_BASE_URL: "http://host.docker.internal:18889",
      MOLT_API_TOKEN_FILE: "/run/molt/api.token",
      MOLT_TOKEN_FILE: "/run/molt/legacy-api.token",
      MOLT_API_TOKEN: "token-env",
      MOLT_ADMIN_TOKEN: "admin-token-env",
      MOLT_DASHBOARD_URL: "http://molt.local",
      MOLT_ENABLED: "true",
    });
  });

  test("does not overwrite existing settings", async () => {
    process.env.MOLT_BASE_URL = "http://env-url";
    process.env.MOLT_ENABLED = "true";
    const settings = mockSettings({
      MOLT_BASE_URL: "http://db-url",
      MOLT_ENABLED: "false",
    });

    await syncEnvToSystemSettings({ systemSettings: settings });

    expect(settings._updateSettings).not.toHaveBeenCalled();
  });

  test("does nothing when env is empty", async () => {
    delete process.env.MOLT_BASE_URL;
    delete process.env.MOLT_API_TOKEN_FILE;
    delete process.env.MOLT_TOKEN_FILE;
    delete process.env.MOLT_API_TOKEN;
    delete process.env.MOLT_ADMIN_TOKEN;
    delete process.env.MOLT_DASHBOARD_URL;
    delete process.env.MOLT_ENABLED;
    const settings = mockSettings();

    await syncEnvToSystemSettings({ systemSettings: settings });

    expect(settings._updateSettings).not.toHaveBeenCalled();
  });

  test("MOLT_API_TOKEN is a protected setting", () => {
    expect(SystemSettings.protectedFields).toContain("MOLT_API_TOKEN");
  });

  test("MOLT_ADMIN_TOKEN is a protected setting", () => {
    expect(SystemSettings.protectedFields).toContain("MOLT_ADMIN_TOKEN");
  });

  test("createMoltClientFromSettings prefers explicit MOLT_API_TOKEN over token file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "molt-bootstrap-"));
    const tokenPath = path.join(tempDir, "gateway.token");
    await fs.writeFile(tokenPath, "gateway-token\n");

    const client = await createMoltClientFromSettings({
      systemSettings: mockSettings({
        MOLT_ENABLED: "true",
        MOLT_BASE_URL: "http://host.docker.internal:18889",
        MOLT_TOKEN_FILE: tokenPath,
        MOLT_API_TOKEN: "sk-molt-real",
      }),
    });

    await expect(client.getToken()).resolves.toBe("sk-molt-real");
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
