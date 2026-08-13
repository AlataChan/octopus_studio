/**
 * @fileoverview Agent 调试追踪器
 * @description 实时收集和上报 Agent 执行过程中的调试信息
 *
 * Phase L: Agent 调试面板
 * - 实时 trace 可视化
 * - Planning 决策追踪
 * - 工具调用链追踪
 * - 性能指标收集
 */

/**
 * 调试事件类型
 */
const DEBUG_EVENT_TYPES = {
  // Planning 相关
  PLANNING_START: "planning:start",
  PLANNING_KNOWLEDGE_LOADED: "planning:knowledge_loaded",
  PLANNING_DECISION: "planning:decision",
  PLANNING_END: "planning:end",

  // 工具调用相关
  TOOL_CALL_START: "tool:start",
  TOOL_CALL_END: "tool:end",
  TOOL_CALL_ERROR: "tool:error",

  // LLM 相关
  LLM_REQUEST_START: "llm:request_start",
  LLM_REQUEST_END: "llm:request_end",
  LLM_TOKENS_USED: "llm:tokens_used",

  // 流程相关
  FLOW_START: "flow:start",
  FLOW_STEP: "flow:step",
  FLOW_END: "flow:end",

  // Blackboard 相关
  BLACKBOARD_SET: "blackboard:set",
  BLACKBOARD_GET: "blackboard:get",

  // 诊断相关
  DIAGNOSTIC: "diagnostic",
  WARNING: "warning",
  ERROR: "error",
};

/**
 * Agent 调试追踪器
 * @class DebugTracer
 */
class DebugTracer {
  /**
   * 创建调试追踪器
   * @param {Object} options - 配置选项
   * @param {Function} options.socket - WebSocket 发送函数
   * @param {Function} options.log - 日志函数
   * @param {string} options.invocationId - Invocation ID
   * @param {boolean} options.enabled - 是否启用调试
   */
  constructor(options = {}) {
    this.socket = options.socket;
    this.log = options.log || console.log;
    this.invocationId = options.invocationId;
    this.enabled =
      options.enabled ?? process.env.ENABLE_DEBUG_TRACER === "true";

    // 事件历史
    this.events = [];
    this.startTime = Date.now();

    // 性能指标
    this.metrics = {
      totalDurationMs: 0,
      planningDurationMs: 0,
      toolCallCount: 0,
      toolCallDurationMs: 0,
      llmRequestCount: 0,
      llmTokensUsed: 0,
      errorCount: 0,
    };
  }

  /**
   * 检查是否启用
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * 记录事件
   * @param {string} type - 事件类型
   * @param {Object} data - 事件数据
   */
  trace(type, data = {}) {
    if (!this.enabled) return;

    const event = {
      type,
      timestamp: Date.now(),
      relativeTimeMs: Date.now() - this.startTime,
      invocationId: this.invocationId,
      data,
    };

    this.events.push(event);

    // 更新指标
    this.#updateMetrics(type, data);

    // 实时推送到前端
    this.#sendToFrontend(event);

    // 日志输出
    this.log(
      `[DebugTracer] ${type}: ${JSON.stringify(data).substring(0, 200)}`
    );
  }

  /**
   * 记录 Planning 开始
   * @param {Object} params - 参数
   * @param {string} params.task - 用户任务
   * @param {string} params.workspaceId - Workspace ID
   */
  tracePlanningStart({ task, workspaceId }) {
    this.planningStartTime = Date.now();
    this.trace(DEBUG_EVENT_TYPES.PLANNING_START, {
      task: task?.substring(0, 200),
      workspaceId,
    });
  }

  /**
   * 记录知识加载完成
   * @param {Object} params - 参数
   * @param {string} params.coverage - 覆盖度
   * @param {number} params.graphNodes - 图谱节点数
   * @param {number} params.vectorSources - 向量来源数
   * @param {number} params.durationMs - 耗时
   */
  traceKnowledgeLoaded({ coverage, graphNodes, vectorSources, durationMs }) {
    this.trace(DEBUG_EVENT_TYPES.PLANNING_KNOWLEDGE_LOADED, {
      coverage,
      graphNodes,
      vectorSources,
      durationMs,
    });
  }

  /**
   * 记录 Planning 决策
   * @param {Object} params - 参数
   * @param {string} params.strategy - 执行策略
   * @param {string} params.reason - 决策原因
   * @param {Array} params.steps - 执行步骤
   */
  tracePlanningDecision({ strategy, reason, steps }) {
    this.trace(DEBUG_EVENT_TYPES.PLANNING_DECISION, {
      strategy,
      reason,
      stepCount: steps?.length || 0,
      steps: steps?.slice(0, 5).map((s) => s.identifier || s.purpose),
    });
  }

  /**
   * 记录 Planning 结束
   */
  tracePlanningEnd() {
    const durationMs = Date.now() - (this.planningStartTime || this.startTime);
    this.metrics.planningDurationMs = durationMs;
    this.trace(DEBUG_EVENT_TYPES.PLANNING_END, { durationMs });
  }

  /**
   * 记录工具调用开始
   * @param {Object} params - 参数
   * @param {string} params.toolName - 工具名称
   * @param {Object} params.args - 工具参数
   */
  traceToolCallStart({ toolName, args }) {
    this.currentToolStartTime = Date.now();
    this.trace(DEBUG_EVENT_TYPES.TOOL_CALL_START, {
      toolName,
      args: this.#sanitizeArgs(args),
    });
  }

  /**
   * 记录工具调用结束
   * @param {Object} params - 参数
   * @param {string} params.toolName - 工具名称
   * @param {boolean} params.success - 是否成功
   * @param {number} params.durationMs - 耗时
   */
  traceToolCallEnd({ toolName, success, durationMs }) {
    this.metrics.toolCallCount++;
    this.metrics.toolCallDurationMs += durationMs || 0;
    if (!success) this.metrics.errorCount++;

    this.trace(DEBUG_EVENT_TYPES.TOOL_CALL_END, {
      toolName,
      success,
      durationMs,
    });
  }

  /**
   * 记录工具调用错误
   * @param {Object} params - 参数
   * @param {string} params.toolName - 工具名称
   * @param {string} params.error - 错误信息
   */
  traceToolCallError({ toolName, error }) {
    this.metrics.errorCount++;
    this.trace(DEBUG_EVENT_TYPES.TOOL_CALL_ERROR, {
      toolName,
      error,
    });
  }

  /**
   * 记录 LLM 请求
   * @param {Object} params - 参数
   * @param {string} params.provider - 提供商
   * @param {string} params.model - 模型
   * @param {number} params.tokensUsed - Token 使用量
   * @param {number} params.durationMs - 耗时
   */
  traceLLMRequest({ provider, model, tokensUsed, durationMs }) {
    this.metrics.llmRequestCount++;
    this.metrics.llmTokensUsed += tokensUsed || 0;

    this.trace(DEBUG_EVENT_TYPES.LLM_REQUEST_END, {
      provider,
      model,
      tokensUsed,
      durationMs,
    });
  }

  /**
   * 记录诊断信息
   * @param {Object} params - 参数
   * @param {string} params.level - 级别: info | warning | error
   * @param {string} params.message - 消息
   * @param {Object} params.details - 详情
   */
  traceDiagnostic({ level = "info", message, details }) {
    if (level === "error") this.metrics.errorCount++;

    const eventType =
      level === "error"
        ? DEBUG_EVENT_TYPES.ERROR
        : level === "warning"
          ? DEBUG_EVENT_TYPES.WARNING
          : DEBUG_EVENT_TYPES.DIAGNOSTIC;

    this.trace(eventType, { level, message, details });
  }

  /**
   * 获取当前指标
   * @returns {Object} 性能指标
   */
  getMetrics() {
    return {
      ...this.metrics,
      totalDurationMs: Date.now() - this.startTime,
      eventCount: this.events.length,
    };
  }

  /**
   * 获取所有事件
   * @returns {Array} 事件列表
   */
  getEvents() {
    return [...this.events];
  }

  /**
   * 获取摘要
   * @returns {Object} 调试摘要
   */
  getSummary() {
    return {
      invocationId: this.invocationId,
      startTime: this.startTime,
      metrics: this.getMetrics(),
      eventCount: this.events.length,
      lastEvent: this.events[this.events.length - 1] || null,
    };
  }

  /**
   * 更新指标
   * @private
   */
  #updateMetrics(type, data) {
    switch (type) {
      case DEBUG_EVENT_TYPES.TOOL_CALL_END:
        // 已在 traceToolCallEnd 中更新
        break;
      case DEBUG_EVENT_TYPES.ERROR:
        this.metrics.errorCount++;
        break;
      default:
        break;
    }
  }

  /**
   * 发送事件到前端
   * @private
   */
  #sendToFrontend(event) {
    if (!this.socket?.send) return;

    try {
      this.socket.send("agent:debug", {
        event,
        metrics: this.getMetrics(),
      });
    } catch (error) {
      // 静默失败，不影响主流程
    }
  }

  /**
   * 脱敏参数
   * @private
   */
  #sanitizeArgs(args) {
    if (!args) return null;

    const sensitiveKeys = [
      "password",
      "token",
      "secret",
      "key",
      "apiKey",
      "authorization",
    ];
    const sanitized = { ...args };

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        sanitized[key] = "***";
      }
      // 截断长字符串
      if (typeof sanitized[key] === "string" && sanitized[key].length > 100) {
        sanitized[key] = sanitized[key].substring(0, 100) + "...";
      }
    }

    return sanitized;
  }
}

/**
 * 创建调试追踪器实例
 * @param {Object} options - 配置选项
 * @returns {DebugTracer}
 */
function createDebugTracer(options = {}) {
  return new DebugTracer(options);
}

module.exports = {
  DebugTracer,
  createDebugTracer,
  DEBUG_EVENT_TYPES,
};
