const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Database = require("better-sqlite3");
const nock = require("nock");

const mockStart = jest.fn();
const mockClose = jest.fn();
const mockWsInstances = [];

jest.mock("@larksuiteoapi/node-sdk", () => {
  class WSClient {
    constructor(params) {
      this.params = params;
      this.eventDispatcher = null;
      this.handlers = {};
      mockWsInstances.push(this);
    }

    async start(params) {
      this.eventDispatcher = params.eventDispatcher;
      return mockStart(params);
    }

    async close(params) {
      return mockClose(params);
    }

    on(event, handler) {
      this.handlers[event] = handler;
      return this;
    }

    _trigger(eventType, payload) {
      return this.eventDispatcher.handles[eventType](payload);
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

process.env.LOG_LEVEL = "silent";

const { createRuntimeTracker } = require("../helpers/runtimeTracker");
const { createApp } = require("../../src/index");
const { FeishuAdapter } = require("../../src/adapters/FeishuAdapter");
const { AlataClient } = require("../../src/client/AlataClient");
const { saveBinding } = require("../../src/router/bindings");
const { getDbPath, resetDb } = require("../../src/db");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(assertion, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return assertion();
    } catch (error) {
      lastError = error;
      await delay(25);
    }
  }

  throw lastError;
}

function readDb(env, query) {
  const db = new Database(getDbPath(env), { readonly: true });
  try {
    return query(db);
  } finally {
    db.close();
  }
}

const tracker = createRuntimeTracker();

describe("Feishu long-connection message flow", () => {
  let sandboxDir;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "alata-gateway-longconn-flow-"));
    process.env.GATEWAY_DATA_DIR = sandboxDir;
    process.env.GATEWAY_CONFIG_MODE = "standalone";
    process.env.NODE_ENV = "test";
    nock.cleanAll();
    resetDb();
    mockStart.mockReset();
    mockStart.mockResolvedValue(undefined);
    mockClose.mockReset();
    mockWsInstances.length = 0;
  });

  afterEach(async () => {
    await tracker.shutdownAll();
    jest.restoreAllMocks();
    nock.cleanAll();
    resetDb();
    fs.rmSync(sandboxDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  afterAll(async () => {
    await tracker.shutdownAll();
    nock.restore();
  });

  function createEnv() {
    return {
      ...process.env,
      NODE_ENV: "test",
      GATEWAY_CONFIG_MODE: "standalone",
      GATEWAY_DATA_DIR: sandboxDir,
      ALATA_BASE_URL: "http://127.0.0.1:0/api",
      ALATA_API_KEY: "test",
      ALATA_INTERNAL_SECRET: "internal-secret",
      FEISHU_DELIVERY_MODE: "longconn",
      FEISHU_APP_ID: "cli_test_app",
      FEISHU_APP_SECRET: "secret",
    };
  }

  function createRawEvent() {
    return {
      event_id: "evt-longconn-flow-1",
      create_time: String(Date.now()),
      sender: {
        sender_id: {
          open_id: "ou_sender_1",
          name: "Sender One",
        },
      },
      message: {
        message_id: "om_msg_1",
        create_time: String(Date.now()),
        chat_id: "oc_chat_1",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "长连接消息" }),
      },
    };
  }

  test("long-connection end-to-end message flow", async () => {
    const env = createEnv();
    process.env = { ...process.env, ...env };

    saveBinding(
      {
        id: "binding-longconn-flow",
        enabled: true,
        channel: "feishu",
        accountId: env.FEISHU_APP_ID,
        match: {
          peerType: "group",
          peerId: "oc_chat_1",
          senderAllowlist: ["*"],
        },
        route: {
          workspaceSlug: "test-workspace",
          sessionScope: "per-channel-peer",
        },
        security: {},
        priority: 10,
      },
      { env }
    );

    jest.spyOn(AlataClient.prototype, "createThread").mockResolvedValue({
      slug: "test-thread-1",
    });
    jest.spyOn(AlataClient.prototype, "createRun").mockResolvedValue({
      runId: "run-1",
    });
    const streamChatFullSpy = jest.spyOn(AlataClient.prototype, "streamChatFull").mockResolvedValue({
      textResponse: "你好世界",
      sources: [],
    });
    jest.spyOn(AlataClient.prototype, "reportImReply").mockResolvedValue({ ok: true });
    const sendTextReplySpy = jest
      .spyOn(FeishuAdapter.prototype, "sendTextReply")
      .mockResolvedValue({ ok: true, messageId: "reply-1" });

    const runtime = tracker.trackApp(await createApp({ env }));
    expect(mockWsInstances).toHaveLength(1);

    mockWsInstances[0]._trigger("im.message.receive_v1", createRawEvent());

    await waitFor(() => {
      expect(streamChatFullSpy).toHaveBeenCalledTimes(1);
      expect(sendTextReplySpy).toHaveBeenCalledTimes(1);

      const auditRow = readDb(env, (db) =>
        db
          .prepare("SELECT * FROM message_events WHERE event_id = ?")
          .get("evt-longconn-flow-1")
      );
      expect(auditRow).toEqual(
        expect.objectContaining({
          provider: "feishu",
          status: "ok",
          binding_id: "binding-longconn-flow",
          workspace_slug: "test-workspace",
          thread_slug: "test-thread-1",
        })
      );
    });

    expect(streamChatFullSpy).toHaveBeenCalledWith(
      "test-workspace",
      "test-thread-1",
      "长连接消息"
    );
    expect(sendTextReplySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "feishu",
        accountId: env.FEISHU_APP_ID,
        peerType: "group",
        peerId: "oc_chat_1",
        senderId: "ou_sender_1",
      }),
      "你好世界"
    );

    const dedupRow = readDb(env, (db) =>
      db.prepare("SELECT * FROM event_dedup WHERE event_id = ?").get("evt-longconn-flow-1")
    );
    expect(dedupRow).toEqual(
      expect.objectContaining({
        provider: "feishu",
      })
    );

    mockWsInstances[0]._trigger("im.message.receive_v1", createRawEvent());
    await delay(50);

    expect(streamChatFullSpy).toHaveBeenCalledTimes(1);
    expect(sendTextReplySpy).toHaveBeenCalledTimes(1);

    await tracker.shutdownAll();
  });
});
