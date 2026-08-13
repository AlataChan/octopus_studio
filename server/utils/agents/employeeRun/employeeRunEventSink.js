const EventEmitter = require("node:events");

// 视为"已生成的产物"的事件类型(可调常量,导出供测试/Task3 复用)
const ARTIFACT_EVENT_TYPES = ["fileDownload", "rechartVisualize", "pptGenerated", "pptContent", "pptOutline"];
// 已知控制类型(用于判定"是否会话消息")
const CONTROL_EVENT_TYPES = [
  "statusResponse",
  "wssFailure",
  "toolExecution",
  "WAITING_ON_INPUT",
  "approvalSuspended",
  ...ARTIFACT_EVENT_TYPES,
  "planningDecision",
  "flowProgress",
  "agentTaskList",
  "reportStreamEvent",
  "conversationSummary",
  "reasoningChunk",
];

class EmployeeRunEventSink extends EventEmitter {
  readyState = 1;            // 伪装 OPEN websocket,让 websocket.js 插件愿意发事件
  constructor({ onEvent } = {}) {
    super();
    this._onEvent = typeof onEvent === "function" ? onEvent : null;
    this.events = [];          // 所有原始事件(无损,按到达顺序)
    this.thoughts = [];        // statusResponse content
    this.toolExecutions = [];  // toolExecution content
    this.artifacts = [];       // [{ type, content }]
    this.sources = [];         // 去重后的知识来源(按 id)
    this.finalText = null;     // 最后一条 from!==USER 会话消息的 content
    this.error = null;         // { code, message } | null
    this.approvalRequests = [];// WAITING_ON_INPUT(B2 部分:冒泡审批)
    this.pendingApproval = null; // { confirmationId, toolName, riskLevel } | null (HITL suspend)
    this.reasoning = [];       // reasoningChunk content(Cap2 reasoning 管线)
  }

  // websocket 接口:始终收到 JSON 字符串
  send(jsonData) {
    let data;
    try { data = typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData; }
    catch { return; }                 // 非法 JSON 静默忽略(与现网 socket 容错一致)
    this.events.push(data);
    this._classify(data);
    if (this._onEvent) { try { this._onEvent(data); } catch (_) {} }  // 回调异常不得中断捕获
    this.emit("chunk", data);
  }

  _classify(data) {
    const type = data && data.type;
    if (type === "statusResponse") { this.thoughts.push(data.content); return; }
    if (type === "wssFailure") { this.error = { code: "agent_error", message: data.content }; return; }
    if (type === "toolExecution") { this.toolExecutions.push(data.content); return; }
    if (type === "WAITING_ON_INPUT") { this.approvalRequests.push(data); this.emit("approvalRequested", data); return; }
    if (type === "approvalSuspended") { this.pendingApproval = data.content || {}; this.emit("approvalRequested", data); return; }
    if (type === "reasoningChunk") { this.reasoning.push(data.content ?? (data.truncated ? "[truncated]" : "")); return; }
    if (type && ARTIFACT_EVENT_TYPES.includes(type)) { this.artifacts.push({ type, content: data.content }); return; }
    if (type && CONTROL_EVENT_TYPES.includes(type)) { return; }        // 其它过程类:已入 events[],无需桶
    // 否则视为会话消息(无显式控制 type)
    if (data && data.from !== "USER" && (data.content !== undefined && data.content !== null)) {
      this.finalText = data.content;                                   // 后到覆盖前面(最终回复)
    }
    if (data && Array.isArray(data.sources) && data.sources.length) {
      this._mergeSources(data.sources);
    }
  }

  _mergeSources(incoming) {
    for (const s of incoming) {
      // Only add sources that have a valid id
      if (s && s.id != null) {
        const exists = this.sources.some((x) => x.id === s.id);
        if (!exists) this.sources.push(s);
      }
    }
  }

  close() { this.emit("closed"); }

  // 当前捕获的结构化结果
  result() {
    return {
      text: this.finalText,
      sources: this.sources,
      artifacts: this.artifacts,
      toolExecutions: this.toolExecutions,
      thoughts: this.thoughts,
      events: this.events,
      error: this.error,
      pendingApproval: this.pendingApproval,
      reasoning: this.reasoning,
    };
  }

  // 等 aibitat onTerminate→socket.close() 后返回结果
  async waitForClose() {
    return new Promise((resolve) => {
      this.once("closed", () => resolve(this.result()));
    });
  }
}

module.exports = { EmployeeRunEventSink, ARTIFACT_EVENT_TYPES, CONTROL_EVENT_TYPES };
