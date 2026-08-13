/**
 * runtimeLoopLegacyPath.test.js
 *
 * Tests the LEGACY async path of handleAsyncExecution — the code path that
 * runs when isTurnStateEnabled() is false (i.e. USE_TURN_STATE is NOT "true").
 *
 * Production does NOT set USE_TURN_STATE, so this is the path that actually
 * runs in production. The sibling file runtimeLoop.test.js sets
 * process.env.USE_TURN_STATE = "true" at module load and tests the turn-state
 * path exclusively. This file deliberately leaves USE_TURN_STATE unset so
 * that every test here exercises the legacy branch.
 *
 * Key legacy logic under test (server/utils/agents/aibitat/index.js ~2259-2290):
 *   - If shouldRequireDoneTool() && !_taskComplete && requireDoneAttempts < 1
 *     → emit rejected-draft status, recurse with requireDoneAttempts+1 (ONE nudge)
 *   - On the second call (requireDoneAttempts === 1, which is NOT < 1)
 *     → return the prose answer via the normal message path (NOT markTaskComplete, to avoid a duplicate bubble)
 *     → return completionStream.textResponse
 */

// DO NOT set process.env.USE_TURN_STATE here — we want the legacy path.

jest.mock("../../../../utils/agents/aibitat/providers/index.js", () => ({}));
jest.mock("../../../../models/telemetry.js", () => ({
  Telemetry: { sendTelemetry: jest.fn() },
}));
jest.mock("../../../../utils/agents/toolStats.js", () => ({
  toolStats: {
    startCall: jest.fn(() => "call-1"),
    endCall: jest.fn(),
  },
}));
jest.mock("../../../../models/invocationStep", () => ({
  InvocationStep: {
    StepTypes: { TOOL_CALL: "tool_call" },
    create: jest.fn(),
  },
}));
jest.mock("../../../../models/workflowPendingConfirmation", () => ({
  WorkflowPendingConfirmation: {},
}));
jest.mock("../../../../models/run", () => ({
  Run: {},
}));
jest.mock("../../../../utils/liveCanvas/runEventEmitter", () => ({
  runEventEmitter: { emitForSession: jest.fn() },
}));
jest.mock("../../../../utils/liveCanvas/types", () => ({
  SSE_EVENTS: {},
}));

const AIbitat = require("../../../../utils/agents/aibitat");

describe("AIbitat legacy async path (USE_TURN_STATE falsy)", () => {
  let savedUseTurnState;

  beforeEach(() => {
    // Save and clear USE_TURN_STATE so that isTurnStateEnabled() === false.
    savedUseTurnState = process.env.USE_TURN_STATE;
    delete process.env.USE_TURN_STATE;
  });

  afterEach(() => {
    // Restore to whatever it was before (could be undefined or a value from
    // another describe block in the same worker process).
    if (savedUseTurnState === undefined) {
      delete process.env.USE_TURN_STATE;
    } else {
      process.env.USE_TURN_STATE = savedUseTurnState;
    }
  });

  test("legacy path: adopts prose draft as final answer after exactly one nudge when done is never called", async () => {
    // Arrange
    const socketSend = jest.fn();

    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "legacy-require-done-test" },
        requireDoneToolOnStart: true,
      },
    });
    agent.socket = { send: socketSend };

    // provider.stream returns substantive prose on both attempts (no functionCall).
    // Attempt 1 (requireDoneAttempts=0): gets nudged → single status event emitted.
    // Attempt 2 (requireDoneAttempts=1, NOT < 1): prose adopted as final answer.
    const replies = [
      { textResponse: "rich prose answer attempt 1", functionCall: null },
      { textResponse: "rich prose answer attempt 2", functionCall: null },
    ];
    let callCount = 0;
    const provider = {
      stream: jest.fn(async (_messages, _functions, eventHandler) => {
        const reply = replies[callCount++];
        eventHandler?.("reportStreamEvent", {
          type: "textResponseChunk",
          uuid: `attempt-uuid-${callCount}`,
          content: reply.textResponse,
        });
        return reply;
      }),
    };

    // Act
    const result = await agent.handleAsyncExecution(
      provider,
      [{ role: "user", content: "explain something" }],
      [],
      "agent"
    );

    // Assert: provider.stream called exactly twice (1 nudge, then adoption)
    expect(provider.stream).toHaveBeenCalledTimes(2);

    // The second prose draft is returned as the result (delivered via the normal
    // streamed-message path, reconciled by uuid)
    expect(result).toBe("rich prose answer attempt 2");

    // It must NOT be marked task-complete — that would route through #chat's task-complete
    // newMessage and emit a SECOND duplicate bubble alongside the live-streamed one.
    expect(agent._taskComplete).toBe(false);

    // Exactly one "[草稿被拒，重试中]" status event must have been emitted
    const statusEvents = socketSend.mock.calls
      .filter(([type]) => type === "reportStreamEvent")
      .map(([, data]) => data)
      .filter(
        (event) =>
          event.type === "statusResponse" &&
          event.content.includes("[草稿被拒，重试中]")
      );
    expect(statusEvents).toHaveLength(1);

    // The first draft chunk must NOT have been forwarded to the socket
    // (it was buffered as a pending draft, not delivered to the client).
    const chunkEvents = socketSend.mock.calls
      .filter(([type]) => type === "reportStreamEvent")
      .map(([, data]) => data)
      .filter(
        (event) =>
          event.type === "textResponseChunk" &&
          event.uuid === "attempt-uuid-1"
      );
    expect(chunkEvents).toHaveLength(0);
  });

  test("legacy path: isTurnStateEnabled returns false — confirms we are on the legacy branch", () => {
    const agent = new AIbitat({
      handlerProps: { log: jest.fn() },
    });
    expect(agent.isTurnStateEnabled()).toBe(false);
  });

  test("legacy path: does NOT emit draft status when require-done is disabled", async () => {
    const socketSend = jest.fn();
    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        // requireDoneToolOnStart intentionally omitted (defaults to false)
      },
    });
    agent.socket = { send: socketSend };

    const provider = {
      stream: jest.fn(async (_messages, _functions, eventHandler) => {
        eventHandler?.("reportStreamEvent", {
          type: "textResponseChunk",
          uuid: "normal-uuid",
          content: "normal answer",
        });
        return { textResponse: "normal answer", functionCall: null };
      }),
    };

    const result = await agent.handleAsyncExecution(
      provider,
      [{ role: "user", content: "hello" }],
      [],
      "agent"
    );

    expect(result).toBe("normal answer");
    // Only called once — no nudge loop
    expect(provider.stream).toHaveBeenCalledTimes(1);
    // The text chunk was forwarded to the socket (no buffering)
    expect(socketSend).toHaveBeenCalledWith("reportStreamEvent", {
      type: "textResponseChunk",
      uuid: "normal-uuid",
      content: "normal answer",
    });
    // No draft-rejection status events
    expect(
      socketSend.mock.calls
        .filter(([type]) => type === "reportStreamEvent")
        .map(([, data]) => data)
        .filter(
          (event) =>
            event.type === "statusResponse" &&
            event.content.includes("[草稿被拒，重试中]")
        )
    ).toHaveLength(0);
  });
});
