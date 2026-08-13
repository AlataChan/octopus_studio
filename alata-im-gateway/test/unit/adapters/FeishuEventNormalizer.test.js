const { normalizeFeishuEvent } = require("../../../src/adapters/FeishuEventNormalizer");

const accountId = "cli_test_app";

function createMessageEvent({
  eventId = "evt_001",
  messageId = "om_001",
  chatId = "oc_group_001",
  chatType = "group",
  senderId = "ou_sender_001",
  senderName = "Sender One",
  text = "hello",
  content = JSON.stringify({ text }),
  eventType = "im.message.receive_v1",
  createTime = "1710000000000",
} = {}) {
  return {
    schema: "2.0",
    header: {
      event_id: eventId,
      event_type: eventType,
      create_time: createTime,
    },
    event: {
      sender: {
        sender_id: {
          open_id: senderId,
          name: senderName,
        },
      },
      message: {
        message_id: messageId,
        chat_id: chatId,
        chat_type: chatType,
        content,
        message_type: "text",
      },
    },
  };
}

function createLegacyMessageEvent({
  eventId = "evt_v1_001",
  messageId = "om_v1_001",
  groupId = "oc_v1_group_001",
  senderId = "ou_v1_sender_001",
  senderName = "Legacy Sender",
  text = "legacy hello",
  createTime = "1710000001000",
} = {}) {
  return {
    schema: undefined,
    header: {
      event_id: eventId,
      event_type: "message",
      create_time: createTime,
    },
    event: {
      type: "message",
      message_id: messageId,
      group_id: groupId,
      open_id: senderId,
      sender_name: senderName,
      content: JSON.stringify({ text }),
      message_type: "text",
    },
  };
}

describe("normalizeFeishuEvent", () => {
  test("normalizes im.message.receive_v1 group text messages", () => {
    const raw = createMessageEvent({ text: "hello @bot" });

    const result = normalizeFeishuEvent({ ...raw, accountId });

    expect(result).toEqual({
      triggerType: "message",
      eventType: "im.message.receive_v1",
      messageId: "om_001",
      eventId: "evt_001",
      provider: "feishu",
      accountId,
      peerType: "group",
      peerId: "oc_group_001",
      senderId: "ou_sender_001",
      senderName: "Sender One",
      contentType: "text",
      textContent: "hello @bot",
      rawContent: JSON.stringify({ text: "hello @bot" }),
      isMentioned: true,
      timestamp: 1710000000000,
      replyTarget: {
        receiveIdType: "chat_id",
        receiveId: "oc_group_001",
      },
    });
  });

  test("normalizes im.message.receive_v1 private text messages", () => {
    const raw = createMessageEvent({
      eventId: "evt_private",
      messageId: "om_private",
      chatId: "oc_private",
      chatType: "p2p",
      senderId: "ou_private_sender",
      senderName: "Private Sender",
      text: "hello",
    });

    const result = normalizeFeishuEvent({ ...raw, accountId });

    expect(result).toEqual(
      expect.objectContaining({
        messageId: "om_private",
        eventId: "evt_private",
        peerType: "user",
        peerId: "ou_private_sender",
        senderId: "ou_private_sender",
        senderName: "Private Sender",
        textContent: "hello",
        isMentioned: true,
        replyTarget: {
          receiveIdType: "open_id",
          receiveId: "ou_private_sender",
        },
      })
    );
  });

  test("returns null for event types outside the MVP whitelist", () => {
    const raw = createMessageEvent({ eventType: "im.chat.access_event_v1" });

    expect(normalizeFeishuEvent({ ...raw, accountId })).toBeNull();
  });

  test("returns null when both event_id and message_id are missing", () => {
    const raw = createMessageEvent({ eventId: "", messageId: "" });

    expect(normalizeFeishuEvent({ ...raw, accountId })).toBeNull();
  });

  test("returns null when content exceeds 64KB", () => {
    const raw = createMessageEvent({ content: "x".repeat(64 * 1024 + 1) });

    expect(normalizeFeishuEvent({ ...raw, accountId })).toBeNull();
  });

  test("passes through malformed text content as existing parseFeishuText behavior", () => {
    const raw = createMessageEvent({ content: "{not-json" });

    const result = normalizeFeishuEvent({ ...raw, accountId });

    expect(result).toEqual(
      expect.objectContaining({
        textContent: "{not-json",
        rawContent: "{not-json",
      })
    );
  });

  test("normalizes legacy schema v1 message group text messages", () => {
    const raw = createLegacyMessageEvent();

    const result = normalizeFeishuEvent({ ...raw, accountId });

    expect(result).toEqual(
      expect.objectContaining({
        triggerType: "message",
        eventType: "message",
        messageId: "om_v1_001",
        eventId: "evt_v1_001",
        peerType: "group",
        peerId: "oc_v1_group_001",
        senderId: "ou_v1_sender_001",
        senderName: "Legacy Sender",
        textContent: "legacy hello",
        replyTarget: {
          receiveIdType: "chat_id",
          receiveId: "oc_v1_group_001",
        },
      })
    );
  });

  test("returns null when sender is missing", () => {
    const raw = createMessageEvent();
    delete raw.event.sender;

    expect(normalizeFeishuEvent({ ...raw, accountId })).toBeNull();
  });

  test("returns null when chat_id and group_id are missing", () => {
    const raw = createMessageEvent();
    delete raw.event.message.chat_id;
    delete raw.event.message.group_id;

    expect(normalizeFeishuEvent({ ...raw, accountId })).toBeNull();
  });

  test("returns null when raw payload exceeds 1MB", () => {
    const raw = createMessageEvent({
      senderName: "x".repeat(1024 * 1024 + 1),
    });

    expect(normalizeFeishuEvent({ ...raw, accountId })).toBeNull();
  });
});
