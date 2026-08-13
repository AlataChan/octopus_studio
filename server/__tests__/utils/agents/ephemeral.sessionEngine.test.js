const { EphemeralAgentHandler } = require("../../../utils/agents/ephemeral");
const {
  USER_AGENT,
  WORKSPACE_AGENT,
} = require("../../../utils/agents/defaults");

describe("EphemeralAgentHandler session engine flag", () => {
  afterEach(() => {
    delete process.env.USE_SESSION_ENGINE;
  });

  test("uses SessionEngine when USE_SESSION_ENGINE=true", async () => {
    process.env.USE_SESSION_ENGINE = "true";

    const handler = new EphemeralAgentHandler({
      uuid: "ephemeral-session-engine",
      workspace: { id: 1 },
      prompt: "hello",
    });
    handler.aibitat = {
      start: jest.fn(),
    };
    handler.sessionEngine = {
      submitMessage: jest.fn(async function* () {
        yield { type: "result", content: "done" };
      }),
    };

    await handler.startAgentCluster();

    expect(handler.sessionEngine.submitMessage).toHaveBeenCalledWith("hello");
    expect(handler.aibitat.start).not.toHaveBeenCalled();
  });

  test("keeps the legacy AIbitat path when USE_SESSION_ENGINE is disabled", async () => {
    const handler = new EphemeralAgentHandler({
      uuid: "ephemeral-legacy",
      workspace: { id: 1 },
      prompt: "hello",
    });
    handler.aibitat = {
      start: jest.fn().mockResolvedValue("legacy"),
    };

    await handler.startAgentCluster();

    expect(handler.aibitat.start).toHaveBeenCalledWith({
      from: USER_AGENT.name,
      to: WORKSPACE_AGENT.name,
      content: "hello",
    });
  });
});
