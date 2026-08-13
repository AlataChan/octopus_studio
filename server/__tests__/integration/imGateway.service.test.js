/**
 * IM Gateway 服务层集成测试
 *
 * 测试范围：IMGatewayService 内部链路 — verifyWebhook → acceptInbound → 队列 → EphemeralAgent → sendTextReply
 * 不覆盖：Express 路由、中间件鉴权、Prisma 真实读写（这些由 imGateway.runtime.test.js 和未来的 HTTP 级 E2E 覆盖）
 *
 * 关键技术点：
 * - jest.config 有 resetMocks: true，所有 mock 必须在 beforeEach 里重新配置
 * - service.js destructuring 捕获 createAdapter，必须用 jest.mock
 * - 适配器方法：parseEvent / sendTextReply / sendErrorFeedback
 * - 队列空闲判断：queue.idle（不是 queue.size）
 */

// jest.mock hoisted — 工厂函数返回 jest.fn()，具体实现在 beforeEach 中配置
jest.mock("../../utils/imGateway/adapters", () => ({
  createAdapter: jest.fn(),
}));

jest.mock("../../utils/agents/ephemeral", () => ({
  EphemeralAgentHandler: jest.fn(),
  EphemeralEventListener: jest.fn(),
}));

jest.mock("../../models/channelAccount", () => ({
  ChannelAccount: { get: jest.fn(), parseSecrets: jest.fn() },
}));

jest.mock("../../models/channelBinding", () => ({
  ChannelBinding: { getEnabledByAccount: jest.fn() },
}));

jest.mock("../../models/channelMessageEvent", () => ({
  ChannelMessageEvent: {
    create: jest.fn(),
    findByEventId: jest.fn(),
    updateStatus: jest.fn(),
  },
}));

jest.mock("../../models/workflowPendingConfirmation", () => ({
  WorkflowPendingConfirmation: { findPending: jest.fn(), get: jest.fn() },
}));

jest.mock("../../utils/imGateway/session/SessionManager", () => ({
  SessionManager: jest.fn(),
}));

const { IMGatewayService } = require("../../utils/imGateway/service");
const { createAdapter } = require("../../utils/imGateway/adapters");
const { ChannelAccount } = require("../../models/channelAccount");
const { ChannelBinding } = require("../../models/channelBinding");
const { ChannelMessageEvent } = require("../../models/channelMessageEvent");
const {
  EphemeralAgentHandler,
  EphemeralEventListener,
} = require("../../utils/agents/ephemeral");
const {
  SessionManager,
} = require("../../utils/imGateway/session/SessionManager");

const TEST_PROVIDER = "feishu";
const TEST_ACCOUNT_ID = "feishu-e2e-test";

const MOCK_ACCOUNT = {
  id: 1,
  provider: TEST_PROVIDER,
  accountId: TEST_ACCOUNT_ID,
  status: "active",
  encryptedSecrets: "mock-encrypted",
};

const MOCK_BINDING = {
  id: "binding-1",
  provider: TEST_PROVIDER,
  accountId: TEST_ACCOUNT_ID,
  workspaceId: 1,
  enabled: true,
  match: {},
  route: { assistantId: "1", sessionScope: "per-channel-peer" },
  security: { permissionMode: "permissive" },
  priority: 10,
};

const FEISHU_RAW_EVENT = {
  schema: "2.0",
  header: {
    event_id: "test-event-id-001",
    event_type: "im.message.receive_v1",
  },
  event: {
    message: {
      message_id: "om_test_001",
      message_type: "text",
      content: JSON.stringify({ text: "你好" }),
    },
    sender: {
      sender_id: { open_id: "ou_user_001" },
      sender_type: "user",
    },
  },
};

describe("IMGateway Service Integration — Feishu webhook → agent reply", () => {
  let service;
  let mockSendTextReply;

  afterEach(async () => {
    // Wait for queue to drain to prevent open handle warnings
    if (service?.queue) {
      const deadline = Date.now() + 2000;
      while (!service.queue.idle && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  });

  beforeEach(() => {
    // === Re-configure ALL mocks (resetMocks: true clears them every time) ===

    mockSendTextReply = jest.fn().mockResolvedValue({ ok: true });

    // Adapter
    createAdapter.mockReturnValue({
      verifyWebhook: jest.fn().mockReturnValue(true),
      parseEvent: jest.fn().mockReturnValue({
        messageId: "om_test_001",
        eventId: "test-event-id-001",
        provider: "feishu",
        accountId: TEST_ACCOUNT_ID,
        peerType: "user",
        peerId: "ou_user_001",
        senderId: "ou_user_001",
        senderName: "",
        contentType: "text",
        textContent: "你好",
        rawContent: FEISHU_RAW_EVENT,
        isMentioned: false,
        timestamp: Date.now(),
        replyTarget: { receiveIdType: "open_id", receiveId: "ou_user_001" },
      }),
      sendTextReply: mockSendTextReply,
      sendErrorFeedback: jest.fn().mockResolvedValue({ ok: true }),
    });

    // Models
    ChannelAccount.get.mockImplementation(async ({ provider, accountId }) => {
      if (provider === TEST_PROVIDER && accountId === TEST_ACCOUNT_ID)
        return MOCK_ACCOUNT;
      return null;
    });
    ChannelAccount.parseSecrets.mockReturnValue({
      appId: "test-app-id",
      appSecret: "test-app-secret",
      verificationToken: "test-token",
      encryptKey: "",
    });

    ChannelBinding.getEnabledByAccount.mockImplementation(
      async (provider, accountId) => {
        if (provider === TEST_PROVIDER && accountId === TEST_ACCOUNT_ID)
          return [MOCK_BINDING];
        return [];
      }
    );

    ChannelMessageEvent.create.mockResolvedValue({ id: 1, duplicate: false });
    ChannelMessageEvent.updateStatus.mockResolvedValue(true);
    ChannelMessageEvent.findByEventId.mockResolvedValue(null);

    // SessionManager — instantiated by service constructor, re-mock for new instances
    SessionManager.mockImplementation(() => ({
      getOrCreateThread: jest.fn().mockResolvedValue({
        workspace: { id: 1, slug: "test-workspace" },
        thread: { id: 1 },
        session: { sessionKey: "test-session-key" },
      }),
      buildSessionKey: jest.fn().mockReturnValue("test-session-key"),
    }));

    // EphemeralAgentHandler
    EphemeralAgentHandler.mockImplementation(() => ({
      init: jest.fn().mockResolvedValue(undefined),
      createAIbitat: jest.fn().mockResolvedValue(undefined),
      startAgentCluster: jest.fn(),
      aibitat: { setPermissionConfig: jest.fn(), handlerProps: {} },
    }));

    // EphemeralEventListener
    EphemeralEventListener.mockImplementation(() => {
      const { EventEmitter } = require("events");
      const emitter = new EventEmitter();
      emitter.responseText = () => "agent reply text";
      emitter.waitForClose = jest
        .fn()
        .mockResolvedValue({ textResponse: "agent reply text" });
      return emitter;
    });

    // Create fresh service with newly configured SessionManager
    service = new IMGatewayService();
  });

  it("full pipeline: verifyWebhook → acceptInbound → queue → agent → sendTextReply", async () => {
    const mockRequest = {
      headers: {
        "x-lark-signature": "mock-sig",
        "x-lark-request-timestamp": String(Date.now()),
        "x-lark-request-nonce": "test-nonce",
      },
      body: FEISHU_RAW_EVENT,
    };

    // Step 1: verifyWebhook
    const verifyResult = await service.verifyWebhook({
      provider: TEST_PROVIDER,
      accountId: TEST_ACCOUNT_ID,
      request: mockRequest,
    });
    expect(verifyResult.ok).toBe(true);

    // Step 2: acceptInbound → queued
    const inboundResult = await service.acceptInbound({
      provider: TEST_PROVIDER,
      accountId: TEST_ACCOUNT_ID,
      rawEvent: FEISHU_RAW_EVENT,
      query: {},
      request: mockRequest,
    });
    expect(inboundResult.accepted).toBe(true);
    expect(inboundResult.queued).toBe(true);
    expect(inboundResult.ignored).toBeFalsy();

    // Step 3: 等待队列处理完成
    const deadline = Date.now() + 5000;
    while (!service.queue.idle && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(service.queue.idle).toBe(true);

    // Step 4: 验证核心链路
    expect(EphemeralAgentHandler).toHaveBeenCalled();
    expect(mockSendTextReply).toHaveBeenCalled();
  });

  it("verifyWebhook returns ok:false for unknown account", async () => {
    const result = await service.verifyWebhook({
      provider: TEST_PROVIDER,
      accountId: "nonexistent-account-xyz",
      request: { headers: {}, body: {} },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("ACCOUNT_NOT_FOUND");
  });

  it("acceptInbound returns ignored:true for unknown account", async () => {
    const result = await service.acceptInbound({
      provider: TEST_PROVIDER,
      accountId: "nonexistent-account-xyz",
      rawEvent: {},
      query: {},
      request: null,
    });
    expect(result.accepted).toBe(true);
    expect(result.ignored).toBe(true);
    expect(result.reason).toBe("ACCOUNT_NOT_FOUND");
  });

  it("acceptInbound handles feishu url_verification challenge", async () => {
    const result = await service.acceptInbound({
      provider: TEST_PROVIDER,
      accountId: TEST_ACCOUNT_ID,
      rawEvent: {
        type: "url_verification",
        challenge: "test-challenge-token",
      },
      query: {},
      request: null,
    });
    expect(result.accepted).toBe(true);
    expect(result.challenge).toBe("test-challenge-token");
  });

  it("acceptInbound handles encrypted feishu url_verification challenge", async () => {
    createAdapter.mockReturnValue({
      verifyWebhook: jest.fn().mockReturnValue(true),
      parseEvent: jest.fn().mockReturnValue({
        type: "challenge",
        challenge: "challenge_from_encrypt",
      }),
      sendTextReply: mockSendTextReply,
      sendErrorFeedback: jest.fn().mockResolvedValue({ ok: true }),
    });

    const result = await service.acceptInbound({
      provider: TEST_PROVIDER,
      accountId: TEST_ACCOUNT_ID,
      rawEvent: {
        encrypt: "encrypted-body",
      },
      query: {},
      request: null,
    });

    expect(result.accepted).toBe(true);
    expect(result.challenge).toBe("challenge_from_encrypt");
    expect(result.queued).toBeUndefined();
  });

  it("routes a feishu menu action by event key", async () => {
    createAdapter.mockReturnValue({
      verifyWebhook: jest.fn().mockReturnValue(true),
      parseEvent: jest.fn().mockReturnValue({
        triggerType: "menu_action",
        eventType: "application.bot.menu_v6",
        eventKey: "help_center",
        messageId: "evt_menu_help",
        eventId: "evt_menu_help",
        provider: "feishu",
        accountId: TEST_ACCOUNT_ID,
        peerType: "user",
        peerId: "ou_user_001",
        senderId: "ou_user_001",
        senderName: "Alice",
        contentType: "event",
        textContent: "",
        rawContent: {
          schema: "2.0",
          header: {
            event_id: "evt_menu_help",
            event_type: "application.bot.menu_v6",
          },
          event: {
            event_key: "help_center",
          },
        },
        isMentioned: true,
        timestamp: Date.now(),
        replyTarget: { receiveIdType: "open_id", receiveId: "ou_user_001" },
      }),
      sendTextReply: mockSendTextReply,
      sendErrorFeedback: jest.fn().mockResolvedValue({ ok: true }),
    });

    ChannelBinding.getEnabledByAccount.mockResolvedValue([
      {
        id: "binding-menu-1",
        provider: TEST_PROVIDER,
        accountId: TEST_ACCOUNT_ID,
        workspaceId: 1,
        enabled: true,
        match: {
          triggerType: "menu_action",
          eventType: "application.bot.menu_v6",
          eventKey: "help_center",
        },
        route: {
          assistantId: "1",
          sessionScope: "per-channel-peer",
          inputTemplate: "用户点击了帮助中心菜单，请回复帮助内容。",
        },
        security: { permissionMode: "permissive" },
        priority: 10,
      },
    ]);

    const result = await service.acceptInbound({
      provider: TEST_PROVIDER,
      accountId: TEST_ACCOUNT_ID,
      rawEvent: {
        schema: "2.0",
        header: {
          event_id: "evt_menu_help",
          event_type: "application.bot.menu_v6",
        },
        event: {
          event_key: "help_center",
        },
      },
      query: {},
      request: null,
    });

    expect(result.accepted).toBe(true);
    expect(result.queued).toBe(true);

    const deadline = Date.now() + 5000;
    while (!service.queue.idle && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(EphemeralAgentHandler).toHaveBeenCalled();
    expect(EphemeralAgentHandler.mock.calls[0][0].prompt).toBe(
      "用户点击了帮助中心菜单，请回复帮助内容。"
    );
  });
});
