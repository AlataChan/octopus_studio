const CONTENT_LIMIT_BYTES = 64 * 1024;
const RAW_PAYLOAD_LIMIT_BYTES = 1024 * 1024;
const MESSAGE_EVENT_TYPES = new Set(["im.message.receive_v1", "message"]);

function parseFeishuText(content) {
  if (!content) return "";
  if (typeof content === "string") {
    try {
      const p = JSON.parse(content);
      return typeof p?.text === "string" ? p.text : content;
    } catch {
      return content;
    }
  }
  return String(content?.text || "");
}

function payloadSize(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Infinity;
  }
}

function normalizeFeishuEvent({ schema, header = {}, event = {}, accountId }) {
  header = header || {};
  event = event || {};

  const eventType = header.event_type || event.type;
  if (!MESSAGE_EVENT_TYPES.has(eventType)) return null;

  const msg = schema === "2.0" ? event.message : event;
  if (!msg) return null;

  const sender = schema === "2.0" ? event.sender : event;
  if (!sender) return null;

  const eventId = header.event_id || msg.message_id || "";
  if (!eventId) return null;

  const senderId = sender?.sender_id?.open_id || sender?.open_id || "";
  if (!senderId) return null;

  if (!msg.chat_id && !msg.group_id) return null;
  if (payloadSize(msg.content) > CONTENT_LIMIT_BYTES) return null;
  if (payloadSize({ schema, header, event }) > RAW_PAYLOAD_LIMIT_BYTES) return null;

  const senderName = sender?.sender_id?.name || sender?.sender_name || "";

  const chatId = msg.chat_id || msg.group_id || senderId;
  const chatType = msg.chat_type || (msg.group_id ? "group" : "p2p");
  const peerType = chatType === "group" ? "group" : "user";
  const peerId = chatType === "group" ? chatId : senderId;

  const contentType = msg.message_type || "text";
  const rawContent = msg.content || {};
  let textContent = "";
  if (contentType === "text") textContent = parseFeishuText(rawContent);

  const isMentioned = peerType === "user" || String(textContent).includes("@");

  return {
    triggerType: "message",
    eventType,
    messageId: msg.message_id || "",
    eventId,
    provider: "feishu",
    accountId,
    peerType,
    peerId,
    senderId,
    senderName,
    contentType,
    textContent,
    rawContent,
    isMentioned,
    timestamp: parseInt(header.create_time || msg.create_time || Date.now()),
    replyTarget: {
      receiveIdType: peerType === "group" ? "chat_id" : "open_id",
      receiveId: peerType === "group" ? peerId : senderId,
    },
  };
}

module.exports = { normalizeFeishuEvent };
