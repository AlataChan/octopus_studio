const crypto = require("crypto");
const { ChannelAdapter } = require("./ChannelAdapter");
const { safeJsonParse } = require("../../http");

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

function safeEqual(a = "", b = "") {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function parseFeishuTextContent(content) {
  if (!content) return "";
  if (typeof content === "string") {
    const parsed = safeJsonParse(content, null);
    if (parsed && typeof parsed.text === "string") return parsed.text;
    return content;
  }
  if (typeof content === "object") return String(content.text || "");
  return "";
}

function parseBodyObject(raw = null) {
  if (!raw) return {};
  if (typeof raw === "string") return safeJsonParse(raw, {});
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
  constructor({ account, secrets = {} }) {
    super({ provider: "feishu", account, secrets });
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  _decryptPayload(encrypted = "") {
    const encryptKey = this.secrets.encryptKey;
    if (!encryptKey) {
      throw new Error("Missing Feishu encryptKey");
    }

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

    const parsed = safeJsonParse(decrypted, null);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid Feishu decrypted payload");
    }
    return parsed;
  }

  _normalizeEvent(rawEvent) {
    const body = parseBodyObject(rawEvent);
    if (!body?.encrypt) return body;
    return this._decryptPayload(body.encrypt);
  }

  verifyWebhook(req) {
    const body = parseBodyObject(req.body);
    const encryptKey = this.secrets.encryptKey;
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

    const tokenFromBody = body?.token || body?.header?.token;
    const verificationToken = this.secrets.verificationToken;

    if (verificationToken) {
      return safeEqual(tokenFromBody, verificationToken);
    }

    const signingSecret = this.secrets.signingSecret;
    if (signingSecret) {
      const timestamp = req.headers["x-lark-request-timestamp"];
      const nonce = req.headers["x-lark-request-nonce"] || "";
      const signature = req.headers["x-lark-signature"];
      if (!timestamp || !signature) return false;

      const bodyString =
        typeof req.rawBody === "string" && req.rawBody.length > 0
          ? req.rawBody
          : typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body || {});
      const base = `${timestamp}\n${nonce}\n${bodyString}`;
      const expected = crypto
        .createHmac("sha256", signingSecret)
        .update(base)
        .digest("base64");
      return safeEqual(signature, expected);
    }

    return false;
  }

  parseEvent(rawEvent) {
    if (!rawEvent) return null;

    let normalizedEvent = null;
    try {
      normalizedEvent = this._normalizeEvent(rawEvent);
    } catch {
      return null;
    }

    if (
      normalizedEvent?.type === "url_verification" &&
      normalizedEvent?.challenge
    ) {
      return {
        type: "challenge",
        challenge: normalizedEvent.challenge,
      };
    }

    const header = normalizedEvent?.header || {};
    const event = normalizedEvent?.event || {};
    const message = event.message || {};
    const sender = event.sender || {};
    const eventType = String(
      header.event_type || event.type || message.message_type || ""
    );

    if (eventType === "application.bot.menu_v6") {
      const operator = event.operator || {};
      const operatorId =
        operator?.operator_id?.open_id ||
        operator?.operator_id?.user_id ||
        operator?.open_id ||
        "unknown";

      return {
        triggerType: "menu_action",
        eventType,
        eventKey: String(event.event_key || ""),
        messageId: String(header.event_id || ""),
        eventId: String(header.event_id || ""),
        provider: "feishu",
        accountId: String(this.account.accountId),
        peerType: "user",
        peerId: String(operatorId),
        senderId: String(operatorId),
        senderName: String(operator.operator_name || ""),
        contentType: "event",
        textContent: "",
        rawContent: normalizedEvent,
        isMentioned: true,
        timestamp: Number(header.create_time || Date.now()),
        replyTarget: {
          receiveIdType: "open_id",
          receiveId: String(operatorId),
        },
      };
    }

    if ((message.message_type || event.message_type) !== "text") {
      return null;
    }

    const textContent = parseFeishuTextContent(message.content);
    if (!textContent.trim()) return null;

    const senderId =
      sender?.sender_id?.open_id ||
      sender?.sender_id?.user_id ||
      sender?.id?.open_id ||
      event.open_id ||
      "unknown";

    const isGroup =
      (message.chat_type || event.chat_type || "").toLowerCase() === "group";
    const accountId =
      header.tenant_key ||
      header.app_id ||
      event.tenant_key ||
      this.account.accountId;

    const mentions = Array.isArray(message.mentions)
      ? message.mentions
      : Array.isArray(event.mentions)
        ? event.mentions
        : [];

    const peerType = isGroup ? "group" : "user";
    const peerId =
      (isGroup ? message.chat_id : senderId) || message.chat_id || senderId;

    return {
      triggerType: "message",
      eventType,
      messageId: String(message.message_id || header.event_id || ""),
      eventId: String(header.event_id || message.message_id || ""),
      provider: "feishu",
      accountId: String(accountId),
      peerType,
      peerId: String(peerId),
      senderId: String(senderId),
      senderName: String(sender?.sender_name || sender?.name || ""),
      contentType: "text",
      textContent,
      rawContent: normalizedEvent,
      isMentioned: mentions.length > 0,
      timestamp: Number((message.create_time || Date.now() / 1000) * 1000),
      replyTarget: {
        receiveIdType: isGroup ? "chat_id" : "open_id",
        receiveId: String(isGroup ? message.chat_id : senderId),
      },
    };
  }

  async refreshCredentials() {
    const now = Date.now();
    if (this.accessToken && this.accessTokenExpiresAt > now + 30_000) {
      return this.accessToken;
    }

    const appId = this.secrets.appId;
    const appSecret = this.secrets.appSecret;
    if (!appId || !appSecret) {
      throw new Error("Missing Feishu appId/appSecret");
    }

    const response = await fetch(
      `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      }
    );

    const data = await response.json();
    if (!response.ok || data.code !== 0 || !data.tenant_access_token) {
      throw new Error(data.msg || "Failed to refresh Feishu tenant token");
    }

    this.accessToken = data.tenant_access_token;
    this.accessTokenExpiresAt = now + Number(data.expire || 7200) * 1000;
    return this.accessToken;
  }

  async sendTextReply(peer, text) {
    const token = await this.refreshCredentials();
    const response = await fetch(
      `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=${peer.receiveIdType || "chat_id"}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: peer.receiveId,
          msg_type: "text",
          content: JSON.stringify({ text: String(text || "") }),
        }),
      }
    );

    const data = await response.json();
    const ok = response.ok && data.code === 0;

    return {
      ok,
      status: response.status,
      data,
      messageId: data?.data?.message_id || null,
      error: ok ? null : data?.msg || "Failed to send Feishu message",
    };
  }
}

module.exports = {
  FeishuAdapter,
};
