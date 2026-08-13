const crypto = require("crypto");
const axios = require("axios");
const { parseStringPromise } = require("xml2js");
const { ChannelAdapter } = require("./ChannelAdapter");
const { getDb } = require("../db");
const { ERROR_TEMPLATES } = require("../outbound/errorTemplates");

const WECOM_API_BASE = "https://qyapi.weixin.qq.com/cgi-bin";

class WeComAdapter extends ChannelAdapter {
  constructor({ accountId, secrets }) {
    super({ provider: "wecom", accountId, secrets });
    this._accessToken = null;
    this._tokenExpiresAt = 0;
    this._dedupTtlMs = parseInt(process.env.GATEWAY_DEDUP_TTL_MS || "86400000");
  }

  verifyWebhook(req) {
    const { token } = this.secrets;
    if (!token) return true;

    const { msg_signature, timestamp, nonce, echostr } = req.query || {};
    if (!msg_signature || !timestamp || !nonce) return false;

    const body = req.body || {};
    let encrypt =
      echostr ||
      body.xml?.Encrypt?.[0] ||
      body.Encrypt ||
      body.xml?.Encrypt ||
      body.Encrypt ||
      "";
    if (!encrypt && typeof req.body === "string") {
      const raw = req.body;
      const cdataMatch = raw.match(
        /<Encrypt><!\[CDATA\[([\s\S]*?)\]\]><\/Encrypt>/
      );
      const plainMatch = raw.match(/<Encrypt>([\s\S]*?)<\/Encrypt>/);
      encrypt = (cdataMatch?.[1] || plainMatch?.[1] || "").trim();
    }
    if (!encrypt) return false;

    const parts = [token, timestamp, nonce, encrypt].filter(Boolean).sort();
    const expected = crypto.createHash("sha1").update(parts.join("")).digest("hex");
    return expected === msg_signature;
  }

  _aesDecrypt(encryptedStr) {
    const { encodingAesKey } = this.secrets;
    if (!encodingAesKey) return null;

    const aesKey = Buffer.from(encodingAesKey + "=", "base64");
    const iv = aesKey.slice(0, 16);
    const encrypted = Buffer.from(String(encryptedStr || ""), "base64");
    const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
    decipher.setAutoPadding(false);

    let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const pad = decrypted[decrypted.length - 1];
    if (pad < 1 || pad > 32) return null;
    decrypted = decrypted.slice(0, decrypted.length - pad);
    const msgLen = decrypted.readUInt32BE(16);
    return decrypted.slice(20, 20 + msgLen).toString("utf8");
  }

  async parseEvent(rawBody) {
    if (!rawBody) return null;

    // For POST callbacks, WeCom sends encrypted XML with <Encrypt>
    let xmlObj = null;
    if (typeof rawBody === "string") {
      try {
        const parsed = await parseStringPromise(rawBody, { explicitArray: true });
        xmlObj = parsed.xml || parsed;
      } catch {
        return null;
      }
    } else if (typeof rawBody === "object") {
      xmlObj = rawBody.xml || rawBody;
    }

    const encrypt = xmlObj?.Encrypt?.[0] || xmlObj?.Encrypt || null;
    if (!encrypt) return null;

    const decryptedXml = this._aesDecrypt(encrypt);
    if (!decryptedXml) return null;

    let parsed;
    try {
      const result = await parseStringPromise(decryptedXml, { explicitArray: true });
      parsed = result.xml || {};
    } catch {
      return null;
    }

    const get = (key) => {
      const v = parsed[key];
      return Array.isArray(v) ? v[0] : v;
    };

    const msgType = String(get("MsgType") || "").toLowerCase();
    if (msgType !== "text" && msgType !== "voice") return null;

    const fromUser = get("FromUserName") || "";
    const chatId = get("ChatId") || "";
    const msgId = String(get("MsgId") || Date.now());
    const createTime = parseInt(get("CreateTime") || "0") * 1000;
    const content = get("Content") || "";

    const isGroup = !!chatId;
    const peerId = isGroup ? chatId : fromUser;

    return {
      messageId: msgId,
      eventId: msgId,
      provider: "wecom",
      accountId: this.accountId,
      peerType: isGroup ? "group" : "user",
      peerId,
      senderId: fromUser,
      senderName: fromUser,
      contentType: msgType,
      textContent: content,
      rawContent: { ...parsed, _decrypted: true },
      isMentioned: true,
      timestamp: createTime || Date.now(),
    };
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
      .run(eventId, "wecom", Date.now());
  }

  async _ensureAccessToken() {
    if (this._accessToken && Date.now() < this._tokenExpiresAt - 60_000) {
      return this._accessToken;
    }
    const { corpId, corpSecret } = this.secrets;
    const { data } = await axios.get(`${WECOM_API_BASE}/gettoken`, {
      params: { corpid: corpId, corpsecret: corpSecret },
    });
    if (data.errcode !== 0) throw new Error(`WeCom token error: ${data.errmsg}`);
    this._accessToken = data.access_token;
    this._tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this._accessToken;
  }

  async sendTextReply(peer, text) {
    const token = await this._ensureAccessToken();
    try {
      const body = {
        msgtype: "text",
        agentid: parseInt(this.secrets.agentId || "0"),
        text: { content: text },
        ...(peer.peerType === "group" ? { chatid: peer.peerId } : { touser: peer.peerId }),
      };

      const endpoint =
        peer.peerType === "group"
          ? `${WECOM_API_BASE}/appchat/send?access_token=${token}`
          : `${WECOM_API_BASE}/message/send?access_token=${token}`;

      const { data } = await axios.post(endpoint, body);
      return { ok: data.errcode === 0, error: data.errmsg };
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

module.exports = { WeComAdapter };
