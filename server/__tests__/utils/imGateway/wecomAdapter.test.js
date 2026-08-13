const crypto = require("crypto");
const { WeComAdapter } = require("../../../utils/imGateway/adapters/WeComAdapter");

function pkcs7Pad(buffer, blockSize = 32) {
  const pad = blockSize - (buffer.length % blockSize);
  const padding = Buffer.alloc(pad, pad);
  return Buffer.concat([buffer, padding]);
}

function sha1Sorted(items = []) {
  return crypto
    .createHash("sha1")
    .update(items.map((v) => String(v)).sort().join(""))
    .digest("hex");
}

function encryptWeComMessage({ aesKey, corpId, message }) {
  const random16 = Buffer.alloc(16, 0);
  const msgBuf = Buffer.from(String(message), "utf8");
  const msgLen = Buffer.alloc(4);
  msgLen.writeUInt32BE(msgBuf.length, 0);
  const corpBuf = Buffer.from(String(corpId), "utf8");

  const raw = Buffer.concat([random16, msgLen, msgBuf, corpBuf]);
  const padded = pkcs7Pad(raw, 32);

  const iv = aesKey.subarray(0, 16);
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
}

describe("WeComAdapter safe mode", () => {
  test("verifies signature and decrypts challenge echostr", () => {
    const aesKey = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
    const encodingAESKey = aesKey.toString("base64").slice(0, -1);
    const corpId = "wxcorp_test";
    const token = "token_test";

    const adapter = new WeComAdapter({
      account: { accountId: "acc" },
      secrets: {
        corpId,
        token,
        encodingAESKey,
      },
    });

    const timestamp = "1700000000";
    const nonce = "nonce";
    const echostrEncrypted = encryptWeComMessage({
      aesKey,
      corpId,
      message: "echo_ok",
    });
    const signature = sha1Sorted([token, timestamp, nonce, echostrEncrypted]);

    expect(
      adapter.verifyWebhook({
        query: { msg_signature: signature, timestamp, nonce, echostr: echostrEncrypted },
      })
    ).toBe(true);

    const parsed = adapter.parseEvent({ echostr: echostrEncrypted });
    expect(parsed.type).toBe("challenge");
    expect(parsed.challenge).toBe("echo_ok");
  });

  test("decrypts encrypted XML event into StandardMessage", () => {
    const aesKey = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
    const encodingAESKey = aesKey.toString("base64").slice(0, -1);
    const corpId = "wxcorp_test";
    const token = "token_test";

    const adapter = new WeComAdapter({
      account: { accountId: "acc" },
      secrets: {
        corpId,
        token,
        encodingAESKey,
        agentId: 1000002,
      },
    });

    const plain = `<xml>
      <ToUserName><![CDATA[toUser]]></ToUserName>
      <FromUserName><![CDATA[fromUser]]></FromUserName>
      <CreateTime>1700000000</CreateTime>
      <MsgType><![CDATA[text]]></MsgType>
      <Content><![CDATA[hello world]]></Content>
      <MsgId>123456</MsgId>
    </xml>`;

    const encrypted = encryptWeComMessage({ aesKey, corpId, message: plain });
    const wrapper = `<xml><ToUserName><![CDATA[toUser]]></ToUserName><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`;

    const timestamp = "1700000000";
    const nonce = "nonce";
    const signature = sha1Sorted([token, timestamp, nonce, encrypted]);

    expect(
      adapter.verifyWebhook({
        query: { msg_signature: signature, timestamp, nonce },
        rawBody: wrapper,
        body: wrapper,
      })
    ).toBe(true);

    const msg = adapter.parseEvent(wrapper);
    expect(msg).not.toBeNull();
    expect(msg.provider).toBe("wecom");
    expect(msg.textContent).toBe("hello world");
    expect(msg.peerType).toBe("user");
    expect(msg.peerId).toBe("fromUser");
    expect(msg.senderId).toBe("fromUser");
    expect(msg.eventId).toBe("123456");
  });
});

