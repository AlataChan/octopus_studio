const { matchBinding } = require("../../../utils/imGateway/router/BindingMatcher");

describe("BindingMatcher", () => {
  test("selects most specific binding first", () => {
    const bindings = [
      {
        id: "default",
        enabled: true,
        priority: 10,
        match: { peerType: "group", peerId: "*" },
      },
      {
        id: "peer-only",
        enabled: true,
        priority: 50,
        match: { peerType: "group", peerId: "chat_123" },
      },
      {
        id: "peer-and-sender",
        enabled: true,
        priority: 1,
        match: {
          peerType: "group",
          peerId: "chat_123",
          senderAllowlist: ["ou_abc"],
        },
      },
    ];

    const matched = matchBinding(bindings, {
      peerType: "group",
      peerId: "chat_123",
      senderId: "ou_abc",
    });

    expect(matched.id).toBe("peer-and-sender");
  });

  test("returns null when no binding matches", () => {
    const matched = matchBinding(
      [
        {
          id: "group-only",
          enabled: true,
          priority: 1,
          match: { peerType: "group", peerId: "*" },
        },
      ],
      {
        peerType: "user",
        peerId: "u_1",
        senderId: "u_1",
      }
    );

    expect(matched).toBeNull();
  });

  test("matches menu_action bindings by event key", () => {
    const matched = matchBinding(
      [
        {
          id: "menu-help",
          enabled: true,
          priority: 10,
          match: {
            triggerType: "menu_action",
            eventType: "application.bot.menu_v6",
            eventKey: "help_center",
          },
        },
      ],
      {
        triggerType: "menu_action",
        eventType: "application.bot.menu_v6",
        eventKey: "help_center",
      }
    );

    expect(matched.id).toBe("menu-help");
  });
});
