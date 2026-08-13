const crypto = require("crypto");
const { FeishuAdapter } = require("../../../utils/imGateway/adapters/FeishuAdapter");

function encryptFeishuPayload(payload, encryptKey) {
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, encrypted]).toString("base64");
}

describe("FeishuAdapter", () => {
  test("parses application.bot.menu_v6 into a menu_action trigger", () => {
    const adapter = new FeishuAdapter({
      account: { accountId: "feishu-app-1" },
      secrets: {},
    });

    const parsed = adapter.parseEvent({
      schema: "2.0",
      header: {
        event_id: "evt_menu_1",
        event_type: "application.bot.menu_v6",
      },
      event: {
        event_key: "help_center",
        operator: {
          operator_name: "Alice",
          operator_id: {
            open_id: "ou_user_001",
          },
        },
      },
    });

    expect(parsed.triggerType).toBe("menu_action");
    expect(parsed.eventType).toBe("application.bot.menu_v6");
    expect(parsed.eventKey).toBe("help_center");
    expect(parsed.senderId).toBe("ou_user_001");
    expect(parsed.replyTarget).toEqual({
      receiveIdType: "open_id",
      receiveId: "ou_user_001",
    });
  });

  test("verifies encrypted callbacks with encryptKey signature", () => {
    const encryptKey = "feishu_encrypt_key";
    const timestamp = "1700000000";
    const nonce = "nonce_123";
    const body = {
      encrypt: encryptFeishuPayload(
        {
          type: "url_verification",
          challenge: "encrypted_challenge",
        },
        encryptKey
      ),
    };
    const rawBody = JSON.stringify(body);
    const signature = crypto
      .createHash("sha256")
      .update(`${timestamp}${nonce}${encryptKey}${rawBody}`)
      .digest("hex");

    const adapter = new FeishuAdapter({
      account: { accountId: "feishu-app-1" },
      secrets: { encryptKey },
    });

    expect(
      adapter.verifyWebhook({
        headers: {
          "x-lark-request-timestamp": timestamp,
          "x-lark-request-nonce": nonce,
          "x-lark-signature": signature,
        },
        rawBody,
        body,
      })
    ).toBe(true);
  });

  test("decrypts encrypted url_verification payloads", () => {
    const encryptKey = "feishu_encrypt_key";
    const adapter = new FeishuAdapter({
      account: { accountId: "feishu-app-1" },
      secrets: { encryptKey },
    });

    const parsed = adapter.parseEvent({
      encrypt: encryptFeishuPayload(
        {
          type: "url_verification",
          challenge: "challenge_from_encrypt",
        },
        encryptKey
      ),
    });

    expect(parsed).toEqual({
      type: "challenge",
      challenge: "challenge_from_encrypt",
    });
  });

  test("decrypts encrypted message callbacks", () => {
    const encryptKey = "feishu_encrypt_key";
    const adapter = new FeishuAdapter({
      account: { accountId: "feishu-app-1" },
      secrets: { encryptKey },
    });

    const parsed = adapter.parseEvent({
      encrypt: encryptFeishuPayload(
        {
          schema: "2.0",
          header: {
            event_id: "evt_text_1",
            event_type: "im.message.receive_v1",
          },
          event: {
            message: {
              message_id: "om_text_1",
              message_type: "text",
              content: JSON.stringify({ text: "hello from encrypt" }),
            },
            sender: {
              sender_id: { open_id: "ou_user_002" },
              sender_name: "Bob",
            },
          },
        },
        encryptKey
      ),
    });

    expect(parsed.triggerType).toBe("message");
    expect(parsed.eventType).toBe("im.message.receive_v1");
    expect(parsed.senderId).toBe("ou_user_002");
    expect(parsed.textContent).toBe("hello from encrypt");
  });
});
