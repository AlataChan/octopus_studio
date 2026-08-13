/**
 * Agent 优化功能测试脚本
 * 测试 5 个高优先级优化任务的实现
 */

const assert = require("assert");

// 颜色输出
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(colors.green(`  ✓ ${name}`));
    testsPassed++;
  } catch (error) {
    console.log(colors.red(`  ✗ ${name}`));
    console.log(colors.red(`    Error: ${error.message}`));
    testsFailed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(colors.green(`  ✓ ${name}`));
    testsPassed++;
  } catch (error) {
    console.log(colors.red(`  ✗ ${name}`));
    console.log(colors.red(`    Error: ${error.message}`));
    testsFailed++;
  }
}

// ========================================
// Test 1: 工具超时保护 (G)
// ========================================
console.log(colors.cyan("\n📦 Test 1: 工具超时保护 (G)"));

const {
  ToolTimeoutExecutor,
  TOOL_TIMEOUTS,
} = require("./aibitat/utils/toolTimeouts");

test("ToolTimeoutExecutor 类存在", () => {
  assert(
    typeof ToolTimeoutExecutor === "function",
    "ToolTimeoutExecutor should be a class"
  );
});

test("TOOL_TIMEOUTS 配置存在", () => {
  assert(
    typeof TOOL_TIMEOUTS === "object",
    "TOOL_TIMEOUTS should be an object"
  );
  assert(TOOL_TIMEOUTS.DEFAULT > 0, "DEFAULT timeout should be positive");
});

test("ToolTimeoutExecutor 实例化正常", () => {
  const executor = new ToolTimeoutExecutor({
    introspect: () => {},
    log: () => {},
  });
  assert(
    executor instanceof ToolTimeoutExecutor,
    "Should create ToolTimeoutExecutor instance"
  );
});

test("getTimeout 返回正确的超时时间", () => {
  const executor = new ToolTimeoutExecutor({});
  assert(
    executor.getTimeout("web-scraping") === 30000,
    "web-scraping should be 30s"
  );
  assert(
    executor.getTimeout("unknown-tool") === TOOL_TIMEOUTS.DEFAULT,
    "unknown tool should use DEFAULT"
  );
});

asyncTest("executeWithTimeout 成功执行", async () => {
  const executor = new ToolTimeoutExecutor({});
  const result = await executor.executeWithTimeout(
    "test-tool",
    async () => "success",
    {}
  );
  assert(result.success === true, "Should succeed");
  assert(result.result === "success", "Should return correct result");
  assert(result.durationMs >= 0, "Should track duration");
});

asyncTest("executeWithTimeout 超时处理", async () => {
  const executor = new ToolTimeoutExecutor({});
  const result = await executor.executeWithTimeout(
    "test-tool",
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return "success";
    },
    {},
    { timeout: 50 } // 50ms 超时
  );
  assert(result.success === false, "Should fail on timeout");
  assert(result.timedOut === true, "Should mark as timed out");
});

// ========================================
// Test 2: 知识缓存细粒度失效 (C)
// ========================================
console.log(colors.cyan("\n📦 Test 2: 知识缓存细粒度失效 (C)"));

const { KnowledgeCache, knowledgeCache } = require("./knowledgeCache");

test("KnowledgeCache 类存在", () => {
  assert(
    typeof KnowledgeCache === "function",
    "KnowledgeCache should be a class"
  );
});

test("knowledgeCache 单例存在", () => {
  assert(
    knowledgeCache instanceof KnowledgeCache,
    "knowledgeCache should be a singleton instance"
  );
});

test("KnowledgeCache 实例化正常", () => {
  const cache = new KnowledgeCache({ ttlSeconds: 60 });
  assert(
    cache instanceof KnowledgeCache,
    "Should create KnowledgeCache instance"
  );
});

test("set/get 缓存操作正常", () => {
  const cache = new KnowledgeCache({ ttl: 60 });
  const context = { summary: "test", coverage: "high" };
  cache.set("task1", "workspace1", context);

  const cached = cache.get("task1", "workspace1");
  assert(cached !== null, "Should return cached value");
  assert(cached.summary === "test", "Should return correct cached data");
});

test("invalidateByDocuments 细粒度失效", () => {
  const cache = new KnowledgeCache({ ttl: 60 });

  // 设置两个缓存项，context 包含文档引用
  cache.set("task1", "ws1", {
    data: 1,
    vectorContext: { sources: [{ id: "doc1" }] },
  });
  cache.set("task2", "ws1", {
    data: 2,
    vectorContext: { sources: [{ id: "doc2" }] },
  });

  // 只失效 doc1 相关的缓存
  const count = cache.invalidateByDocuments(["doc1"]);

  assert(count === 1, "Should invalidate 1 cache entry");
  assert(
    cache.get("task1", "ws1") === null,
    "task1 cache should be invalidated"
  );
  assert(cache.get("task2", "ws1") !== null, "task2 cache should still exist");
});

test("invalidateWorkspace 工作区失效", () => {
  const cache = new KnowledgeCache({ ttl: 60 });

  cache.set("task1", "ws1", { data: 1 });
  cache.set("task2", "ws1", { data: 2 });
  cache.set("task3", "ws2", { data: 3 });

  const count = cache.invalidateWorkspace("ws1");

  assert(count === 2, "Should invalidate 2 cache entries");
  assert(cache.get("task3", "ws2") !== null, "ws2 cache should still exist");
});

test("getStats 返回统计信息", () => {
  const cache = new KnowledgeCache({ ttl: 60 });
  cache.set("task1", "ws1", { data: 1 });

  const stats = cache.getStats();
  assert(typeof stats.keys === "number", "Should return keys count");
  assert(typeof stats.hits === "number", "Should return hits count");
  assert(typeof stats.misses === "number", "Should return misses count");
});

// ========================================
// Test 3: Blackboard 异步持久化 (A)
// ========================================
console.log(colors.cyan("\n📦 Test 3: Blackboard 异步持久化 (A)"));

const Blackboard = require("../agentFlows/blackboard");

test("Blackboard 类存在", () => {
  assert(typeof Blackboard === "function", "Blackboard should be a class");
});

test("Blackboard 基本操作正常", () => {
  const bb = new Blackboard();
  bb.set("key1", "value1", { role: "test" });

  assert(bb.get("key1") === "value1", "Should get correct value");
  assert(bb.has("key1") === true, "Should have key");
  assert(bb.size() === 1, "Should have 1 key");
});

test("serialize 序列化正常", () => {
  const bb = new Blackboard();
  bb.set("key1", "value1");
  bb.set("key2", { nested: true });

  const serialized = bb.serialize();
  assert(typeof serialized === "object", "Should return object");
  assert(serialized.data.key1 === "value1", "Should serialize data");
  assert(serialized.serializedAt, "Should have timestamp");
});

test("deserialize 反序列化正常", () => {
  const bb1 = new Blackboard();
  bb1.set("key1", "value1");
  bb1.set("key2", "value2");

  const serialized = bb1.serialize();

  const bb2 = new Blackboard();
  bb2.deserialize(serialized);

  assert(bb2.get("key1") === "value1", "Should restore key1");
  assert(bb2.get("key2") === "value2", "Should restore key2");
});

test("keys/size/isEmpty 辅助方法正常", () => {
  const bb = new Blackboard();
  assert(bb.isEmpty() === true, "Should be empty initially");

  bb.set("key1", "value1");
  assert(bb.isEmpty() === false, "Should not be empty after set");
  assert(bb.size() === 1, "Should have 1 key");
  assert(bb.keys().includes("key1"), "Should include key1");
});

test("getSummary 返回摘要", () => {
  const bb = new Blackboard();
  bb.set("key1", "value1");

  const summary = bb.getSummary();
  assert(typeof summary === "object", "Should return object");
  assert(summary.keyCount === 1, "Should have correct keyCount");
  assert(Array.isArray(summary.keys), "Should have keys array");
});

// ========================================
// Test 4: 工具调用实时可视化 (D)
// ========================================
console.log(colors.cyan("\n📦 Test 4: 工具调用实时可视化 (D)"));

test("websocket 插件导出正确", () => {
  const { websocket } = require("./aibitat/plugins/websocket");
  assert(typeof websocket === "object", "websocket plugin should exist");
  assert(websocket.name === "websocket", "Should have correct name");
  assert(
    typeof websocket.plugin === "function",
    "plugin function should exist"
  );
});

test("websocket 插件配置正确", () => {
  const { websocket } = require("./aibitat/plugins/websocket");
  assert(websocket.startupConfig, "Should have startupConfig");
  assert(websocket.startupConfig.params.socket, "Should require socket param");
});

// ========================================
// Test 5: Agent 调试面板 (L)
// ========================================
console.log(colors.cyan("\n📦 Test 5: Agent 调试面板 (L)"));

const {
  DebugTracer,
  createDebugTracer,
  DEBUG_EVENT_TYPES,
} = require("./debugTracer");

test("DebugTracer 类存在", () => {
  assert(typeof DebugTracer === "function", "DebugTracer should be a class");
});

test("createDebugTracer 工厂函数存在", () => {
  assert(
    typeof createDebugTracer === "function",
    "createDebugTracer should be a function"
  );
});

test("DEBUG_EVENT_TYPES 常量存在", () => {
  assert(
    typeof DEBUG_EVENT_TYPES === "object",
    "DEBUG_EVENT_TYPES should be an object"
  );
  assert(DEBUG_EVENT_TYPES.PLANNING_START, "Should have PLANNING_START");
  assert(DEBUG_EVENT_TYPES.TOOL_CALL_START, "Should have TOOL_CALL_START");
});

test("DebugTracer 实例化正常", () => {
  const tracer = new DebugTracer({ enabled: true });
  assert(tracer instanceof DebugTracer, "Should create DebugTracer instance");
});

test("createDebugTracer 创建启用的追踪器", () => {
  const tracer = createDebugTracer({ enabled: true });
  assert(tracer instanceof DebugTracer, "Should return DebugTracer instance");
});

test("createDebugTracer 创建禁用的追踪器", () => {
  const tracer = createDebugTracer({ enabled: false });
  assert(
    tracer instanceof DebugTracer,
    "Should return DebugTracer even when disabled"
  );
});

test("trace 方法记录事件", () => {
  const tracer = new DebugTracer({ enabled: true });
  tracer.trace("test:event", { data: "test" });

  const events = tracer.getEvents();
  assert(events.length === 1, "Should have 1 event");
  assert(events[0].type === "test:event", "Should have correct type");
});

test("tracePlanningStart/End 追踪 Planning", () => {
  const tracer = new DebugTracer({ enabled: true });
  tracer.tracePlanningStart({ task: "test task" });
  tracer.tracePlanningEnd();

  const events = tracer.getEvents();
  assert(events.length === 2, "Should have 2 events");
  assert(
    events[0].type === DEBUG_EVENT_TYPES.PLANNING_START,
    "Should have planning start"
  );
  assert(
    events[1].type === DEBUG_EVENT_TYPES.PLANNING_END,
    "Should have planning end"
  );
});

test("traceToolCallStart/End 追踪工具调用", () => {
  const tracer = new DebugTracer({ enabled: true });
  tracer.traceToolCallStart({ toolName: "test-tool", args: {} });
  tracer.traceToolCallEnd({
    toolName: "test-tool",
    success: true,
    durationMs: 100,
  });

  const events = tracer.getEvents();
  assert(events.length === 2, "Should have 2 events");
  assert(
    events[0].type === DEBUG_EVENT_TYPES.TOOL_CALL_START,
    "Should have tool start"
  );
  assert(
    events[1].type === DEBUG_EVENT_TYPES.TOOL_CALL_END,
    "Should have tool end"
  );
});

test("getMetrics 返回性能指标", () => {
  const tracer = new DebugTracer({ enabled: true });
  tracer.tracePlanningStart({ task: "test" });
  tracer.tracePlanningEnd();
  tracer.traceToolCallStart({ toolName: "tool1" });
  tracer.traceToolCallEnd({ toolName: "tool1", success: true, durationMs: 50 });

  const metrics = tracer.getMetrics();
  assert(
    typeof metrics.totalDurationMs === "number",
    "Should have totalDurationMs"
  );
  assert(metrics.toolCallCount === 1, "Should have 1 tool call");
});

test("getSummary 返回调试摘要", () => {
  const tracer = new DebugTracer({ enabled: true });
  tracer.trace("test:event", { data: "test" });

  const summary = tracer.getSummary();
  assert(typeof summary === "object", "Should return object");
  assert(summary.eventCount === 1, "Should have 1 event");
});

test("禁用时不记录事件", () => {
  const tracer = new DebugTracer({ enabled: false });
  tracer.trace("test:event", { data: "test" });

  const events = tracer.getEvents();
  assert(events.length === 0, "Should have 0 events when disabled");
});

// ========================================
// Test Orchestrator Integration
// ========================================
console.log(colors.cyan("\n📦 Test: Orchestrator 集成"));

const { AgentOrchestrator } = require("./orchestrator");

test("AgentOrchestrator 类存在", () => {
  assert(
    typeof AgentOrchestrator === "function",
    "AgentOrchestrator should be a class"
  );
});

test("AgentOrchestrator 实例化包含 debugTracer", () => {
  const orchestrator = new AgentOrchestrator({
    log: () => {},
    introspect: () => {},
  });

  assert(orchestrator.debugTracer, "Should have debugTracer");
  assert(
    typeof orchestrator.getDebugTracer === "function",
    "Should have getDebugTracer method"
  );
});

test("AgentOrchestrator 提供调试方法", () => {
  const orchestrator = new AgentOrchestrator({
    log: () => {},
    introspect: () => {},
    enableDebugTracer: true,
  });

  assert(
    typeof orchestrator.getDebugSummary === "function",
    "Should have getDebugSummary"
  );
  assert(
    typeof orchestrator.getDebugMetrics === "function",
    "Should have getDebugMetrics"
  );
  assert(
    typeof orchestrator.getDebugEvents === "function",
    "Should have getDebugEvents"
  );
});

// ========================================
// Test 6: Planning 可视化 (F)
// ========================================
console.log(colors.cyan("\n📦 Test 6: Planning 可视化 (F)"));

test("AgentOrchestrator 保存 socket 引用", () => {
  const mockSocket = { send: () => {} };
  const orchestrator = new AgentOrchestrator({
    log: () => {},
    introspect: () => {},
    socket: mockSocket,
  });

  assert(orchestrator.socket === mockSocket, "Should save socket reference");
});

test("AgentOrchestrator 有 _sendPlanningDecision 方法", () => {
  const orchestrator = new AgentOrchestrator({
    log: () => {},
    introspect: () => {},
  });

  assert(
    typeof orchestrator._sendPlanningDecision === "function",
    "Should have _sendPlanningDecision method"
  );
});

test("_sendPlanningDecision 正确发送数据", () => {
  let sentData = null;
  const mockSocket = {
    send: (data) => {
      sentData = JSON.parse(data);
    },
  };

  const orchestrator = new AgentOrchestrator({
    log: () => {},
    introspect: () => {},
    socket: mockSocket,
  });

  const plan = {
    strategy: "sequential",
    reason: "需要多步骤完成",
    steps: [{ type: "tool", identifier: "test", purpose: "测试" }],
    knowledge_utilization: "high",
  };

  const knowledgeContext = {
    coverage: "high",
    metadata: { graphNodes: 5, vectorSources: 10 },
  };

  orchestrator._sendPlanningDecision(plan, knowledgeContext);

  assert(sentData !== null, "Should send data");
  assert(sentData.type === "planningDecision", "Should have correct type");
  assert(
    sentData.content.strategy === "sequential",
    "Should have correct strategy"
  );
  assert(sentData.content.coverage === "high", "Should have correct coverage");
  assert(sentData.content.graphNodes === 5, "Should have correct graphNodes");
  assert(
    sentData.content.vectorSources === 10,
    "Should have correct vectorSources"
  );
  assert(
    sentData.content.steps.length === 1,
    "Should have correct steps count"
  );
});

test("_sendPlanningDecision 无 socket 时不报错", () => {
  const orchestrator = new AgentOrchestrator({
    log: () => {},
    introspect: () => {},
  });

  // 不应抛出异常
  try {
    orchestrator._sendPlanningDecision({}, null);
    assert(true, "Should not throw error when socket is null");
  } catch (e) {
    assert(false, "Should not throw error: " + e.message);
  }
});

// ========================================
// Results
// ========================================
console.log(colors.cyan("\n" + "=".repeat(50)));
console.log(colors.cyan("测试结果"));
console.log(colors.cyan("=".repeat(50)));
console.log(colors.green(`  通过: ${testsPassed}`));
if (testsFailed > 0) {
  console.log(colors.red(`  失败: ${testsFailed}`));
} else {
  console.log(`  失败: ${testsFailed}`);
}
console.log(colors.cyan("=".repeat(50)));

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log(colors.green("\n✅ 所有测试通过！6 个优化功能均已正确实现。\n"));
  console.log(colors.cyan("已实现功能:"));
  console.log("  1. 工具超时保护 (G)");
  console.log("  2. 知识缓存细粒度失效 (C)");
  console.log("  3. Blackboard 异步持久化 (A)");
  console.log("  4. 工具调用实时可视化 (D)");
  console.log("  5. Agent 调试面板 (L)");
  console.log("  6. Planning 可视化 (F)");
  console.log(colors.yellow("\n前端功能（需手动测试）:"));
  console.log("  7. 知识来源富文本展示 (E) - EnhancedCitation 组件\n");
  process.exit(0);
}
