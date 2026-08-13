const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");

const { createApp } = require("../../src");
const { resetDb } = require("../../src/db");

describe("gateway production ADMIN_SECRET validation", () => {
  const tempDirs = [];

  function makeLogger() {
    return {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };
  }

  function makeEnv(overrides = {}) {
    const dataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "alata-gateway-admin-secret-")
    );
    tempDirs.push(dataDir);

    return {
      GATEWAY_CONFIG_MODE: "standalone",
      GATEWAY_DATA_DIR: dataDir,
      NODE_ENV: "test",
      ...overrides,
    };
  }

  afterEach(() => {
    resetDb();
    while (tempDirs.length) {
      fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
  });

  test("throws in production when ADMIN_SECRET is unset", async () => {
    await expect(
      createApp({
        env: makeEnv({ NODE_ENV: "production" }),
        logger: makeLogger(),
      })
    ).rejects.toThrow(/ADMIN_SECRET.*openssl rand -hex 32/);
  });

  test("throws in production when ADMIN_SECRET uses a placeholder value", async () => {
    await expect(
      createApp({
        env: makeEnv({
          ADMIN_SECRET: "admin-secret-change-me",
          NODE_ENV: "production",
        }),
        logger: makeLogger(),
      })
    ).rejects.toThrow(/ADMIN_SECRET.*placeholder.*openssl rand -hex 32/);
  });

  test("rejects placeholder values case-insensitively", async () => {
    await expect(
      createApp({
        env: makeEnv({
          ADMIN_SECRET: "CHANGE-ME-x",
          NODE_ENV: "production",
        }),
        logger: makeLogger(),
      })
    ).rejects.toThrow(/ADMIN_SECRET.*placeholder.*openssl rand -hex 32/);
  });

  test("boots in production with a random ADMIN_SECRET", async () => {
    const { app } = await createApp({
      env: makeEnv({
        ADMIN_SECRET:
          "f47ac10b58cc4372a5670e02b2c3d47991f0d4a9c8b7e6d5c4b3a2918171615",
        NODE_ENV: "production",
      }),
      logger: makeLogger(),
    });

    expect(app).toBeDefined();
  });

  test("keeps development ADMIN_SECRET fallback available for loopback admin requests", async () => {
    const { app } = await createApp({
      env: makeEnv({ NODE_ENV: "development" }),
      logger: makeLogger(),
    });

    const response = await request(app).get("/admin/diagnostics");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        mode: "standalone",
      })
    );
  });

  test("allows desktop production runtime without ADMIN_SECRET", async () => {
    const { app } = await createApp({
      env: makeEnv({
        ANYTHING_LLM_RUNTIME: "desktop",
        NODE_ENV: "production",
      }),
      logger: makeLogger(),
    });

    expect(app).toBeDefined();
  });
});
