const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const nock = require("nock");
const request = require("supertest");

const mockStart = jest.fn();
const mockClose = jest.fn();
const wsInstances = [];

jest.mock("@larksuiteoapi/node-sdk", () => {
  class WSClient {
    constructor(params) {
      this.params = params;
      this.start = mockStart;
      this.close = mockClose;
      this.handlers = {};
      wsInstances.push(this);
    }

    on(event, handler) {
      this.handlers[event] = handler;
      return this;
    }
  }

  class EventDispatcher {
    constructor(params) {
      this.params = params;
      this.handles = {};
    }

    register(handles) {
      this.handles = handles;
      return this;
    }
  }

  return {
    WSClient,
    EventDispatcher,
    LoggerLevel: {
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
      trace: 5,
    },
  };
});

const { createRuntimeTracker } = require("../helpers/runtimeTracker");
const { createApp } = require("../../src/index");
const { resetDb } = require("../../src/db");

const tracker = createRuntimeTracker();

describe("Feishu long-connection startup", () => {
  let sandboxDir;

  beforeEach(() => {
    sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "alata-gateway-longconn-"));
    nock.cleanAll();
    resetDb();
    mockStart.mockReset();
    mockStart.mockResolvedValue(undefined);
    mockClose.mockReset();
    wsInstances.length = 0;
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

  function createLongConnEnv() {
    return {
      ...process.env,
      NODE_ENV: "test",
      GATEWAY_CONFIG_MODE: "standalone",
      GATEWAY_DATA_DIR: sandboxDir,
      ALATA_BASE_URL: "http://alata.local",
      ALATA_API_KEY: "api-key",
      ALATA_INTERNAL_SECRET: "internal-secret",
      FEISHU_DELIVERY_MODE: "longconn",
      FEISHU_APP_ID: "cli_test_app",
      FEISHU_APP_SECRET: "secret",
    };
  }

  test("createApp starts Feishu long-connection adapter and exposes health status", async () => {
    const env = createLongConnEnv();
    nock(env.ALATA_BASE_URL).get("/v1/auth").reply(200, { authenticated: true });

    const runtime = tracker.trackApp(await createApp({ env }));
    const response = await request(runtime.app).get("/health");

    expect(wsInstances).toHaveLength(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: "ok",
        adapters: ["feishu"],
        adapterStatus: [
          expect.objectContaining({
            provider: "feishu",
            mode: "longconn",
            state: expect.stringMatching(/^(idle|connecting|connected)$/),
          }),
        ],
      })
    );
  });

  test("shutdownAdapters closes server and stops long-connection adapters without exiting", async () => {
    const env = createLongConnEnv();
    const runtime = await createApp({ env });
    const server = {
      close: jest.fn((callback) => callback()),
    };
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});

    tracker.trackApp(runtime, { server, logger });
    await tracker.shutdownAll();

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledWith({ force: false });
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});
