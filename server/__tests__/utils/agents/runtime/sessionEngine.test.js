const fs = require("fs");
const path = require("path");

const SessionEngine = require("../../../../utils/agents/runtime/sessionEngine");
const TranscriptStore = require("../../../../utils/agents/runtime/transcriptStore");
const ToolDescriptor = require("../../../../utils/agents/runtime/toolDescriptor");

describe("SessionEngine", () => {
  const storageDir = path.join(
    process.env.STORAGE_DIR || process.cwd(),
    "tmp-session-engine-tests"
  );

  afterEach(() => {
    delete process.env.USE_TOOL_REGISTRY;
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  test("submitMessage yields agent loop events and flushes transcript history", async () => {
    const transcript = new TranscriptStore("session-engine", { storageDir });
    const fakeLoop = {
      async *run() {
        yield { type: "result", content: "done" };
      },
      getResult() {
        return "done";
      },
      abort: jest.fn(),
    };

    const engine = new SessionEngine({
      workspaceId: 1,
      agentConfig: {},
      tools: new Map(),
      transcript,
      eventLog: null,
      createAgentLoop: () => fakeLoop,
    });

    const events = [];
    for await (const event of engine.submitMessage("hello")) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "result", content: "done" }]);
    expect(engine.result).toEqual({ type: "success", content: "done" });
    await expect(transcript.load("session-engine")).resolves.toEqual([
      expect.objectContaining({ role: "user", content: "hello" }),
      expect.objectContaining({ role: "assistant", content: "done" }),
    ]);
  });

  test("abort delegates to the active agent loop", () => {
    const transcript = new TranscriptStore("session-engine-abort", { storageDir });
    const abort = jest.fn();
    const engine = new SessionEngine({
      workspaceId: 1,
      agentConfig: {},
      tools: new Map(),
      transcript,
      eventLog: null,
    });

    engine._agentLoop = { abort };
    engine.abort("stop");

    expect(abort).toHaveBeenCalledWith("stop");
  });

  test("syncs a ToolRegistry to AIbitat when USE_TOOL_REGISTRY=true", async () => {
    process.env.USE_TOOL_REGISTRY = "true";
    const transcript = new TranscriptStore("session-engine-tools", { storageDir });
    const descriptor = new ToolDescriptor({
      name: "memory",
      description: "Memory lookup",
      parameters: {},
      handler: jest.fn(async () => "ok"),
      isReadOnly: true,
    });
    const aibitat = {
      functions: new Map([
        [
          "web-search",
          {
            name: "web-search",
            description: "Search the web",
            parameters: {},
            handler: jest.fn(),
            isConcurrencySafe: true,
            isReadOnly: true,
          },
        ],
      ]),
      function: jest.fn(),
    };
    const fakeLoop = {
      async *run() {
        yield { type: "result", content: "done" };
      },
      getResult() {
        return "done";
      },
      abort: jest.fn(),
    };

    const engine = new SessionEngine({
      workspaceId: 1,
      agentConfig: {
        permissionConfig: {
          permissionMode: "default",
          allowedTools: ["memory", "web-search"],
        },
      },
      tools: [descriptor],
      transcript,
      eventLog: null,
      aibitat,
      route: { from: "USER", to: "@agent" },
      createAgentLoop: () => fakeLoop,
    });

    for await (const _event of engine.submitMessage("hello")) {
      // drain generator
    }

    expect(engine.toolRegistry.getAll().map((tool) => tool.name).sort()).toEqual(
      ["memory", "web-search"]
    );
    expect(aibitat.function).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "memory",
      })
    );
    expect(engine.permissionBridge).toBeTruthy();
  });
});
