const IMGatewayShell = require("../../../../utils/agents/runtime/imGatewayShell");

describe("IMGatewayShell", () => {
  test("returns the final SessionEngine result in IM Gateway format", async () => {
    const engine = {
      sessionId: "session_123",
      submitMessage: jest.fn(async function* () {
        yield { type: "result", content: "agent reply" };
      }),
    };

    const shell = new IMGatewayShell(engine);
    const result = await shell.handleMessage("hello");

    expect(engine.submitMessage).toHaveBeenCalledWith("hello");
    expect(result).toEqual({
      content: "agent reply",
      sessionId: "session_123",
    });
  });
});
