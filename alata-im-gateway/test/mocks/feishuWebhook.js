function createFeishuTextMessage({ text, groupId, senderId = "ou_test001" } = {}) {
  return {
    schema: "2.0",
    header: {
      event_id: `evt_${Date.now()}`,
      event_type: "im.message.receive_v1",
      create_time: String(Date.now()),
      token: "test-verification-token",
    },
    event: {
      sender: { sender_id: { open_id: senderId } },
      message: {
        message_id: `om_${Date.now()}`,
        chat_id: groupId || senderId,
        chat_type: groupId ? "group" : "p2p",
        content: JSON.stringify({ text }),
        message_type: "text",
      },
    },
  };
}

module.exports = { createFeishuTextMessage };

