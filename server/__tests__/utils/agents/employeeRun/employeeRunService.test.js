"use strict";

/**
 * EmployeeRunService — B1–B9 行为测试
 *
 * 设计原则：
 * - FakeAibitat 只伪造 LLM 引擎边界（provider/model 解析 + 真实 aibitat.start()）
 * - httpSocket + EmployeeRunEventSink + AgentRuntimeFactory 走真实实现
 * - 唯一伪造点：替换 createAibitat 工厂，注入 FakeAibitat 实例
 */

const EventEmitter = require("node:events");

// ─────────────────────────────────────────────────────────────────────────────
// FakeAibitat — 仅伪造 LLM 引擎，其他真实行为靠 httpSocket.setup(this) 注入
// ─────────────────────────────────────────────────────────────────────────────
class FakeAibitat extends EventEmitter {
  constructor(opts) {
    super();
    this.opts = opts;
    this.handlerProps = opts.handlerProps;
    this._orchestrator = null;
    this._knowledgeSources = [];
    this.agents = new Map();
    this.permissionConfig = null;
    this.startCalls = 0;
    this.aborted = false;
    this._script = null;
  }

  // 真实 httpSocket.setup 会在此挂 introspect/socket/onMessage 等
  use(plugin) {
    plugin.setup(this);
    return this;
  }

  agent(name, def) {
    this.agents.set(name, def);
    return this;
  }

  setPermissionConfig(cfg) {
    this.permissionConfig = cfg;
    return this;
  }

  onAbort(l) {
    this.on("abort", l);
    return this;
  }

  onTerminate(l) {
    this.on("terminate", l);
    return this;
  }

  onMessage(l) {
    this.on("message", l);
    return this;
  }

  onError(l) {
    this.on("replyError", l);
    return this;
  }

  onInterrupt(l) {
    this.on("interrupt", l);
    return this;
  }

  terminate() {
    this.emit("terminate");
  }

  abort() {
    this.aborted = true;
    this.emit("abort");
  }

  // 测试通过 _script 决定 start 行为
  async start(route) {
    this.startCalls++;
    this.lastRoute = route;
    if (this._script) await this._script(this);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mocks for factory deps (WorkspaceAssistant, SkillInstallations, defaults)
// ─────────────────────────────────────────────────────────────────────────────
jest.mock("../../../../models/workspaceAssistant", () => ({
  WorkspaceAssistant: {
    getById: jest.fn().mockResolvedValue(null), // null → no assistantConfig (safe fallback)
  },
}));

jest.mock("../../../../models/skillInstallations", () => ({
  SkillInstallations: {
    listForWorkspace: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("../../../../utils/agents/defaults", () => ({
  USER_AGENT: {
    name: "USER",
    getDefinition: jest.fn().mockResolvedValue({ functions: ["docSearch"] }),
  },
  WORKSPACE_AGENT: {
    name: "WORKSPACE",
    getDefinition: jest.fn().mockResolvedValue({ functions: ["docSearch"] }),
  },
}));

// Mock Telemetry to prevent real telemetry calls from httpSocket
jest.mock("../../../../models/telemetry", () => ({
  Telemetry: {
    sendTelemetry: jest.fn(),
  },
}));

// Mock WorkspaceChats to detect any accidental calls (B4)
jest.mock("../../../../models/workspaceChats", () => {
  return {
    WorkspaceChats: {
      new: jest.fn(),
      create: jest.fn(),
      updateChat: jest.fn(),
      markWorkspaceAsSeen: jest.fn(),
    },
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// The module under test
// ─────────────────────────────────────────────────────────────────────────────
const { EmployeeRunService, RUN_EMPLOYEE_TOOL } = require("../../../../utils/agents/employeeRun/index");
const { AgentRuntimeFactory } = require("../../../../utils/agents/runtime/agentRuntimeFactory");
const { attachAgentPlugins } = require("../../../../utils/agents/runtime/attachAgentPlugins");
const { httpSocket } = require("../../../../utils/agents/aibitat/plugins/http-socket");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function makeWorkspace(overrides = {}) {
  return {
    id: 1,
    agentProvider: "openai",
    agentModel: "gpt-4o-mini",
    ...overrides,
  };
}

/**
 * 构造一个注入 FakeAibitat 的 EmployeeRunService 实例。
 * factory / attachAgentPlugins / httpSocket 都走真实实现。
 * 只替换 createAibitat，让我们能控制 fake._script。
 */
function makeService(overrides = {}) {
  let lastFake = null;
  const service = new EmployeeRunService({
    createAibitat: (opts) => {
      lastFake = new FakeAibitat(opts);
      return lastFake;
    },
    ...overrides,
  });
  // 暴露最后一个创建的 fake 供断言使用
  service._getLastFake = () => lastFake;
  return service;
}

// ─────────────────────────────────────────────────────────────────────────────
// 输入校验
// ─────────────────────────────────────────────────────────────────────────────
describe("EmployeeRunService — input validation", () => {
  it("缺 workspace → error.code=invalid_input, 不抛", async () => {
    const svc = makeService();
    const result = await svc.run({ assistantId: "a1", task: "do it" });
    expect(result.error.code).toBe("invalid_input");
    expect(result.text).toBeNull();
  });

  it("缺 assistantId → error.code=invalid_input", async () => {
    const svc = makeService();
    const result = await svc.run({ workspace: makeWorkspace(), task: "do it" });
    expect(result.error.code).toBe("invalid_input");
  });

  it("缺 task → error.code=invalid_input", async () => {
    const svc = makeService();
    const result = await svc.run({ workspace: makeWorkspace(), assistantId: "a1" });
    expect(result.error.code).toBe("invalid_input");
  });

  it("返回形状完整 (text/artifacts/sources/events/runId/usage/error)", async () => {
    const svc = makeService();
    const result = await svc.run({ assistantId: "a1", task: "t" });
    expect(result).toHaveProperty("text");
    expect(result).toHaveProperty("artifacts");
    expect(result).toHaveProperty("sources");
    expect(result).toHaveProperty("events");
    expect(result).toHaveProperty("runId");
    expect(result).toHaveProperty("usage");
    expect(result).toHaveProperty("error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// provider 缺失
// ─────────────────────────────────────────────────────────────────────────────
describe("EmployeeRunService — provider missing", () => {
  it("resolveProviderModel 返回 null → error.code=no_provider", async () => {
    const svc = makeService();
    // workspace without any provider config
    const ws = { id: 99 }; // no agentProvider, no chatProvider, no LLM_PROVIDER env
    delete process.env.LLM_PROVIDER;
    const result = await svc.run({ workspace: ws, assistantId: "a1", task: "go" });
    expect(result.error.code).toBe("no_provider");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B1 — 流隔离:workspace socket 不会被调用
// ─────────────────────────────────────────────────────────────────────────────
describe("B1 — 流隔离", () => {
  it("传入的 workspace socket spy 从未被调用;事件都在 result.events/onEvent", async () => {
    const workspaceSocket = { send: jest.fn(), close: jest.fn() };
    const onEvent = jest.fn();

    const svc = makeService();
    // inject fake _script: 直接 emit message + terminate
    let capturedFake;
    svc._createAibitat = (opts) => {
      capturedFake = new FakeAibitat(opts);
      capturedFake._script = async (fake) => {
        fake.emit("message", { from: "WORKSPACE", to: "USER", content: "hello" });
        fake.terminate();
      };
      return capturedFake;
    };

    const result = await svc.run({
      workspace: makeWorkspace(),
      assistantId: "a1",
      task: "greet",
      onEvent,
    });

    // workspaceSocket 从未被调用(服务根本不接收它)
    expect(workspaceSocket.send).not.toHaveBeenCalled();
    expect(workspaceSocket.close).not.toHaveBeenCalled();

    // 事件通过 onEvent 到达
    expect(onEvent).toHaveBeenCalled();
    // 且 result.events 不为空
    expect(result.events.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B6 — 产出完整:text + artifacts + sources
// ─────────────────────────────────────────────────────────────────────────────
describe("B6 — 产出完整", () => {
  it("introspect × 1 + fileDownload artifact + knowledgeSource + 会话消息 → 全部捕获", async () => {
    const svc = makeService();
    let capturedFake;
    svc._createAibitat = (opts) => {
      capturedFake = new FakeAibitat(opts);
      capturedFake._script = async (fake) => {
        // statusResponse via introspect (httpSocket attaches introspect to fake)
        fake.introspect("正在思考...");
        // artifact via socket.send
        fake.socket.send("fileDownload", { filename: "report.csv", b64Content: "..." });
        // sources via _knowledgeSources (httpSocket picks this up on message)
        fake._knowledgeSources = [{ id: "s1", title: "知识库文档" }];
        // final message
        fake.emit("message", { from: "WORKSPACE", to: "USER", content: "最终答复" });
        fake.terminate();
      };
      return capturedFake;
    };

    const result = await svc.run({
      workspace: makeWorkspace(),
      assistantId: "a1",
      task: "analyze data",
    });

    expect(result.text).toBe("最终答复");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe("fileDownload");
    expect(result.artifacts[0].content.filename).toBe("report.csv");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].id).toBe("s1");
    // events includes all emitted events
    const eventTypes = result.events.map((e) => e.type);
    expect(eventTypes).toContain("statusResponse");
    expect(eventTypes).toContain("fileDownload");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B3 — 取消
// ─────────────────────────────────────────────────────────────────────────────
describe("B3 — 取消传播", () => {
  it("signal abort → error.code=aborted + fake.aborted=true, 不挂死", async () => {
    const controller = new AbortController();
    const svc = makeService();
    let capturedFake;
    svc._createAibitat = (opts) => {
      capturedFake = new FakeAibitat(opts);
      capturedFake._script = async (_fake) => {
        // 永不自然结束 — 让取消机制生效
        await new Promise(() => {});
      };
      return capturedFake;
    };

    // 在 run 启动后的微任务里发出 abort
    const runPromise = svc.run({
      workspace: makeWorkspace(),
      assistantId: "a1",
      task: "long task",
      signal: controller.signal,
    });

    // 让 run 开始进入 start() (setImmediate > Promise microtask)
    await new Promise((r) => setImmediate(r));
    controller.abort();

    const result = await runPromise;

    expect(result.error.code).toBe("aborted");
    expect(capturedFake.aborted).toBe(true);
  }, 5000);
});

// ─────────────────────────────────────────────────────────────────────────────
// B4 — 不污染 WorkspaceChats
// ─────────────────────────────────────────────────────────────────────────────
describe("B4 — WorkspaceChats 零调用", () => {
  it("正常 run 后 WorkspaceChats 写方法从未被调用;aibitat.opts.chats=[]", async () => {
    const { WorkspaceChats: MockWsChats } = jest.requireMock("../../../../models/workspaceChats");
    // clear any previous call counts
    Object.values(MockWsChats || {}).forEach((fn) => {
      if (typeof fn?.mockClear === "function") fn.mockClear();
    });

    const svc = makeService();
    let capturedFake;
    svc._createAibitat = (opts) => {
      capturedFake = new FakeAibitat(opts);
      capturedFake._script = async (fake) => {
        fake.emit("message", { from: "WORKSPACE", to: "USER", content: "done" });
        fake.terminate();
      };
      return capturedFake;
    };

    await svc.run({
      workspace: makeWorkspace(),
      assistantId: "a1",
      task: "simple task",
    });

    // aibitat opts.chats must be [] (no parent history injected)
    expect(capturedFake.opts.chats).toEqual([]);

    // WorkspaceChats write methods must not have been called
    expect(MockWsChats.new).not.toHaveBeenCalled();
    expect(MockWsChats.create).not.toHaveBeenCalled();
    expect(MockWsChats.updateChat).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B5 — 防递归
// ─────────────────────────────────────────────────────────────────────────────
describe("B5 — 防递归 (depth >= maxDepth → run_employee 被过滤)", () => {
  it("depth=1, maxDepth=1 → funcsToLoad 不含 run_employee", async () => {
    const attachSpy = jest.fn().mockResolvedValue(undefined);

    // mock assemble to return funcsToLoad with run_employee
    const mockFactory = {
      resolveProviderModel: () => ({ provider: "openai", model: "gpt-4o-mini" }),
      assemble: jest.fn().mockResolvedValue({
        permissionConfig: { permissionMode: "default", allowedTools: [], autoApprovedTools: [] },
        userAgentDef: { functions: ["run_employee", "docSearch"] },
        workspaceAgentDef: { functions: [] },
        funcsToLoad: ["run_employee", "docSearch"],
      }),
    };

    const svc = new EmployeeRunService({
      createAibitat: (opts) => {
        const fake = new FakeAibitat(opts);
        fake._script = async (f) => { f.terminate(); };
        return fake;
      },
      AgentRuntimeFactory: mockFactory,
      attachAgentPlugins: attachSpy,
    });

    await svc.run({
      workspace: makeWorkspace(),
      assistantId: "a1",
      task: "nested",
      depth: 1,
      maxDepth: 1,
    });

    const callArgs = attachSpy.mock.calls[0][0];
    expect(callArgs.funcsToLoad).not.toContain("run_employee");
    expect(callArgs.funcsToLoad).toContain("docSearch");
  });

  it("depth=0, maxDepth=1 → run_employee 保留", async () => {
    const attachSpy = jest.fn().mockResolvedValue(undefined);

    const mockFactory = {
      resolveProviderModel: () => ({ provider: "openai", model: "gpt-4o-mini" }),
      assemble: jest.fn().mockResolvedValue({
        permissionConfig: { permissionMode: "default", allowedTools: [], autoApprovedTools: [] },
        userAgentDef: { functions: ["run_employee", "docSearch"] },
        workspaceAgentDef: { functions: [] },
        funcsToLoad: ["run_employee", "docSearch"],
      }),
    };

    const svc = new EmployeeRunService({
      createAibitat: (opts) => {
        const fake = new FakeAibitat(opts);
        fake._script = async (f) => { f.terminate(); };
        return fake;
      },
      AgentRuntimeFactory: mockFactory,
      attachAgentPlugins: attachSpy,
    });

    await svc.run({
      workspace: makeWorkspace(),
      assistantId: "a1",
      task: "top level",
      depth: 0,
      maxDepth: 1,
    });

    const callArgs = attachSpy.mock.calls[0][0];
    expect(callArgs.funcsToLoad).toContain("run_employee");
    expect(callArgs.funcsToLoad).toContain("docSearch");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B7 — 权限不漂移
// ─────────────────────────────────────────────────────────────────────────────
describe("B7 — 权限不漂移", () => {
  it("assemble 返回的 permissionConfig 原样传给 aibitat;invocationMetadata 不含父放大授权", async () => {
    const specificPermConfig = {
      permissionMode: "default",
      allowedTools: ["tool-a", "tool-b"],
      autoApprovedTools: ["tool-a"],
    };

    const mockFactory = {
      resolveProviderModel: () => ({ provider: "openai", model: "gpt-4o-mini" }),
      assemble: jest.fn().mockResolvedValue({
        permissionConfig: specificPermConfig,
        userAgentDef: { functions: [] },
        workspaceAgentDef: { functions: [] },
        funcsToLoad: [],
      }),
    };

    let capturedFake;
    const svc = new EmployeeRunService({
      createAibitat: (opts) => {
        capturedFake = new FakeAibitat(opts);
        capturedFake._script = async (f) => { f.terminate(); };
        return capturedFake;
      },
      AgentRuntimeFactory: mockFactory,
      attachAgentPlugins: jest.fn().mockResolvedValue(undefined),
    });

    await svc.run({
      workspace: makeWorkspace(),
      assistantId: "a1",
      task: "check perms",
    });

    // assemble 收到的 invocationMetadata 不含 full_authorize 放大
    const assembleCall = mockFactory.assemble.mock.calls[0][0];
    const meta = assembleCall.invocationMetadata;
    expect(meta?.authorizationMode).not.toBe("full_authorize");

    // aibitat.setPermissionConfig 被调用时用的是子员工的 config
    expect(capturedFake.permissionConfig).toMatchObject({
      allowedTools: ["tool-a", "tool-b"],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B8 — trace (runId/parentRunId 标记到每个外发 event)
// ─────────────────────────────────────────────────────────────────────────────
describe("B8 — trace 串联", () => {
  it("每个外发 event 带 runId 和 parentRunId", async () => {
    const onEvent = jest.fn();
    const svc = makeService();
    let capturedFake;
    svc._createAibitat = (opts) => {
      capturedFake = new FakeAibitat(opts);
      capturedFake._script = async (fake) => {
        fake.introspect("思考中");
        fake.emit("message", { from: "WORKSPACE", to: "USER", content: "answer" });
        fake.terminate();
      };
      return capturedFake;
    };

    const result = await svc.run({
      workspace: makeWorkspace(),
      assistantId: "a1",
      task: "trace this",
      parentRunId: "p1",
      onEvent,
    });

    expect(onEvent).toHaveBeenCalled();
    for (const [event] of onEvent.mock.calls) {
      expect(event.runId).toBe(result.runId);
      expect(event.parentRunId).toBe("p1");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HITL suspend — approvalDelegate + approval_needed
// ─────────────────────────────────────────────────────────────────────────────
describe("HITL suspend — approval_needed via approvalDelegate", () => {
  it("fake aibitat sends approvalSuspended + closes → result error.code=approval_needed + confirmationId", async () => {
    const svc = makeService();
    svc._createAibitat = (opts) => {
      const fake = new FakeAibitat(opts);
      fake._script = async (f) => {
        // Simulate aibitat emitting approvalSuspended via socket, then terminating
        f.socket.send("approvalSuspended", { confirmationId: "c1", toolName: "dangerousTool", riskLevel: "high" });
        f.terminate();
      };
      return fake;
    };

    const fakeDelegate = {
      requestApproval: jest.fn().mockResolvedValue({ decision: "suspend", confirmationId: "c1" }),
    };

    const result = await svc.run({
      workspace: makeWorkspace(),
      assistantId: "a1",
      task: "do risky thing",
      approvalDelegate: fakeDelegate,
    });

    expect(result.error).not.toBeNull();
    expect(result.error.code).toBe("approval_needed");
    expect(result.error.confirmationId).toBe("c1");
    // text may be null (no final message was sent)
    expect(result.text).toBeNull();
  });

  it("approvalDelegate not provided → normal run, no approval_needed", async () => {
    const svc = makeService();
    svc._createAibitat = (opts) => {
      const fake = new FakeAibitat(opts);
      fake._script = async (f) => {
        f.emit("message", { from: "WORKSPACE", to: "USER", content: "done normally" });
        f.terminate();
      };
      return fake;
    };

    const result = await svc.run({
      workspace: makeWorkspace(),
      assistantId: "a1",
      task: "normal task",
      // no approvalDelegate
    });

    expect(result.error).toBeNull();
    expect(result.text).toBe("done normally");
  });

  it("approvalDelegate is passed into aibitat handlerProps", async () => {
    const svc = makeService();
    let capturedHandlerProps;
    svc._createAibitat = (opts) => {
      capturedHandlerProps = opts.handlerProps;
      const fake = new FakeAibitat(opts);
      fake._script = async (f) => { f.terminate(); };
      return fake;
    };

    const fakeDelegate = { requestApproval: jest.fn() };

    await svc.run({
      workspace: makeWorkspace(),
      assistantId: "a1",
      task: "delegate test",
      approvalDelegate: fakeDelegate,
    });

    expect(capturedHandlerProps.approvalDelegate).toBe(fakeDelegate);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B9 — 并行安全
// ─────────────────────────────────────────────────────────────────────────────
describe("B9 — 并行安全", () => {
  it("两次并发 run 各自独立 sink/aibitat 实例, result 互不串", async () => {
    const fakes = [];
    // Use a flag to distinguish the two runs by different text
    let i = 0;
    const svc = new EmployeeRunService({
      createAibitat: (opts) => {
        const idx = i++;
        const fake = new FakeAibitat(opts);
        fakes.push(fake);
        fake._script = async (f) => {
          f.emit("message", { from: "WORKSPACE", to: "USER", content: `answer-${idx}` });
          f.terminate();
        };
        return fake;
      },
      AgentRuntimeFactory: {
        resolveProviderModel: () => ({ provider: "openai", model: "gpt-4o-mini" }),
        assemble: jest.fn().mockResolvedValue({
          permissionConfig: { permissionMode: "default", allowedTools: [], autoApprovedTools: [] },
          userAgentDef: { functions: [] },
          workspaceAgentDef: { functions: [] },
          funcsToLoad: [],
        }),
      },
      attachAgentPlugins: jest.fn().mockResolvedValue(undefined),
    });

    const [r1, r2] = await Promise.all([
      svc.run({ workspace: makeWorkspace(), assistantId: "a1", task: "task1" }),
      svc.run({ workspace: makeWorkspace(), assistantId: "a2", task: "task2" }),
    ]);

    // Two independent fakes created
    expect(fakes).toHaveLength(2);
    expect(fakes[0]).not.toBe(fakes[1]);

    // Results are independent and not cross-contaminated
    expect(r1.runId).not.toBe(r2.runId);
    // text values are different (not mixed)
    expect(r1.text).not.toBe(r2.text);
    // each result has its own text from its own fake
    const texts = [r1.text, r2.text].sort();
    expect(texts).toEqual(["answer-0", "answer-1"]);
  });
});
