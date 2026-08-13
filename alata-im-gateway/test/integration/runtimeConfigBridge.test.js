const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const nock = require("nock");
const request = require("supertest");

const { createRuntimeTracker } = require("../helpers/runtimeTracker");
const { createApp } = require("../../src/index");
const { saveBinding } = require("../../src/router/bindings");
const { getDbPath, resetDb } = require("../../src/db");
const { getManagedSnapshotPath } = require("../../src/runtime/configStore");

const tracker = createRuntimeTracker();

describe("runtime config bridge", () => {
  let sandboxDir;

  beforeEach(() => {
    sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "alata-gateway-"));
    nock.cleanAll();
    resetDb();
  });

  afterEach(async () => {
    await tracker.shutdownAll();
    nock.cleanAll();
    resetDb();
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await tracker.shutdownAll();
    nock.restore();
  });

  test("managed runtime boots from Alata snapshot and rejects local mutations", async () => {
    const env = {
      ...process.env,
      GATEWAY_CONFIG_MODE: "managed",
      GATEWAY_DATA_DIR: sandboxDir,
      ALATA_BASE_URL: "http://alata.local",
      ALATA_API_KEY: "api-key",
      ALATA_INTERNAL_SECRET: "internal-secret",
      ALATA_GATEWAY_RUNTIME_ID: "rt-edge-1",
      ALATA_GATEWAY_RUNTIME_TOKEN: "runtime-token-abc",
    };

    const scope = nock(env.ALATA_BASE_URL, {
      reqheaders: {
        authorization: "Bearer runtime-token-abc",
      },
    })
      .get("/im-gateway/runtimes/rt-edge-1/config")
      .reply(200, {
        success: true,
        revision: 3,
        etag: 'W/"gwcfg-3"',
        config: {
          runtime: { id: "rt-edge-1", mode: "sidecar" },
          accounts: [
            {
              provider: "wecom",
              accountId: "corp-main",
              secrets: {
                corpId: "corp-main",
                agentId: "1001",
                corpSecret: "secret",
                token: "token",
                encodingAesKey: "aes",
              },
            },
          ],
          bindings: [
            {
              id: "binding-1",
              provider: "wecom",
              accountId: "corp-main",
              workspaceId: 7,
              match: { peerType: "group" },
              route: { workspaceSlug: "ops" },
              security: {},
              priority: 2,
              enabled: true,
            },
          ],
        },
      });

    const runtime = tracker.trackApp(await createApp({ env }));
    const diagnostics = await request(runtime.app).get("/admin/bindings");
    expect(diagnostics.status).toBe(200);
    expect(diagnostics.body.mode).toBe("managed");
    expect(diagnostics.body.bindingCount).toBe(1);

    const mutation = await request(runtime.app)
      .post("/admin/bindings")
      .send({ id: "binding-2" });
    expect(mutation.status).toBe(409);

    const snapshotPath = getManagedSnapshotPath(env);
    expect(fs.existsSync(snapshotPath)).toBe(true);

    const db = new Database(getDbPath(env), { readonly: true });
    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='bindings'"
      )
      .get();
    db.close();
    expect(table).toBeUndefined();
    scope.done();
  });

  test("standalone compatibility mode still boots with local bindings", async () => {
    const env = {
      ...process.env,
      GATEWAY_CONFIG_MODE: "standalone",
      GATEWAY_DATA_DIR: sandboxDir,
      ALATA_BASE_URL: "http://alata.local",
      ALATA_API_KEY: "api-key",
      ALATA_INTERNAL_SECRET: "internal-secret",
      FEISHU_APP_ID: "",
      FEISHU_APP_SECRET: "",
      FEISHU_DELIVERY_MODE: "webhook",
    };

    saveBinding(
      {
        id: "local-binding",
        enabled: true,
        channel: "wecom",
        accountId: "corp-main",
        match: { peerType: "group" },
        route: { workspaceSlug: "ops" },
        security: {},
        priority: 1,
      },
      { mode: "standalone", env }
    );

    const runtime = tracker.trackApp(await createApp({ env }));
    const response = await request(runtime.app).get("/admin/bindings");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe("local-binding");
  });
});
