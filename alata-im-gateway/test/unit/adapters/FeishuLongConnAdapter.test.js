const mockStart = jest.fn();
const mockClose = jest.fn();
const wsInstances = [];
const dispatcherInstances = [];

jest.mock("@larksuiteoapi/node-sdk", () => {
  class WSClient {
    constructor(params) {
      this.params = params;
      this.start = mockStart;
      this.close = mockClose;
      wsInstances.push(this);
    }
  }

  class EventDispatcher {
    constructor(params) {
      this.params = params;
      this.handles = {};
      dispatcherInstances.push(this);
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

const { FeishuLongConnAdapter } = require("../../../src/adapters/FeishuLongConnAdapter");

const secrets = {
  appId: "cli_test_app",
  appSecret: "secret",
};

function createAdapter(options = {}) {
  return new FeishuLongConnAdapter({
    accountId: "cli_test_app",
    secrets,
    options,
  });
}

function createRawEvent({
  eventId = "om_message_001",
  senderId = "ou_sender_001",
  chatId = "oc_group_001",
  text = "hello @bot",
} = {}) {
  return {
    sender: {
      sender_id: {
        open_id: senderId,
        name: "Sender One",
      },
    },
    message: {
      message_id: eventId,
      chat_id: chatId,
      chat_type: "group",
      content: JSON.stringify({ text }),
      message_type: "text",
    },
  };
}

describe("FeishuLongConnAdapter", () => {
  beforeEach(() => {
    jest.useRealTimers();
    mockStart.mockReset();
    mockStart.mockResolvedValue(undefined);
    mockClose.mockReset();
    wsInstances.length = 0;
    dispatcherInstances.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("start instantiates WSClient with expected credentials and options", async () => {
    const adapter = createAdapter({ autoReconnect: false, logLevel: "debug" });

    await adapter.start({ onMessage: jest.fn(), logger: null });

    expect(wsInstances).toHaveLength(1);
    expect(wsInstances[0].params).toEqual(
      expect.objectContaining({
        appId: "cli_test_app",
        appSecret: "secret",
        autoReconnect: false,
        loggerLevel: 4,
      })
    );
  });

  test("start registers im.message.receive_v1 handler only", async () => {
    const adapter = createAdapter();

    await adapter.start({ onMessage: jest.fn(), logger: null });

    expect(dispatcherInstances).toHaveLength(1);
    expect(Object.keys(dispatcherInstances[0].handles)).toEqual(["im.message.receive_v1"]);
    expect(dispatcherInstances[0].handles["application.bot.menu_v6"]).toBeUndefined();
  });

  test("start reaches connected state from SDK onReady callback", async () => {
    const adapter = createAdapter();

    await adapter.start({ onMessage: jest.fn(), logger: null });
    wsInstances[0].params.onReady();

    expect(adapter.getStatus()).toEqual(
      expect.objectContaining({
        state: "connected",
        lastError: null,
      })
    );
  });

  test("start failure sets error state and lastError", async () => {
    const error = new Error("start failed");
    mockStart.mockRejectedValueOnce(error);
    const adapter = createAdapter();

    await expect(adapter.start({ onMessage: jest.fn(), logger: null })).rejects.toThrow("start failed");

    expect(adapter.getStatus()).toEqual(
      expect.objectContaining({
        state: "error",
        lastError: "start failed",
      })
    );
  });

  test("tracks SDK error callback transition", async () => {
    const adapter = createAdapter();

    await adapter.start({ onMessage: jest.fn(), logger: null });
    wsInstances[0].params.onError(new Error("socket failed"));

    expect(adapter.getStatus()).toEqual(
      expect.objectContaining({
        state: "error",
        lastError: "socket failed",
      })
    );
  });

  test("onReady clears ready timeout", async () => {
    jest.useFakeTimers();
    const adapter = createAdapter({ readyTimeoutMs: 100 });

    await adapter.start({ onMessage: jest.fn(), logger: null });
    wsInstances[0].params.onReady();
    jest.advanceTimersByTime(150);

    expect(adapter.getStatus()).toEqual(
      expect.objectContaining({
        state: "connected",
        lastError: null,
      })
    );
  });

  test("_onRawEvent normalizes messages and calls onMessage once", async () => {
    const adapter = createAdapter();
    adapter._outbound.atomicMarkSeen = jest.fn().mockReturnValue(true);
    const onMessage = jest.fn();

    adapter._onRawEvent(createRawEvent(), "im.message.receive_v1", onMessage);
    await Promise.resolve();

    expect(adapter._outbound.atomicMarkSeen).toHaveBeenCalledWith(
      "om_message_001",
      "feishu",
      "cli_test_app"
    );
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "feishu",
        accountId: "cli_test_app",
        eventId: "om_message_001",
        textContent: "hello @bot",
      })
    );
  });

  test("_onRawEvent does not throw when onMessage throws synchronously", async () => {
    const adapter = createAdapter();
    adapter._outbound.atomicMarkSeen = jest.fn().mockReturnValue(true);
    const onMessage = jest.fn(() => {
      throw new Error("queue push failed");
    });
    const logger = { error: jest.fn() };

    expect(() =>
      adapter._onRawEvent(createRawEvent(), "im.message.receive_v1", onMessage, logger)
    ).not.toThrow();
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        accountId: "cli_test_app",
      }),
      "[FeishuLongConn] onMessage failed"
    );
  });

  test("_onRawEvent skips onMessage when dedup is not new", () => {
    const adapter = createAdapter();
    adapter._outbound.atomicMarkSeen = jest.fn().mockReturnValue(false);
    const onMessage = jest.fn();

    adapter._onRawEvent(createRawEvent(), "im.message.receive_v1", onMessage);

    expect(onMessage).not.toHaveBeenCalled();
  });

  test("stop closes wsClient and sets disconnected state", async () => {
    const adapter = createAdapter();
    await adapter.start({ onMessage: jest.fn(), logger: null });

    await adapter.stop();

    expect(mockClose).toHaveBeenCalledWith({ force: false });
    expect(adapter.getStatus()).toEqual(
      expect.objectContaining({
        state: "disconnected",
      })
    );
  });

  test("tracks reconnecting transition", async () => {
    const adapter = createAdapter();
    await adapter.start({ onMessage: jest.fn(), logger: null });

    expect(adapter.getStatus().reconnectCount).toBe(0);
    wsInstances[0].params.onReconnecting();

    expect(adapter.getStatus()).toEqual(
      expect.objectContaining({
        state: "disconnected",
        lastDisconnectAt: expect.any(Number),
        reconnectCount: 1,
      })
    );
    expect(adapter.getStatus().lastDisconnectAt).toBeGreaterThan(0);
  });

  test("tracks reconnected transition", async () => {
    const adapter = createAdapter();
    await adapter.start({ onMessage: jest.fn(), logger: null });

    wsInstances[0].params.onReconnecting();
    wsInstances[0].params.onReconnected();

    expect(adapter.getStatus()).toEqual(
      expect.objectContaining({
        state: "connected",
        lastError: null,
        lastReconnectAt: expect.any(Number),
      })
    );
    expect(adapter.getStatus().lastReconnectAt).toBeGreaterThan(0);
  });

  test("transitions to error after ready timeout when onReady never fires", async () => {
    jest.useFakeTimers();
    const adapter = createAdapter({ readyTimeoutMs: 100 });

    await adapter.start({ onMessage: jest.fn(), logger: null });
    jest.advanceTimersByTime(150);

    expect(adapter.getStatus()).toEqual(
      expect.objectContaining({
        state: "error",
        lastError: expect.stringContaining("ready timeout"),
      })
    );
  });

  test("getStatus returns complete state snapshot", async () => {
    const adapter = createAdapter();
    adapter._outbound.atomicMarkSeen = jest.fn().mockReturnValue(true);

    await adapter.start({ onMessage: jest.fn(), logger: null });
    adapter._onRawEvent(createRawEvent(), "im.message.receive_v1", jest.fn());
    const status = adapter.getStatus();

    expect(status).toEqual({
      provider: "feishu",
      mode: "longconn",
      accountId: "cli_test_app",
      state: expect.any(String),
      lastError: null,
      connectStartedAt: expect.any(Number),
      lastEventAt: expect.any(Number),
      lastDisconnectAt: expect.any(Number),
      lastReconnectAt: expect.any(Number),
      reconnectCount: expect.any(Number),
    });
  });
});
