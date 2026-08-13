const TurnState = require("../../../../utils/agents/aibitat/turnState");

describe("TurnState", () => {
  test("tracks tool calls and paired results within a turn", () => {
    const state = new TurnState({
      messages: [{ role: "user", content: "hello" }],
      maxTurns: 5,
    });

    state.recordToolCall("web-search", '{"query":"hello"}', "tool-1");
    state.recordToolCall("read-file", '{"path":"README.md"}', "tool-2");

    expect(state.hasUnpairedToolCalls()).toBe(true);
    expect(state.getUnpairedToolCalls().map((call) => call.toolUseId)).toEqual([
      "tool-1",
      "tool-2",
    ]);

    const wasRecorded = state.recordToolResult("tool-1", {
      toolUseId: "tool-1",
      type: "success",
      content: "ok",
    });

    expect(wasRecorded).toBe(true);
    expect(state.getUnpairedToolCalls().map((call) => call.toolUseId)).toEqual([
      "tool-2",
    ]);
  });

  test("nextTurn increments turn count and clears per-turn tool state", () => {
    const state = new TurnState({
      messages: [{ role: "user", content: "hello" }],
      maxTurns: 3,
    });

    state.recordToolCall("web-search", '{"query":"hello"}', "tool-1");
    state.recordToolResult("tool-1", {
      toolUseId: "tool-1",
      type: "success",
      content: "ok",
    });
    state.messages.push({
      role: "function",
      name: "web-search",
      content: "ok",
    });

    const next = state.nextTurn();

    expect(next.turnCount).toBe(1);
    expect(next.messages).toEqual(state.messages);
    expect(next.toolCalls).toEqual([]);
    expect(next.toolResults).toEqual([]);
    expect(next.hasReachedMaxTurns()).toBe(false);
  });
});
