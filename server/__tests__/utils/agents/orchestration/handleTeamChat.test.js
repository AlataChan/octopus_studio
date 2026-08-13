"use strict";

const {
  handleTeamOrchestration,
  stripTeamHandles,
} = require("../../../../utils/agents/orchestration/handleTeamChat");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse() {
  return { on: jest.fn() };
}

function makeWorkspace(id = "ws-1") {
  return { id };
}

function makeUser(id = "u-1") {
  return { id };
}

function makeThread(id = "t-1") {
  return { id };
}

function makeServiceMock(result = {}) {
  const defaults = {
    text: "报告",
    sources: [{ id: "s1" }],
    steps: [{}, {}],
    runId: "team_x",
    error: null,
  };
  const merged = { ...defaults, ...result };
  return { run: jest.fn().mockResolvedValue(merged) };
}

function makeFakeEmployees(n = 2) {
  return Array.from({ length: n }, (_, i) => ({
    assistantId: `a-${i}`,
    name: `Employee ${i}`,
    title: `Title ${i}`,
    capabilities: [],
  }));
}

// ── stripTeamHandles ──────────────────────────────────────────────────────────

describe("stripTeamHandles", () => {
  test("removes @团队", () => {
    expect(stripTeamHandles("@团队 请做任务")).toBe("请做任务");
  });

  test("removes @team", () => {
    expect(stripTeamHandles("@team please do this")).toBe("please do this");
  });

  test("removes multiple handles (extra spaces preserved by trim)", () => {
    // Handles are stripped verbatim; surrounding spaces are left (only outer trim applied).
    // "hello  world" is acceptable — callers use the stripped result as a goal, not display text.
    const stripped = stripTeamHandles("@团队 hello @team world");
    expect(stripped).not.toContain("@团队");
    expect(stripped).not.toContain("@team");
    expect(stripped).toContain("hello");
    expect(stripped).toContain("world");
  });

  test("returns original text when no handles", () => {
    expect(stripTeamHandles("normal message")).toBe("normal message");
  });

  test("handles empty string", () => {
    expect(stripTeamHandles("")).toBe("");
  });
});

// ── handleTeamOrchestration ──────────────────────────────────────────────────

describe("handleTeamOrchestration — no employees → returns false", () => {
  test("returns false when listEmployees returns empty array", async () => {
    const result = await handleTeamOrchestration({
      response: makeResponse(),
      workspace: makeWorkspace(),
      message: "@团队 do something",
      user: makeUser(),
      thread: makeThread(),
      assistantId: null,
      uuid: "uuid-1",
      listEmployees: jest.fn().mockResolvedValue([]),
      service: makeServiceMock(),
      generateText: jest.fn(),
      persistChat: jest.fn(),
      writeChunk: jest.fn(),
    });
    expect(result).toBe(false);
  });

  test("returns false when listEmployees returns null", async () => {
    const result = await handleTeamOrchestration({
      response: makeResponse(),
      workspace: makeWorkspace(),
      message: "@团队 do something",
      user: makeUser(),
      thread: makeThread(),
      assistantId: null,
      uuid: "uuid-1",
      listEmployees: jest.fn().mockResolvedValue(null),
      service: makeServiceMock(),
      generateText: jest.fn(),
      persistChat: jest.fn(),
      writeChunk: jest.fn(),
    });
    expect(result).toBe(false);
  });
});

describe("handleTeamOrchestration — happy path", () => {
  let writeChunk, persistChat, service, listEmployees, generateText, response;
  let result;

  beforeEach(async () => {
    writeChunk = jest.fn();
    persistChat = jest.fn().mockResolvedValue(undefined);
    service = makeServiceMock();
    listEmployees = jest.fn().mockResolvedValue(makeFakeEmployees(2));
    generateText = jest.fn();
    response = makeResponse();

    result = await handleTeamOrchestration({
      response,
      workspace: makeWorkspace("ws-99"),
      message: "@团队 请帮我完成任务",
      user: makeUser("u-99"),
      thread: makeThread("t-99"),
      assistantId: "a-1",
      uuid: "uuid-99",
      service,
      listEmployees,
      generateText,
      persistChat,
      writeChunk,
    });
  });

  test("returns true", () => {
    expect(result).toBe(true);
  });

  test("service.run called exactly once", () => {
    expect(service.run).toHaveBeenCalledTimes(1);
  });

  test("service.run receives stripped goal (no @团队)", () => {
    const callArgs = service.run.mock.calls[0][0];
    expect(callArgs.goal).not.toContain("@团队");
    expect(callArgs.goal).toBe("请帮我完成任务");
  });

  test("service.run receives employees array", () => {
    const callArgs = service.run.mock.calls[0][0];
    expect(callArgs.employees).toHaveLength(2);
  });

  test("service.run receives onEvent function", () => {
    const callArgs = service.run.mock.calls[0][0];
    expect(typeof callArgs.onEvent).toBe("function");
  });

  test("service.run receives signal (AbortSignal)", () => {
    const callArgs = service.run.mock.calls[0][0];
    expect(callArgs.signal).toBeDefined();
    expect(typeof callArgs.signal.aborted).toBe("boolean");
  });

  test("writeChunk called with textResponse (final response)", () => {
    const textResponseCall = writeChunk.mock.calls.find(
      ([, chunk]) => chunk.type === "textResponse"
    );
    expect(textResponseCall).toBeDefined();
    const [, chunk] = textResponseCall;
    expect(chunk.textResponse).toBe("报告");
    expect(chunk.close).toBe(true);
    expect(chunk.sources).toEqual([{ id: "s1" }]);
  });

  test("persistChat called exactly once (isolated — one record only)", () => {
    expect(persistChat).toHaveBeenCalledTimes(1);
  });

  test("persistChat called with correct workspaceId and prompt", () => {
    const callArgs = persistChat.mock.calls[0][0];
    expect(callArgs.workspaceId).toBe("ws-99");
    expect(callArgs.prompt).toBe("@团队 请帮我完成任务");
  });

  test("persistChat receives team metadata", () => {
    const callArgs = persistChat.mock.calls[0][0];
    expect(callArgs.response.metadata.team).toBe(true);
    expect(callArgs.response.metadata.runId).toBe("team_x");
    expect(callArgs.response.metadata.steps).toBe(2);
  });

  test("response.on called to register close handler (abort on disconnect)", () => {
    expect(response.on).toHaveBeenCalledWith("close", expect.any(Function));
  });
});

describe("handleTeamOrchestration — onEvent mapping", () => {
  test("agentTaskList event → writeChunk with type agentTaskList", async () => {
    const writeChunk = jest.fn();
    let capturedOnEvent;
    const service = {
      run: jest.fn().mockImplementation(async ({ onEvent }) => {
        capturedOnEvent = onEvent;
        onEvent({ type: "agentTaskList", content: [{ id: "t1", title: "Step 1" }] });
        return { text: "done", sources: [], steps: [], runId: "r1" };
      }),
    };

    await handleTeamOrchestration({
      response: makeResponse(),
      workspace: makeWorkspace(),
      message: "@team task",
      user: makeUser(),
      thread: null,
      assistantId: null,
      uuid: "uuid-ev",
      service,
      listEmployees: jest.fn().mockResolvedValue(makeFakeEmployees(1)),
      generateText: jest.fn(),
      persistChat: jest.fn().mockResolvedValue(undefined),
      writeChunk,
    });

    const taskListCall = writeChunk.mock.calls.find(
      ([, chunk]) => chunk.type === "agentTaskList"
    );
    expect(taskListCall).toBeDefined();
    expect(taskListCall[1].content).toEqual([{ id: "t1", title: "Step 1" }]);
  });

  test("statusResponse event → writeChunk with type agentThought", async () => {
    const writeChunk = jest.fn();
    const service = {
      run: jest.fn().mockImplementation(async ({ onEvent }) => {
        onEvent({ type: "statusResponse", content: "Thinking about step 1..." });
        return { text: "done", sources: [], steps: [], runId: "r2" };
      }),
    };

    await handleTeamOrchestration({
      response: makeResponse(),
      workspace: makeWorkspace(),
      message: "@team task",
      user: makeUser(),
      thread: null,
      assistantId: null,
      uuid: "uuid-ev2",
      service,
      listEmployees: jest.fn().mockResolvedValue(makeFakeEmployees(1)),
      generateText: jest.fn(),
      persistChat: jest.fn().mockResolvedValue(undefined),
      writeChunk,
    });

    const thoughtCall = writeChunk.mock.calls.find(
      ([, chunk]) => chunk.type === "agentThought"
    );
    expect(thoughtCall).toBeDefined();
    expect(thoughtCall[1].thought).toBe("Thinking about step 1...");
    expect(thoughtCall[1].animate).toBe(true);
  });
});

describe("handleTeamOrchestration — HTTP disconnect aborts signal", () => {
  test("close event triggers controller.abort() → signal becomes aborted", async () => {
    let capturedSignal;
    let closeHandler;

    const response = {
      on: jest.fn((event, handler) => {
        if (event === "close") closeHandler = handler;
      }),
    };

    const service = {
      run: jest.fn().mockImplementation(async ({ signal, onEvent }) => {
        capturedSignal = signal;
        // Simulate disconnect DURING the run
        closeHandler?.();
        return { text: "aborted", sources: [], steps: [], runId: "r3" };
      }),
    };

    await handleTeamOrchestration({
      response,
      workspace: makeWorkspace(),
      message: "@team task",
      user: makeUser(),
      thread: null,
      assistantId: null,
      uuid: "uuid-abort",
      service,
      listEmployees: jest.fn().mockResolvedValue(makeFakeEmployees(1)),
      generateText: jest.fn(),
      persistChat: jest.fn().mockResolvedValue(undefined),
      writeChunk: jest.fn(),
    });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal.aborted).toBe(true);
  });
});

describe("handleTeamOrchestration — suspended (approval requested)", () => {
  test("does NOT call persistChat when result.status === 'suspended'", async () => {
    const writeChunk = jest.fn();
    const persistChat = jest.fn();
    const service = {
      run: jest.fn().mockResolvedValue({
        text: null,
        status: "suspended",
        confirmationId: "c-1",
        steps: [],
        sources: [],
        runId: "r-susp",
        error: null,
      }),
    };

    const result = await handleTeamOrchestration({
      response: makeResponse(),
      workspace: makeWorkspace("ws-susp"),
      message: "@团队 审批任务",
      user: makeUser("u-susp"),
      thread: makeThread("t-susp"),
      assistantId: null,
      uuid: "uuid-susp",
      service,
      listEmployees: jest.fn().mockResolvedValue(makeFakeEmployees(2)),
      generateText: jest.fn(),
      persistChat,
      writeChunk,
    });

    expect(result).toBe(true);
    expect(persistChat).not.toHaveBeenCalled();
  });

  test("does NOT write textResponse chunk when suspended", async () => {
    const writeChunk = jest.fn();
    const service = {
      run: jest.fn().mockResolvedValue({
        text: null,
        status: "suspended",
        confirmationId: "c-2",
        steps: [],
        sources: [],
        runId: "r-susp2",
        error: null,
      }),
    };

    await handleTeamOrchestration({
      response: makeResponse(),
      workspace: makeWorkspace(),
      message: "@团队 任务",
      user: makeUser(),
      thread: makeThread(),
      assistantId: null,
      uuid: "uuid-susp2",
      service,
      listEmployees: jest.fn().mockResolvedValue(makeFakeEmployees(1)),
      generateText: jest.fn(),
      persistChat: jest.fn(),
      writeChunk,
    });

    const textResponseCall = writeChunk.mock.calls.find(
      ([, chunk]) => chunk.type === "textResponse"
    );
    expect(textResponseCall).toBeUndefined();
  });

  test("writes statusResponse chunk with close:true when suspended", async () => {
    const writeChunk = jest.fn();
    const service = {
      run: jest.fn().mockResolvedValue({
        text: null,
        status: "suspended",
        confirmationId: "c-3",
        steps: [],
        sources: [],
        runId: "r-susp3",
        error: null,
      }),
    };

    await handleTeamOrchestration({
      response: makeResponse(),
      workspace: makeWorkspace(),
      message: "@团队 任务",
      user: makeUser(),
      thread: makeThread(),
      assistantId: null,
      uuid: "uuid-susp3",
      service,
      listEmployees: jest.fn().mockResolvedValue(makeFakeEmployees(1)),
      generateText: jest.fn(),
      persistChat: jest.fn(),
      writeChunk,
    });

    const statusCall = writeChunk.mock.calls.find(
      ([, chunk]) => chunk.type === "statusResponse" && chunk.close === true
    );
    expect(statusCall).toBeDefined();
    expect(statusCall[1].thought).toContain("审批");
  });
});
