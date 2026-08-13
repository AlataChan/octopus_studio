const crypto = require("crypto");
const axios = require("axios");
const { ChannelAdapter } = require("./ChannelAdapter");
const { normalizeFeishuEvent } = require("./FeishuEventNormalizer");
const { getDb } = require("../db");
const { ERROR_TEMPLATES } = require("../outbound/errorTemplates");

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

function safeEqual(a = "", b = "") {
  try {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function parseBodyObject(raw = null) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw;
  return {};
}

function rawBodyString(req = {}) {
  if (typeof req.rawBody === "string" && req.rawBody.length > 0) {
    return req.rawBody;
  }
  if (typeof req.body === "string") return req.body;
  return JSON.stringify(parseBodyObject(req.body));
}

class FeishuAdapter extends ChannelAdapter {
  constructor({ accountId, secrets }) {
    super({ provider: "feishu", accountId, secrets });
    this._accessToken = null;
    this._tokenExpiresAt = 0;
    this._dedupTtlMs = parseInt(process.env.GATEWAY_DEDUP_TTL_MS || "86400000");
  }

  _decryptPayload(encrypted = "") {
    const { encryptKey } = this.secrets;
    if (!encryptKey) throw new Error("Missing Feishu encryptKey");

    const encryptedBuffer = Buffer.from(String(encrypted || ""), "base64");
    if (encryptedBuffer.length <= 16) {
      throw new Error("Invalid Feishu encrypted payload");
    }

    const key = crypto.createHash("sha256").update(encryptKey).digest();
    const iv = encryptedBuffer.subarray(0, 16);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer.subarray(16)),
      decipher.final(),
    ]).toString("utf8");

    return JSON.parse(decrypted);
  }

  _normalizeEvent(rawBody) {
    const body = parseBodyObject(rawBody);
    if (!body?.encrypt) return body;
    return this._decryptPayload(body.encrypt);
  }

  verifyWebhook(req) {
    const body = parseBodyObject(req.body);

    const { encryptKey } = this.secrets;
    if (encryptKey && body?.encrypt) {
      const timestamp = req.headers["x-lark-request-timestamp"];
      const nonce = req.headers["x-lark-request-nonce"] || "";
      const signature = req.headers["x-lark-signature"];
      if (!timestamp || !signature) return false;

      const expected = crypto
        .createHash("sha256")
        .update(`${timestamp}${nonce}${encryptKey}${rawBodyString(req)}`)
        .digest("hex");
      return safeEqual(signature, expected);
    }

    const { verificationToken } = this.secrets;
    if (verificationToken) {
      const tokenFromBody = body.token || body.header?.token;
      return safeEqual(tokenFromBody, verificationToken);
    }

    const { signingSecret } = this.secrets;
    if (signingSecret) {
      const timestamp = req.headers["x-lark-request-timestamp"];
      const nonce = req.headers["x-lark-request-nonce"] || "";
      const signature = req.headers["x-lark-signature"];
      if (!timestamp || !signature) return false;

      const rawBody = req.rawBody || JSON.stringify(body);
      const base = `${timestamp}\n${nonce}\n${rawBody}`;
      const expected = crypto.createHmac("sha256", signingSecret).update(base).digest("base64");
      return safeEqual(signature, expected);
    }

    return true; // no verification configured → allow (dev mode)
  }

  parseEvent(rawBody) {
    if (!rawBody) return null;

    let normalizedBody = null;
    try {
      normalizedBody = this._normalizeEvent(rawBody);
    } catch {
      return null;
    }

    if (
      normalizedBody?.type === "url_verification" &&
      normalizedBody?.challenge
    ) {
      return {
        type: "challenge",
        challenge: normalizedBody.challenge,
      };
    }

    const schema = normalizedBody.schema;
    let event, header;

    if (schema === "2.0") {
      header = normalizedBody.header || {};
      event = normalizedBody.event || {};
    } else {
      event = normalizedBody;
      header = {
        event_id: normalizedBody.uuid,
        event_type: normalizedBody.event?.type,
      };
    }

    const eventType = header.event_type || event.type;
    if (eventType === "application.bot.menu_v6") {
      const operator = event.operator || {};
      const operatorId =
        operator?.operator_id?.open_id ||
        operator?.operator_id?.user_id ||
        operator?.open_id ||
        "";

      return {
        triggerType: "menu_action",
        eventType,
        eventKey: String(event.event_key || ""),
        messageId: header.event_id || "",
        eventId: header.event_id || "",
        provider: "feishu",
        accountId: this.accountId,
        peerType: "user",
        peerId: operatorId,
        senderId: operatorId,
        senderName: operator?.operator_name || "",
        contentType: "event",
        textContent: "",
        rawContent: normalizedBody,
        isMentioned: true,
        timestamp: parseInt(header.create_time || Date.now()),
        replyTarget: {
          receiveIdType: "open_id",
          receiveId: operatorId,
        },
      };
    }
    return normalizeFeishuEvent({
      schema,
      header,
      event,
      accountId: this.accountId,
    });
  }

  isDuplicate(eventId) {
    const db = getDb();
    const cutoff = Date.now() - this._dedupTtlMs;
    if (Math.random() < 0.01) {
      db.prepare("DELETE FROM event_dedup WHERE received_at < ?").run(cutoff);
    }
    const row = db
      .prepare("SELECT 1 FROM event_dedup WHERE event_id = ? AND received_at > ?")
      .get(eventId, cutoff);
    return !!row;
  }

  markSeen(eventId) {
    const db = getDb();
    db.prepare("INSERT OR IGNORE INTO event_dedup (event_id, provider, received_at) VALUES (?, ?, ?)")
      .run(eventId, "feishu", Date.now());
  }

  atomicMarkSeen(eventId, provider = "feishu", _accountId = this.accountId) {
    const db = getDb();
    const result = db.prepare(
      "INSERT OR IGNORE INTO event_dedup (event_id, provider, received_at) VALUES (?, ?, ?)"
    ).run(eventId, provider, Date.now());
    return result.changes === 1;
  }

  async _ensureAccessToken() {
    if (this._accessToken && Date.now() < this._tokenExpiresAt - 60_000) {
      return this._accessToken;
    }
    const { appId, appSecret } = this.secrets;
    const { data } = await axios.post(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
      app_id: appId,
      app_secret: appSecret,
    });
    if (data.code !== 0) throw new Error(`Feishu token error: ${data.msg}`);
    this._accessToken = data.tenant_access_token;
    this._tokenExpiresAt = Date.now() + data.expire * 1000;
    return this._accessToken;
  }

  async sendTextReply(peer, text) {
    const token = await this._ensureAccessToken();
    try {
      const receiveIdType =
        peer.receiveIdType || (peer.peerType === "group" ? "chat_id" : "open_id");
      const receiveId = peer.receiveId || peer.peerId || peer.senderId;
      const endpoint = `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=${receiveIdType}`;

      const { data } = await axios.post(
        endpoint,
        {
          receive_id: receiveId,
          msg_type: "text",
          content: JSON.stringify({ text }),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      return { ok: data.code === 0, messageId: data.data?.message_id, error: data.msg };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async sendErrorFeedback(peer, errorType, lang = "zh") {
    const template = ERROR_TEMPLATES[errorType];
    const text = template ? template[lang] || template.zh : "发生错误，请稍后再试";
    return this.sendTextReply(peer, text);
  }

  async refreshCredentials() {
    this._accessToken = null;
    this._tokenExpiresAt = 0;
    await this._ensureAccessToken();
  }

  async healthCheck() {
    try {
      await this._ensureAccessToken();
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { FeishuAdapter };
