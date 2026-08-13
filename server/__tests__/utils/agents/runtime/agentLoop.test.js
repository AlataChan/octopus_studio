const AgentLoop = require("../../../../utils/agents/runtime/agentLoop");

describe("AgentLoop", () => {
  test("delegates to AIbitat.start and yields a final result event", async () => {
    const aibitat = {
      _chats: [],
      start: jest.fn(async (route) => {
        aibitat._chats.push(
          route,
          {
            from: route.to,
            to: route.from,
            content: "agent reply",
            state: "success",
          }
        );
        return aibitat;
      }),
      abort: jest.fn(),
    };

    const loop = new AgentLoop({
      aibitat,
      route: {
        from: "user",
        to: "workspace-agent",
      },
    });

    const events = [];
    for await (const event of loop.run("hello")) {
      events.push(event);
    }

    expect(aibitat.start).toHaveBeenCalledWith({
      from: "user",
      to: "workspace-agent",
      content: "hello",
    });
    expect(events).toEqual([{ type: "result", content: "agent reply" }]);
    expect(loop.getResult()).toBe("agent reply");
  });

  test("abort delegates to the wrapped AIbitat instance", () => {
    const aibitat = {
      abort: jest.fn(),
    };
    const loop = new AgentLoop({
      aibitat,
      route: {
        from: "user",
        to: "workspace-agent",
      },
    });

    loop.abort("stop");

    expect(aibitat.abort).toHaveBeenCalled();
  });
});
