const crypto = require("crypto");
const cheerio = require("cheerio");
const { ChannelAdapter } = require("./ChannelAdapter");

const WECOM_API_BASE = "https://qyapi.weixin.qq.com/cgi-bin";

function safeEqual(a = "", b = "") {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function sha1Sorted(items = []) {
  return crypto
    .createHash("sha1")
    .update(
      items
        .map((v) => String(v))
        .sort()
        .join("")
    )
    .digest("hex");
}

function parseXmlToObject(xmlString = "") {
  try {
    const $ = cheerio.load(String(xmlString || ""), { xmlMode: true });
    const obj = {};
    $("xml")
      .children()
      .each((_idx, el) => {
        if (!el?.tagName) return;
        obj[el.tagName] = $(el).text();
      });
    return obj;
  } catch {
    return {};
  }
}

function extractEncryptFromRaw(raw = null) {
  if (!raw) return null;

  if (typeof raw === "string") {
    const obj = parseXmlToObject(raw);
    return obj.Encrypt || obj.encrypt || null;
  }

  if (typeof raw === "object") {
    return (
      raw.Encrypt ||
      raw.encrypt ||
      raw?.xml?.Encrypt ||
      raw?.xml?.encrypt ||
      null
    );
  }

  return null;
}

class WeComAdapter extends ChannelAdapter {
  constructor({ account, secrets = {} }) {
    super({ provider: "wecom", account, secrets });
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  verifyWebhook(req) {
    const token = this.secrets.token;
    if (!token) return false;

    const query = req.query || {};
    const signature =
      query.msg_signature || query.signature || query.msgSignature || null;
    const timestamp = query.timestamp || null;
    const nonce = query.nonce || null;

    // GET verification: `echostr` is encrypted in query.
    // POST callbacks: encrypted XML carries <Encrypt>.
    const encrypted =
      query.echostr || extractEncryptFromRaw(req.rawBody || req.body) || null;

    if (!signature || !timestamp || !nonce || !encrypted) return false;
    const expected = sha1Sorted([token, timestamp, nonce, encrypted]);
    return safeEqual(signature, expected);
  }

  _aesKey() {
    const encodingAESKey = this.secrets.encodingAESKey;
    if (!encodingAESKey) {
      throw new Error("Missing WeCom encodingAESKey");
    }

    // encodingAESKey is 43 chars base64 without trailing '='
    const key = Buffer.from(`${encodingAESKey}=`, "base64");
    if (key.length !== 32) {
      throw new Error("Invalid WeCom encodingAESKey");
    }
    return key;
  }

  _decrypt(encrypted = "") {
    if (!encrypted) throw new Error("Missing encrypted payload");

    const aesKey = this._aesKey();
    const iv = aesKey.subarray(0, 16);
    const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
    // WeCom safe-mode uses WXBizMsgCrypt PKCS7 padding (block size 32).
    // Node's built-in PKCS7 unpadding assumes block size 16, so we disable
    // auto padding and remove it ourselves.
    decipher.setAutoPadding(false);

    let decrypted = Buffer.concat([
      decipher.update(String(encrypted), "base64"),
      decipher.final(),
    ]);

    const pad = decrypted[decrypted.length - 1];
    if (pad >= 1 && pad <= 32) {
      decrypted = decrypted.subarray(0, decrypted.length - pad);
    }

    // 16 random bytes + 4 bytes msg_len (network byte order)
    const msgLen = decrypted.readUInt32BE(16);
    const msgStart = 20;
    const msgEnd = msgStart + msgLen;
    const message = decrypted.subarray(msgStart, msgEnd).toString("utf8");
    const receiveId = decrypted.subarray(msgEnd).toString("utf8");

    const corpId = this.secrets.corpId;
    if (corpId && receiveId && receiveId !== String(corpId)) {
      throw new Error("WeCom receiveId mismatch");
    }

    return { message, receiveId };
  }

  decryptEchoStr(echostr) {
    const { message } = this._decrypt(String(echostr || ""));
    return message;
  }

  _parseDecryptedEvent(event = {}) {
    const msgType = String(
      event.MsgType || event.msgType || "text"
    ).toLowerCase();
    if (msgType !== "text") return null;

    const textContent = String(event.Content || event.text || "").trim();
    if (!textContent) return null;

    const senderId = String(event.FromUserName || event.fromUser || "unknown");
    const chatId = event.ChatId || event.chatId || null;
    const peerType = chatId ? "group" : "user";
    const peerId = String(chatId || senderId);

    const createTimeSec = Number(event.CreateTime || event.createTime || 0);

    return {
      messageId: String(event.MsgId || event.msgId || ""),
      eventId: String(event.MsgId || event.eventId || event.msgid || ""),
      provider: "wecom",
      accountId: String(
        event.ToUserName || event.toUser || this.account.accountId
      ),
      peerType,
      peerId,
      senderId,
      senderName: String(event.FromUserName || senderId),
      contentType: "text",
      textContent,
      rawContent: event,
      isMentioned:
        String(event.IsMentioned || "").toLowerCase() === "true" ||
        /@.+/.test(textContent),
      timestamp: Number((createTimeSec || Date.now() / 1000) * 1000),
      replyTarget: {
        peerType,
        peerId,
        senderId,
      },
    };
  }

  parseEvent(rawEvent) {
    if (!rawEvent) return null;

    // URL verification challenge: encrypted `echostr` in query.
    if (typeof rawEvent === "object" && rawEvent.echostr) {
      const challenge = this.decryptEchoStr(rawEvent.echostr);
      return { type: "challenge", challenge };
    }

    // Safe mode callbacks: encrypted XML with <Encrypt>.
    const encrypted = extractEncryptFromRaw(rawEvent);
    if (encrypted) {
      const { message: decryptedXml } = this._decrypt(encrypted);
      const event = parseXmlToObject(decryptedXml);
      return this._parseDecryptedEvent(event);
    }

    // Plaintext/compatibility mode (object already contains message fields).
    if (typeof rawEvent === "object") {
      const event = rawEvent.event || rawEvent;
      return this._parseDecryptedEvent(event);
    }

    return null;
  }

  async refreshCredentials() {
    const now = Date.now();
    if (this.accessToken && this.accessTokenExpiresAt > now + 30_000) {
      return this.accessToken;
    }

    const corpId = this.secrets.corpId;
    const secret = this.secrets.secret;
    if (!corpId || !secret) {
      throw new Error("Missing WeCom corpId/secret");
    }

    const response = await fetch(
      `${WECOM_API_BASE}/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`,
      {
        method: "GET",
      }
    );

    const data = await response.json();
    if (!response.ok || data.errcode !== 0 || !data.access_token) {
      throw new Error(data.errmsg || "Failed to refresh WeCom access token");
    }

    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = now + Number(data.expires_in || 7200) * 1000;
    return this.accessToken;
  }

  async sendTextReply(peer, text) {
    const token = await this.refreshCredentials();

    const isGroup = peer.peerType === "group";
    const content = String(text || "");
    const agentId = Number(this.secrets.agentId);
    if (!isGroup && !agentId) {
      throw new Error("Missing WeCom agentId");
    }
    const response = isGroup
      ? await fetch(
          `${WECOM_API_BASE}/appchat/send?access_token=${encodeURIComponent(token)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatid: String(peer.peerId),
              msgtype: "text",
              text: { content },
            }),
          }
        )
      : await fetch(
          `${WECOM_API_BASE}/message/send?access_token=${encodeURIComponent(token)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              touser: String(peer.senderId || peer.peerId),
              msgtype: "text",
              agentid: agentId,
              text: { content },
              safe: 0,
            }),
          }
        );

    const data = await response.json();
    const ok = response.ok && data.errcode === 0;

    return {
      ok,
      status: response.status,
      data,
      messageId: data?.msgid || null,
      error: ok ? null : data?.errmsg || "Failed to send WeCom message",
    };
  }
}

module.exports = {
  WeComAdapter,
};
