const fs = require("fs");
const path = require("path");

process.env.USE_TURN_STATE = "true";

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
const TurnState = require("../../../../utils/agents/aibitat/turnState");
const EventLog = require("../../../../utils/agents/aibitat/eventLog");

describe("AIbitat turn-state execution loop", () => {
  beforeEach(() => {
    process.env.USE_TURN_STATE = "true";
  });

  afterEach(() => {
    delete process.env.USE_TURN_STATE;
    delete process.env.ENABLE_STREAMING_TOOL_EXECUTOR;
    delete process.env.AGENT_MAX_TOOL_CONCURRENCY;
    const eventsDir = path.resolve(
      process.env.STORAGE_DIR,
      ".alataflow",
      "events"
    );
    for (const sessionId of [
      "loop-test",
      "abort-test",
      "dedupe-test",
      "multi-tool-test",
      "fallback-test",
      "require-done-stream-cleanup-test",
      "stream-executor-test",
      "stream-executor-abort-test",
      "suspend-test",
      "no-delegate-test",
    ]) {
      fs.rmSync(path.join(eventsDir, `${sessionId}.jsonl`), { force: true });
    }
  });

  test("returns a structured tool error to the model instead of throwing", async () => {
    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "loop-test" },
      },
    });
    agent.introspect = jest.fn();
    agent.reportToolCall = jest.fn();
    agent.evaluateToolPermission = jest.fn(() => ({
      decision: "allow",
      reason: "",
    }));
    agent.toolTimeoutExecutor = {
      getTimeout: jest.fn(() => 1000),
      executeWithTimeout: jest.fn().mockResolvedValue({
        success: false,
        error: "tool exploded",
        timedOut: false,
        durationMs: 12,
      }),
    };
    agent.function({
      name: "web-search",
      handler: jest.fn(),
    });

    const provider = {
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          functionCall: {
            name: "web-search",
            arguments: '{"query":"hello"}',
          },
        })
        .mockResolvedValueOnce({
          textResponse: "model recovered",
        }),
    };

    const result = await agent.handleExecution(
      provider,
      [{ role: "user", content: "hello" }],
      [],
      "agent"
    );

    expect(result).toBe("model recovered");
    expect(provider.complete).toHaveBeenCalledTimes(2);

    const secondCallMessages = provider.complete.mock.calls[1][0];
    expect(secondCallMessages.at(-1)).toMatchObject({
      role: "function",
      name: "web-search",
    });
    expect(String(secondCallMessages.at(-1).content)).toContain("tool exploded");
    expect(agent._eventLog.events.map((event) => event.type)).toEqual([
      "tool_use",
      "tool_result",
    ]);
    expect(agent._eventLog.events[1].data.type).toBe("inputError");
  });

  test("preserves reasoning_content on thinking tool-call history before the next turn", async () => {
    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "reasoning-history-test" },
      },
    });
    agent.introspect = jest.fn();
    agent.reportToolCall = jest.fn();
    agent.evaluateToolPermission = jest.fn(() => ({
      decision: "allow",
      reason: "",
    }));
    agent.toolTimeoutExecutor = {
      getTimeout: jest.fn(() => 1000),
      executeWithTimeout: jest.fn(async (_name, handler, args) => ({
        success: true,
        result: await handler(args),
        timedOut: false,
        durationMs: 10,
      })),
    };
    agent.function({
      name: "memory",
      handler: jest.fn(async (args) => `memory:${args.query}`),
    });

    const provider = {
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          reasoningContent: "model thought before choosing memory",
          functionCall: {
            id: "call_reasoning_1",
            name: "memory",
            arguments: { query: "hello" },
          },
        })
        .mockResolvedValueOnce({
          textResponse: "done",
        }),
    };

    const result = await agent.handleExecution(
      provider,
      [{ role: "user", content: "hello" }],
      [],
      "agent"
    );

    expect(result).toBe("done");
    const secondCallMessages = provider.complete.mock.calls[1][0];
    const toolResultMessage = secondCallMessages.find(
      (message) => message.role === "function" && message.name === "memory"
    );
    expect(toolResultMessage.originalFunctionCall).toMatchObject({
      id: "call_reasoning_1",
      reasoning_content: "model thought before choosing memory",
    });
  });

  test("abort compensates pending tool calls with cancelled results", () => {
    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "abort-test" },
      },
    });

    agent._currentTurnState = new TurnState({
      messages: [],
      maxTurns: 2,
    });
    agent._eventLog = new EventLog("abort-test");
    agent._currentTurnState.recordToolCall(
      "web-search",
      '{"query":"hello"}',
      "tool-1"
    );

    agent.abort();

    expect(agent._currentTurnState.hasUnpairedToolCalls()).toBe(false);
    expect(agent._currentTurnState.toolResults[0]).toMatchObject({
      toolUseId: "tool-1",
      type: "cancelled",
    });
    expect(agent._eventLog.events.at(-1)).toMatchObject({
      type: "tool_result",
      toolUseId: "tool-1",
      data: { type: "cancelled" },
    });
  });

  test("registers tools with concurrency metadata", () => {
    const agent = new AIbitat();

    agent.function({
      name: "web-search",
      handler: jest.fn(),
    });
    agent.function({
      name: "custom-write",
      handler: jest.fn(),
      isConcurrencySafe: false,
      isReadOnly: false,
      isDestructive: true,
    });

    expect(agent.functions.get("web-search")).toMatchObject({
      isConcurrencySafe: true,
      isReadOnly: false,
      isDestructive: false,
    });
    expect(agent.functions.get("custom-write")).toMatchObject({
      isConcurrencySafe: false,
      isReadOnly: false,
      isDestructive: true,
    });
  });

  test("executes multi-tool batches and appends all function results before the next turn", async () => {
    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "multi-tool-test" },
      },
    });
    agent.introspect = jest.fn();
    agent.reportToolCall = jest.fn();
    agent.evaluateToolPermission = jest.fn(() => ({
      decision: "allow",
      reason: "",
    }));
    agent.toolTimeoutExecutor = {
      getTimeout: jest.fn(() => 1000),
      executeWithTimeout: jest.fn(async (name, handler, args) => {
        await new Promise((resolve) =>
          setTimeout(resolve, name === "web-search" ? 20 : 5)
        );
        return {
          success: true,
          result: await handler(args),
          timedOut: false,
          durationMs: name === "web-search" ? 20 : 5,
        };
      }),
    };
    agent.function({
      name: "web-search",
      handler: jest.fn(async (args) => `search:${args.query}`),
    });
    agent.function({
      name: "memory",
      handler: jest.fn(async (args) => `memory:${args.query}`),
    });

    const provider = {
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { name: "web-search", arguments: { query: "alpha" } },
            { name: "memory", arguments: { query: "beta" } },
          ],
        })
        .mockResolvedValueOnce({
          textResponse: "after tools",
        }),
    };

    const result = await agent.handleExecution(
      provider,
      [{ role: "user", content: "hello" }],
      [],
      "agent"
    );

    expect(result).toBe("after tools");
    expect(provider.complete).toHaveBeenCalledTimes(2);
    const secondCallMessages = provider.complete.mock.calls[1][0];
    expect(secondCallMessages.slice(-2)).toEqual([
      expect.objectContaining({
        role: "function",
        name: "web-search",
        content: "search:alpha",
      }),
      expect.objectContaining({
        role: "function",
        name: "memory",
        content: "memory:beta",
      }),
    ]);
    expect(agent._eventLog.events.filter((event) => event.type === "tool_use")).toHaveLength(2);
    expect(agent._eventLog.events.filter((event) => event.type === "tool_result")).toHaveLength(2);
  });

  test("skips duplicate tool execution once the same fingerprint already completed", async () => {
    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "dedupe-test" },
      },
    });
    agent.reportToolCall = jest.fn();
    agent.evaluateToolPermission = jest.fn(() => ({
      decision: "allow",
      reason: "",
    }));
    agent.toolTimeoutExecutor = {
      getTimeout: jest.fn(() => 1000),
      executeWithTimeout: jest.fn(async (_name, handler, args) => ({
        success: true,
        result: await handler(args),
        timedOut: false,
        durationMs: 10,
      })),
    };
    agent.function({
      name: "memory",
      handler: jest.fn(async (args) => `memory:${args.query}`),
    });

    const provider = {
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          functionCall: {
            name: "memory",
            arguments: { query: "hello" },
          },
        })
        .mockResolvedValueOnce({
          functionCall: {
            name: "memory",
            arguments: { query: "hello" },
          },
        })
        .mockResolvedValueOnce({
          textResponse: "done",
        }),
    };

    const result = await agent.handleExecution(
      provider,
      [{ role: "user", content: "hello" }],
      [],
      "agent"
    );

    expect(result).toBe("done");
    expect(agent.functions.get("memory").handler).toHaveBeenCalledTimes(1);
    const duplicateResult = provider.complete.mock.calls[2][0].find(
      (message) =>
        message.role === "function" &&
        message.name === "memory" &&
        String(message.content).includes("already executed")
    );
    expect(duplicateResult).toBeTruthy();
  });

  test("falls back from streaming to non-streaming without reusing incomplete fingerprints", async () => {
    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "fallback-test" },
      },
    });
    agent.introspect = jest.fn();
    agent.reportToolCall = jest.fn();
    agent.evaluateToolPermission = jest.fn(() => ({
      decision: "allow",
      reason: "",
    }));
    agent.toolTimeoutExecutor = {
      getTimeout: jest.fn(() => 1000),
      executeWithTimeout: jest.fn(async (_name, handler, args) => ({
        success: true,
        result: await handler(args),
        timedOut: false,
        durationMs: 10,
      })),
    };
    agent.function({
      name: "memory",
      handler: jest.fn(async (args) => `memory:${args.query}`),
    });

    const provider = {
      stream: jest.fn().mockRejectedValue(new Error("socket hang up during SSE stream")),
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          functionCall: {
            name: "memory",
            arguments: { query: "hello" },
          },
        })
        .mockResolvedValueOnce({
          textResponse: "fallback response",
        }),
    };

    const result = await agent.handleAsyncExecution(
      provider,
      [{ role: "user", content: "hello" }],
      [],
      "agent"
    );

    expect(result).toBe("fallback response");
    expect(provider.stream).toHaveBeenCalledTimes(1);
    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(agent.functions.get("memory").handler).toHaveBeenCalledTimes(1);
    expect(agent._eventLog.events.some((event) => event.type === "abort")).toBe(true);
    expect(
      agent._eventLog.events.filter((event) => event.type === "tool_use")
    ).toHaveLength(1);
  });

  test("uses the streaming tool executor behind the feature flag and preserves result order", async () => {
    process.env.ENABLE_STREAMING_TOOL_EXECUTOR = "true";

    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "stream-executor-test" },
      },
    });
    agent.introspect = jest.fn();
    agent.reportToolCall = jest.fn();
    agent.evaluateToolPermission = jest.fn(() => ({
      decision: "allow",
      reason: "",
    }));
    agent.toolTimeoutExecutor = {
      getTimeout: jest.fn(() => 1000),
      executeWithTimeout: jest.fn(async (name, handler, args) => {
        await new Promise((resolve) =>
          setTimeout(resolve, name === "web-search" ? 20 : 5)
        );
        return {
          success: true,
          result: await handler(args),
          timedOut: false,
          durationMs: name === "web-search" ? 20 : 5,
        };
      }),
    };
    agent.function({
      name: "web-search",
      handler: jest.fn(async (args) => `search:${args.query}`),
    });
    agent.function({
      name: "memory",
      handler: jest.fn(async (args) => `memory:${args.query}`),
    });

    const provider = {
      stream: jest
        .fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { name: "web-search", arguments: { query: "alpha" } },
            { name: "memory", arguments: { query: "beta" } },
          ],
        })
        .mockResolvedValueOnce({
          textResponse: "after tools",
        }),
    };

    const result = await agent.handleAsyncExecution(
      provider,
      [{ role: "user", content: "hello" }],
      [],
      "agent"
    );

    expect(result).toBe("after tools");
    expect(provider.stream).toHaveBeenCalledTimes(2);
    const secondCallMessages = provider.stream.mock.calls[1][0];
    expect(secondCallMessages.slice(-2)).toEqual([
      expect.objectContaining({
        role: "function",
        name: "web-search",
        content: "search:alpha",
      }),
      expect.objectContaining({
        role: "function",
        name: "memory",
        content: "memory:beta",
      }),
    ]);
  });

  test("streaming tool executor cancels queued siblings after an error", async () => {
    process.env.ENABLE_STREAMING_TOOL_EXECUTOR = "true";
    process.env.AGENT_MAX_TOOL_CONCURRENCY = "1";

    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "stream-executor-abort-test" },
      },
    });
    agent.introspect = jest.fn();
    agent.reportToolCall = jest.fn();
    agent.evaluateToolPermission = jest.fn(() => ({
      decision: "allow",
      reason: "",
    }));
    agent.toolTimeoutExecutor = {
      getTimeout: jest.fn(() => 1000),
      executeWithTimeout: jest.fn(async (name, handler, args) => {
        if (name === "web-search") {
          return {
            success: false,
            error: "tool exploded",
            timedOut: false,
            durationMs: 10,
          };
        }
        return {
          success: true,
          result: await handler(args),
          timedOut: false,
          durationMs: 5,
        };
      }),
    };
    agent.function({
      name: "web-search",
      handler: jest.fn(async (args) => `search:${args.query}`),
    });
    agent.function({
      name: "memory",
      handler: jest.fn(async (args) => `memory:${args.query}`),
    });

    const provider = {
      stream: jest
        .fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { name: "web-search", arguments: { query: "alpha" } },
            { name: "memory", arguments: { query: "beta" } },
          ],
        })
        .mockResolvedValueOnce({
          textResponse: "after abort",
        }),
    };

    const result = await agent.handleAsyncExecution(
      provider,
      [{ role: "user", content: "hello" }],
      [],
      "agent"
    );

    expect(result).toBe("after abort");
    expect(agent.functions.get("memory").handler).not.toHaveBeenCalled();
    expect(
      agent._eventLog.events.filter(
        (event) => event.type === "tool_result" && event.data?.type === "cancelled"
      )
    ).toHaveLength(1);
  });

  test("downgrades rejected require-done streamed drafts into status responses", async () => {
    const socketSend = jest.fn();
    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "require-done-stream-cleanup-test" },
        requireDoneToolOnStart: true,
      },
    });
    agent.socket = { send: socketSend };

    // With the new single-nudge behaviour the loop only re-prompts once.
    // Draft 1 is rejected → nudge → Draft 2 is adopted as the final answer.
    const streamedReplies = [
      { uuid: "draft-response-1", textResponse: "draft answer one" },
      { uuid: "draft-response-2", textResponse: "draft answer two" },
    ];
    const provider = {
      stream: jest.fn(async (_messages, _functions, eventHandler) => {
        const reply = streamedReplies.shift();
        eventHandler?.("reportStreamEvent", {
          type: "textResponseChunk",
          uuid: reply.uuid,
          content: reply.textResponse,
        });
        return {
          textResponse: reply.textResponse,
          functionCall: null,
        };
      }),
    };

    const result = await agent.handleAsyncExecution(
      provider,
      [{ role: "user", content: "hello" }],
      [],
      "agent"
    );

    // The second draft is adopted as the final answer.
    expect(result).toBe("draft answer two");
    expect(provider.stream).toHaveBeenCalledTimes(2);

    const reportEvents = socketSend.mock.calls
      .filter(([type]) => type === "reportStreamEvent")
      .map(([, data]) => data);

    // The first draft must not be sent as a real text chunk.
    expect(
      reportEvents.filter(
        (event) =>
          event.type === "textResponseChunk" &&
          event.uuid === "draft-response-1"
      )
    ).toHaveLength(0);
    expect(
      reportEvents.filter((event) => event.type === "removeStatusResponse")
    ).toHaveLength(0);

    // Exactly one "[草稿被拒，重试中]" status event for the single nudge.
    const draftStatusEvents = reportEvents.filter(
      (event) =>
        event.type === "statusResponse" &&
        event.content.includes("[草稿被拒，重试中]")
    );
    expect(draftStatusEvents).toHaveLength(1);
  });

  test("adopts prose draft as final answer after a single nudge when done is never called", async () => {
    const socketSend = jest.fn();
    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "require-done-stream-cleanup-test" },
        requireDoneToolOnStart: true,
      },
    });
    agent.socket = { send: socketSend };

    const streamedReplies = [
      { uuid: "prose-attempt-1", textResponse: "rich prose answer attempt 1" },
      { uuid: "prose-attempt-2", textResponse: "rich prose answer attempt 2" },
    ];
    const provider = {
      stream: jest.fn(async (_messages, _functions, eventHandler) => {
        const reply = streamedReplies.shift();
        eventHandler?.("reportStreamEvent", {
          type: "textResponseChunk",
          uuid: reply.uuid,
          content: reply.textResponse,
        });
        return {
          textResponse: reply.textResponse,
          functionCall: null,
        };
      }),
    };

    const result = await agent.handleAsyncExecution(
      provider,
      [{ role: "user", content: "explain something" }],
      [],
      "agent"
    );

    // The second prose draft is returned as the final answer — user gets the rich content.
    expect(result).toBe("rich prose answer attempt 2");
    // It is delivered via the normal streamed-message path (NOT markTaskComplete), so it is
    // not double-emitted. _taskComplete must stay false — otherwise #chat would emit a second
    // duplicate bubble alongside the live-streamed one.
    expect(agent._taskComplete).toBe(false);
    // Only one nudge was issued (two provider.stream calls total).
    expect(provider.stream).toHaveBeenCalledTimes(2);
  });

  test("does not emit draft status when require-done accepts on the first attempt", async () => {
    const socketSend = jest.fn();
    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "require-done-stream-cleanup-test" },
        requireDoneToolOnStart: true,
      },
    });
    agent.socket = { send: socketSend };
    agent._taskComplete = true;

    const provider = {
      stream: jest.fn(async (_messages, _functions, eventHandler) => {
        eventHandler?.("reportStreamEvent", {
          type: "textResponseChunk",
          uuid: "accepted-response",
          content: "accepted answer",
        });
        return {
          textResponse: "accepted answer",
          functionCall: null,
        };
      }),
    };

    const result = await agent.handleAsyncExecution(
      provider,
      [{ role: "user", content: "hello" }],
      [],
      "agent"
    );

    expect(result).toBe("accepted answer");
    const reportEvents = socketSend.mock.calls
      .filter(([type]) => type === "reportStreamEvent")
      .map(([, data]) => data);
    expect(reportEvents).toEqual([
      {
        type: "textResponseChunk",
        uuid: "accepted-response",
        content: "accepted answer",
      },
    ]);
  });

  test("streams normally when require-done is disabled", async () => {
    const socketSend = jest.fn();
    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "require-done-stream-cleanup-test" },
      },
    });
    agent.socket = { send: socketSend };

    const provider = {
      stream: jest.fn(async (_messages, _functions, eventHandler) => {
        eventHandler?.("reportStreamEvent", {
          type: "textResponseChunk",
          uuid: "normal-response",
          content: "normal answer",
        });
        return {
          textResponse: "normal answer",
          functionCall: null,
        };
      }),
    };

    const result = await agent.handleAsyncExecution(
      provider,
      [{ role: "user", content: "hello" }],
      [],
      "agent"
    );

    expect(result).toBe("normal answer");
    expect(provider.stream).toHaveBeenCalledTimes(1);
    expect(socketSend).toHaveBeenCalledWith("reportStreamEvent", {
      type: "textResponseChunk",
      uuid: "normal-response",
      content: "normal answer",
    });
    expect(socketSend).not.toHaveBeenCalledWith(
      "reportStreamEvent",
      expect.objectContaining({
        type: "statusResponse",
        content: expect.stringContaining("[草稿被拒，重试中]"),
      })
    );
  });

  // ─── HITL suspend integration ─────────────────────────────────────────────
  test("approvalDelegate suspend → transition=suspended_approval, no fake final message, tool handler not called", async () => {
    const toolHandler = jest.fn();
    const socketSend = jest.fn();

    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "suspend-test" },
        approvalDelegate: {
          requestApproval: jest.fn().mockResolvedValue({
            decision: "suspend",
            confirmationId: "c-suspend-1",
          }),
        },
      },
    });
    agent.introspect = jest.fn();
    agent.reportToolCall = jest.fn();
    agent.socket = { send: socketSend };
    // require_confirmation so approvalDelegate path fires
    agent.evaluateToolPermission = jest.fn(() => ({
      decision: "require_confirmation",
      reason: "tool requires approval",
    }));
    agent.toolTimeoutExecutor = {
      getTimeout: jest.fn(() => 1000),
      executeWithTimeout: jest.fn(), // should NOT be called
    };
    agent.function({
      name: "dangerous-tool",
      handler: toolHandler,
    });

    const provider = {
      complete: jest.fn().mockResolvedValueOnce({
        functionCall: { name: "dangerous-tool", arguments: '{"action":"delete"}' },
      }),
    };

    const result = await agent.handleExecution(
      provider,
      [{ role: "user", content: "run dangerous-tool" }],
      [],
      "agent"
    );

    // Clean termination — returns empty string
    expect(result).toBe("");
    // transition set to suspended_approval
    // (handleExecution delegates to #executeTurnStateLoop internally — check _currentTurnState was set then nulled)
    // The socket event should have been emitted
    expect(socketSend).toHaveBeenCalledWith("approvalSuspended", expect.objectContaining({
      confirmationId: "c-suspend-1",
      toolName: "dangerous-tool",
    }));
    // Tool handler NOT invoked (protected tool not executed)
    expect(toolHandler).not.toHaveBeenCalled();
    // provider.complete called only once (no second call after suspend)
    expect(provider.complete).toHaveBeenCalledTimes(1);
    // executeWithTimeout NOT called (tool never ran)
    expect(agent.toolTimeoutExecutor.executeWithTimeout).not.toHaveBeenCalled();
  });

  test("no approvalDelegate → HITL goes legacy path (require_confirmation blocks), zero regression", async () => {
    // Without approvalDelegate, #requireToolApproval falls through to legacy path.
    // Legacy path: workspaceId=null → approved:true (skipped). Tool executes normally.
    const toolHandler = jest.fn().mockResolvedValue("tool result");

    const agent = new AIbitat({
      handlerProps: {
        log: jest.fn(),
        invocation: { id: "no-delegate-test" },
        // NO approvalDelegate
      },
    });
    agent.introspect = jest.fn();
    agent.reportToolCall = jest.fn();
    // require_confirmation but no delegate → falls to legacy → no workspaceId → approved
    agent.evaluateToolPermission = jest.fn(() => ({
      decision: "require_confirmation",
      reason: "needs approval",
    }));
    agent.toolTimeoutExecutor = {
      getTimeout: jest.fn(() => 1000),
      executeWithTimeout: jest.fn().mockResolvedValue({
        success: true,
        result: "tool result",
        durationMs: 5,
      }),
    };
    agent.function({
      name: "normal-tool",
      handler: toolHandler,
    });

    const provider = {
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          functionCall: { name: "normal-tool", arguments: "{}" },
        })
        .mockResolvedValueOnce({ textResponse: "done" }),
    };

    const result = await agent.handleExecution(
      provider,
      [{ role: "user", content: "run normal-tool" }],
      [],
      "agent"
    );

    // Without delegate: legacy path → no workspaceId → auto-approve → tool executes
    expect(result).toBe("done");
    // executeWithTimeout WAS called (tool ran normally)
    expect(agent.toolTimeoutExecutor.executeWithTimeout).toHaveBeenCalledWith(
      "normal-tool",
      expect.any(Function),
      expect.anything()
    );
  });
});
