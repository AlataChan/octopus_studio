const lark = require("@larksuiteoapi/node-sdk");
const { ChannelAdapter } = require("./ChannelAdapter");
const { FeishuAdapter } = require("./FeishuAdapter");
const { normalizeFeishuEvent } = require("./FeishuEventNormalizer");

/**
 * Feishu long-connection adapter.
 *
 * SDK probe result: WSClient is not an EventEmitter (`wsClient.on` is absent).
 * It exposes lifecycle callbacks through constructor params:
 * onReady/onError/onReconnecting/onReconnected. start() returns Promise<void>
 * but schedules connection work instead of waiting for readiness, so this adapter
 * uses those callbacks plus a ready timeout.
 */
class FeishuLongConnAdapter extends ChannelAdapter {
  constructor({ accountId, secrets, options = {} }) {
    super({ provider: "feishu", accountId, secrets });
    this._wsClient = null;
    this._readyTimer = null;
    this._state = "idle";
    this._lastError = null;
    this._connectStartedAt = 0;
    this._lastEventAt = 0;
    this._lastDisconnectAt = 0;
    this._lastReconnectAt = 0;
    this._reconnectCount = 0;
    this._options = {
      logLevel: options.logLevel || "info",
      autoReconnect: options.autoReconnect !== false,
      readyTimeoutMs: options.readyTimeoutMs || 15000,
    };
    this._outbound = new FeishuAdapter({ accountId, secrets });
  }

  async start({ onMessage, logger } = {}) {
    const { appId, appSecret } = this.secrets;
    const loggerLevel =
      lark.LoggerLevel[String(this._options.logLevel).toLowerCase()] ?? lark.LoggerLevel.info;

    this._connectStartedAt = Date.now();
    this._state = "connecting";
    this._lastError = null;

    this._wsClient = new lark.WSClient({
      appId,
      appSecret,
      loggerLevel,
      autoReconnect: this._options.autoReconnect,
      onReady: () => {
        this._clearReadyTimer();
        this._state = "connected";
        this._lastError = null;
      },
      onError: (err) => {
        this._clearReadyTimer();
        this._state = "error";
        this._lastError = err instanceof Error ? err : new Error(String(err || "WSClient error"));
      },
      onReconnecting: () => {
        this._state = "disconnected";
        this._lastDisconnectAt = Date.now();
        this._reconnectCount += 1;
      },
      onReconnected: () => {
        this._state = "connected";
        this._lastReconnectAt = Date.now();
        this._lastError = null;
      },
    });

    const dispatcher = new lark.EventDispatcher({}).register({
      "im.message.receive_v1": (raw) =>
        this._onRawEvent(raw, "im.message.receive_v1", onMessage, logger),
    });

    this._readyTimer = setTimeout(() => {
      if (this._state !== "connected") {
        this._state = "error";
        this._lastError = new Error("WSClient ready timeout");
        logger?.error?.({ accountId: this.accountId }, "[FeishuLongConn] ready timeout");
      }
    }, this._options.readyTimeoutMs);
    this._readyTimer.unref?.();

    try {
      await this._wsClient.start({ eventDispatcher: dispatcher });
    } catch (err) {
      this._clearReadyTimer();
      this._state = "error";
      this._lastError = err instanceof Error ? err : new Error(String(err || "WSClient start failed"));
      throw err;
    }
  }

  async stop() {
    this._clearReadyTimer();
    if (this._wsClient) {
      await this._wsClient.close({ force: false });
      this._wsClient = null;
    }
    this._state = "disconnected";
    this._lastDisconnectAt = Date.now();
  }

  _clearReadyTimer() {
    if (this._readyTimer) {
      clearTimeout(this._readyTimer);
      this._readyTimer = null;
    }
  }

  _onRawEvent(rawData, eventType, onMessage, logger) {
    this._lastEventAt = Date.now();
    const normalized = normalizeFeishuEvent({
      schema: "2.0",
      header: {
        event_type: eventType,
        event_id: rawData?.event_id || rawData?.message?.message_id,
        create_time: rawData?.create_time,
      },
      event: rawData,
      accountId: this.accountId,
    });
    if (!normalized) return;
    if (!this._outbound.atomicMarkSeen(normalized.eventId, "feishu", this.accountId)) return;
    queueMicrotask(() => {
      try {
        onMessage(normalized);
      } catch (err) {
        logger?.error?.(
          { err, accountId: this.accountId },
          "[FeishuLongConn] onMessage failed"
        );
      }
    });
  }

  getStatus() {
    return {
      provider: "feishu",
      mode: "longconn",
      accountId: this.accountId,
      state: this._state,
      lastError: this._lastError ? this._lastError.message : null,
      connectStartedAt: this._connectStartedAt,
      lastEventAt: this._lastEventAt,
      lastDisconnectAt: this._lastDisconnectAt,
      lastReconnectAt: this._lastReconnectAt,
      reconnectCount: this._reconnectCount,
    };
  }

  verifyWebhook() {
    return false;
  }

  parseEvent() {
    return null;
  }

  isDuplicate(eventId) {
    return this._outbound.isDuplicate(eventId);
  }

  markSeen(eventId) {
    return this._outbound.markSeen(eventId);
  }

  sendTextReply(peer, text) {
    return this._outbound.sendTextReply(peer, text);
  }

  sendErrorFeedback(peer, type, lang) {
    return this._outbound.sendErrorFeedback(peer, type, lang);
  }

  refreshCredentials() {
    return this._outbound.refreshCredentials();
  }

  healthCheck() {
    return this._outbound.healthCheck();
  }
}

module.exports = { FeishuLongConnAdapter };
