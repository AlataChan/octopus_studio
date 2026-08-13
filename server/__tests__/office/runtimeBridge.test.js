const {
  createOfficeFinish,
  bridgeToolCall,
  bridgeSpeaking,
} = require("../../utils/office/runtimeBridge");

describe("runtimeBridge", () => {
  it("officeFinish emits error then end only once", () => {
    const projection = {
      handleInvocationError: jest.fn(),
      handleInvocationEnd: jest.fn(),
    };
    const officeFinish = createOfficeFinish({
      getProjection: () => projection,
      actorId: "asst-1",
      sessionId: "sess-1",
    });

    officeFinish(false);
    officeFinish(false);
    officeFinish(true);

    expect(projection.handleInvocationError).toHaveBeenCalledTimes(1);
    expect(projection.handleInvocationError).toHaveBeenCalledWith(
      "asst-1",
      "sess-1"
    );
    expect(projection.handleInvocationEnd).toHaveBeenCalledTimes(1);
    expect(projection.handleInvocationEnd).toHaveBeenCalledWith(
      "asst-1",
      "sess-1"
    );
  });

  it("officeFinish no-ops when projection or actor is missing", () => {
    const projection = {
      handleInvocationError: jest.fn(),
      handleInvocationEnd: jest.fn(),
    };

    createOfficeFinish({
      getProjection: () => null,
      actorId: "asst-1",
      sessionId: "sess-1",
    })(false);
    createOfficeFinish({
      getProjection: () => projection,
      actorId: null,
      sessionId: "sess-1",
    })(false);

    expect(projection.handleInvocationError).not.toHaveBeenCalled();
    expect(projection.handleInvocationEnd).not.toHaveBeenCalled();
  });

  it("bridgeToolCall only emits on start stage with assistant id", () => {
    const projection = {
      handleToolCall: jest.fn(),
    };
    bridgeToolCall({
      getProjection: () => projection,
      invocation: { assistant_id: "asst-1" },
      sessionId: "sess-1",
      toolName: "search_web",
      stage: "progress",
    });
    bridgeToolCall({
      getProjection: () => projection,
      invocation: { assistant_id: "asst-1" },
      sessionId: "sess-1",
      toolName: "search_web",
      stage: "start",
    });

    expect(projection.handleToolCall).toHaveBeenCalledTimes(1);
    expect(projection.handleToolCall).toHaveBeenCalledWith(
      "asst-1",
      "sess-1",
      "search_web"
    );
  });

  it("bridgeSpeaking ignores USER messages and uses message.content", () => {
    const projection = {
      handleSpeaking: jest.fn(),
    };
    bridgeSpeaking({
      getProjection: () => projection,
      invocation: { assistant_id: "asst-1" },
      sessionId: "sess-1",
      message: { from: "USER", content: "hello" },
    });
    bridgeSpeaking({
      getProjection: () => projection,
      invocation: { assistant_id: "asst-1" },
      sessionId: "sess-1",
      message: { from: "ASSISTANT", content: "working on it" },
    });

    expect(projection.handleSpeaking).toHaveBeenCalledTimes(1);
    expect(projection.handleSpeaking).toHaveBeenCalledWith(
      "asst-1",
      "sess-1",
      "working on it"
    );
  });
});
