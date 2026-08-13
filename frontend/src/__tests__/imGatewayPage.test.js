import { describe, expect, it } from "vitest";

import {
  buildBindingPayload,
  buildAccountPayload,
} from "@/pages/Admin/ImGateway";

describe("IM Gateway page helpers", () => {
  it("builds a feishu menu-action binding payload", () => {
    const payload = buildBindingPayload({
      mode: "menu_action",
      form: {
        id: "",
        provider: "feishu",
        accountId: "feishu-app-1",
        workspaceId: "12",
        assistantId: "asst-1",
        eventKey: "help_center",
        inputTemplate: "用户点击了帮助菜单。",
        priority: "3",
        permissionMode: "default",
        enabled: true,
      },
    });

    expect(payload).toEqual(
      expect.objectContaining({
        provider: "feishu",
        accountId: "feishu-app-1",
        workspaceId: 12,
        match: {
          triggerType: "menu_action",
          eventType: "application.bot.menu_v6",
          eventKey: "help_center",
        },
        route: {
          assistantId: "asst-1",
          sessionScope: "per-channel-peer",
          inputTemplate: "用户点击了帮助菜单。",
        },
      })
    );
  });

  it("omits signingSecret from feishu account payloads", () => {
    const payload = buildAccountPayload({
      provider: "feishu",
      accountId: "",
      status: "active",
      tokenExpiresAt: "",
      appId: "cli_123",
      appSecret: "app-secret",
      verificationToken: "verify-token",
      signingSecret: "legacy-signing-secret",
      encryptKey: "encrypt-key",
    });

    expect(payload.accountId).toBe("cli_123");
    expect(payload.secrets).toEqual({
      appId: "cli_123",
      appSecret: "app-secret",
      verificationToken: "verify-token",
      encryptKey: "encrypt-key",
    });
  });
});
