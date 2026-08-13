const { EventEmitter } = require("events");
const { randomUUID } = require("crypto");
const {
  isReasoningEnabled,
  createReasoningStreamController,
} = require("../reasoning/reasoningGate");
const { APIError } = require("./error.js");
const { withSpan, safeAttrs } = require("../../observability/otel");
const Providers = require("./providers/index.js");
const { Telemetry } = require("../../../models/telemetry.js");
const { toolStats } = require("../toolStats.js");
const {
  evaluateToolCall,
  PermissionMode,
  getToolRiskLevel,
  createHitLConfirmationParams,
} = require("../../permissions");
const { safeJsonParse } = require("../../http");
const { DataSanitizer } = require("../../dataSanitizer");
const { InvocationStep } = require("../../../models/invocationStep");
const {
  createDiagnosticContext,
  diagnoseStep,
  needsUserIntervention,
  formatForFrontend,
} = require("../diagnostics");
const { ToolTimeoutExecutor } = require("./utils/toolTimeouts");
const {
  compressToolResult,
  COMPRESSION_CONFIG,
} = require("./observationMasking");
const { maybeOffloadResult } = require("./resultOffload");
const { RetryError } = require("./error.js");
const {
  WorkflowPendingConfirmation,
} = require("../../../models/workflowPendingConfirmation");
const { Run } = require("../../../models/run");
const { runEventEmitter } = require("../../liveCanvas/runEventEmitter");
const { SSE_EVENTS } = require("../../liveCanvas/types");
const TurnState = require("./turnState");
const ToolResult = require("./toolResult");
const EventLog = require("./eventLog");
const ToolCallDeduplicator = require("./toolCallDeduplicator");
const StreamingToolExecutor = require("./streamingToolExecutor");
const {
  executeBatches,
  isConcurrencySafe,
  partitionToolCalls,
} = require("./toolOrchestration");

function reasoningContentFrom(payload = {}) {
  const content = payload?.reasoning_content ?? payload?.reasoningContent;
  return typeof content === "string" && content.length > 0 ? content : null;
}

function preserveReasoningContentOnToolCall(toolCall, completion = {}) {
  if (!toolCall) return toolCall;
  const reasoningContent =
    reasoningContentFrom(toolCall) || reasoningContentFrom(completion);
  if (!reasoningContent) return toolCall;
  return {
    ...toolCall,
    reasoning_content: reasoningContent,
  };
}

function preserveReasoningContentOnCompletion(completion = null) {
  if (!completion || typeof completion !== "object") return completion;

  if (completion.functionCall) {
    return {
      ...completion,
      functionCall: preserveReasoningContentOnToolCall(
        completion.functionCall,
        completion
      ),
    };
  }

  if (Array.isArray(completion.toolCalls)) {
    return {
      ...completion,
      toolCalls: completion.toolCalls.map((toolCall) =>
        preserveReasoningContentOnToolCall(toolCall, completion)
      ),
    };
  }

  return completion;
}

/**
 * AIbitat is a class that manages the conversation between agents.
 * It is designed to solve a task with LLM.
 *
 * Guiding the chat through a graph of agents.
 */
class AIbitat {
  emitter = new EventEmitter();

  /**
   * Temporary flag to skip the handleExecution function
   * This is used to return the result of a flow execution directly to the chat
   * without going through the handleExecution function (resulting in more LLM processing)
   *
   * Setting Skip execution to true will prevent any further tool calls from being executed.
   * This is useful for flow executions that need to return a result directly to the chat but
   * can also prevent tool-call chaining.
   *
   * @type {boolean}
   */
  skipHandleExecution = false;

  /**
   * 步骤计数器 - 用于追踪当前 invocation 中的工具调用步骤序号
   * @type {number}
   */
  currentStepIndex = 0;

  provider = null;
  defaultProvider = null;
  defaultInterrupt;
  maxRounds;
  _chats;

  agents = new Map();
  channels = new Map();
  functions = new Map();

  /**
   * 权限配置 - 用于工具调度网关
   * @type {{permissionMode: string, allowedTools: string[], autoApprovedTools: string[]}}
   */
  permissionConfig = {
    permissionMode: PermissionMode.DEFAULT,
    allowedTools: [],
    autoApprovedTools: [],
  };

  /**
   * 诊断上下文 - 用于自我诊断功能 (Phase L3.1)
   * @type {Object|null}
   */
  diagnosticContext = null;

  /**
   * 诊断历史 - 记录本次会话中的所有诊断结果
   * @type {Array}
   */
  diagnosticHistory = [];

  /**
   * 工具超时执行器 - 用于工具调用超时保护 (Phase G)
   * @type {ToolTimeoutExecutor|null}
   */
  toolTimeoutExecutor = null;

  /**
   * 调试追踪器引用 - 用于 Agent 调试面板 (Phase L)
   * @type {DebugTracer|null}
   */
  _debugTracer = null;

  /**
   * require_done_tool configuration/state (agent stability)
   */
  requireDoneToolOnStart = false;
  requireDoneToolAfterToolUse = false;
  _didCallAnyTool = false;
  _taskComplete = false;
  _taskCompleteMessage = null;
  _currentTurnState = null;
  _eventLog = null;
  _lastTurnStateSnapshot = null;
  _activeStreamingToolExecutor = null;
  _draftThinkingBuffer = null;

  /**
   * Provider retry configuration (agent stability)
   */
  retryConfig = {
    enabled: true,
    maxRetries: 4,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    jitterRatio: 0.1,
  };

  constructor(props = {}) {
    const {
      chats = [],
      interrupt = "NEVER",
      maxRounds = 100,
      provider = "openai",
      handlerProps = {}, // Inherited props we can spread so aibitat can access.
      permissionConfig = {}, // 权限配置
      ...rest
    } = props;
    this._chats = chats;
    this.defaultInterrupt = interrupt;
    this.maxRounds = maxRounds;
    this.handlerProps = handlerProps;
    this.requireDoneToolOnStart = !!handlerProps?.requireDoneToolOnStart;
    this.requireDoneToolAfterToolUse =
      !!handlerProps?.requireDoneToolAfterToolUse;

    // 合并权限配置
    this.permissionConfig = {
      permissionMode: permissionConfig.permissionMode || PermissionMode.DEFAULT,
      allowedTools: permissionConfig.allowedTools || [],
      autoApprovedTools: permissionConfig.autoApprovedTools || [],
    };

    this.defaultProvider = {
      provider,
      ...rest,
    };
    this.provider = this.defaultProvider.provider;
    this.model = this.defaultProvider.model;

    // 初始化诊断上下文（如果启用自我诊断）
    const selfDiagnosticsEnabled =
      process.env.ENABLE_SELF_DIAGNOSTICS === "true";
    if (selfDiagnosticsEnabled && handlerProps?.prompt) {
      this.diagnosticContext = createDiagnosticContext(handlerProps.prompt, {
        enableIntentTracking: true,
      });
      this.handlerProps?.log?.("[SelfDiagnostics] 诊断上下文已初始化");
    }

    // 初始化工具超时执行器 (Phase G: 工具超时保护)
    this.toolTimeoutExecutor = new ToolTimeoutExecutor({
      introspect: (msg) => this?.introspect?.(msg),
      log: (msg) => this.handlerProps?.log?.(msg),
    });

    // Cap2: reasoning 事件管线控制器 (flag 默认关 → null → eventHandler 直接丢弃)
    this._reasoningController = isReasoningEnabled()
      ? createReasoningStreamController({
          maxChars: Number(process.env.REASONING_MAX_CHARS) || 8000,
          maxChunks: Number(process.env.REASONING_MAX_CHUNKS) || 400,
        })
      : null;
  }

  /**
   * Mark that at least one tool has been executed in this invocation.
   * Used for `require_done_tool` fold-in strategy.
   */
  markToolUsed() {
    this._didCallAnyTool = true;
  }

  /**
   * Mark the invocation as task-complete. The loop may decide to terminate.
   * @param {string} message
   */
  markTaskComplete(message = "") {
    this._taskComplete = true;
    this._taskCompleteMessage = String(message || "").trim();
  }

  /**
   * Whether the agent should require the `done` tool to finish.
   */
  shouldRequireDoneTool() {
    return (
      this.requireDoneToolOnStart ||
      (this.requireDoneToolAfterToolUse && this._didCallAnyTool)
    );
  }

  /**
   * Prompt fragment used to force explicit completion in auto/long-task mode.
   */
  getDonePolicyMessage() {
    return {
      role: "system",
      content:
        "【完成规则】这是自动/长任务模式：当且仅当你确信任务已完成时，必须调用工具 done({message}) 结束；在调用 done 之前，不要输出最终结论性答复。若尚未完成，请继续调用工具推进。",
    };
  }

  /**
   * Track stream events so require-done draft attempts can be folded into the
   * thinking chain instead of appearing as transient assistant bubbles.
   *
   * @param {string} type
   * @param {*} data
   */
  #sendStreamEvent(type, data) {
    if (
      this._draftThinkingBuffer &&
      type === "reportStreamEvent" &&
      ["textResponseChunk", "fullTextResponse"].includes(data?.type)
    ) {
      this._draftThinkingBuffer.uuid ||= data?.uuid || randomUUID();
      this._draftThinkingBuffer.content += String(data?.content || "");
      return;
    }
    this?.socket?.send(type, data);
  }

  #shouldBufferRequireDoneAttempt(doneAttempts = 0) {
    return (
      this.shouldRequireDoneTool() && !this._taskComplete && doneAttempts < 1
    );
  }

  #beginDraftThinkingBuffer(enabled = false) {
    this._draftThinkingBuffer = enabled ? { uuid: null, content: "" } : null;
  }

  #clearDraftThinkingBuffer() {
    this._draftThinkingBuffer = null;
  }

  /**
   * The require-done loop may reject a streamed text answer and ask the model to
   * try again. Emit that rejected draft as a folded thinking/status message.
   *
   * @param {{textResponse?: string}|null} completion
   */
  #emitRejectedDraftThinking(completion = null) {
    const draft = String(
      this._draftThinkingBuffer?.content || completion?.textResponse || ""
    ).trim();
    this.#clearDraftThinkingBuffer();
    if (!draft) return;

    this?.socket?.send("reportStreamEvent", {
      type: "statusResponse",
      uuid: randomUUID(),
      content: `[草稿被拒，重试中]\n\n${draft}`,
      animate: false,
    });
  }

  /**
   * Whether the Phase 1 turn-state runtime is enabled.
   *
   * @returns {boolean}
   */
  isTurnStateEnabled() {
    return process.env.USE_TURN_STATE === "true";
  }

  /**
   * Whether the Phase 2B streaming tool executor is enabled.
   *
   * @returns {boolean}
   */
  isStreamingToolExecutorEnabled() {
    return process.env.ENABLE_STREAMING_TOOL_EXECUTOR === "true";
  }

  /**
   * @returns {EventLog}
   */
  getEventLog() {
    if (!this._eventLog) {
      this._eventLog = new EventLog(this.handlerProps?.invocation?.id);
    }
    return this._eventLog;
  }

  /**
   * @returns {string}
   */
  createToolUseId() {
    return randomUUID();
  }

  /**
   * Capture the latest turn-state snapshot so fallback paths can resume
   * without losing completed tool results already appended to messages.
   *
   * @private
   * @param {TurnState|null} state
   */
  #captureTurnStateSnapshot(state = null) {
    if (!state) {
      this._lastTurnStateSnapshot = null;
      return;
    }

    this._lastTurnStateSnapshot = {
      state,
      messages: [...state.messages],
      turnCount: state.turnCount,
      maxTurns: state.maxTurns,
    };
  }

  async #sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  #computeBackoffDelayMs(attempt) {
    const exp = Math.min(
      this.retryConfig.baseDelayMs * Math.pow(2, attempt),
      this.retryConfig.maxDelayMs
    );
    const jitter = exp * this.retryConfig.jitterRatio * Math.random();
    return Math.floor(exp + jitter);
  }

  async #withRetry(fn, { label }) {
    if (!this.retryConfig.enabled) return await fn();

    let lastErr = null;
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        const isRetryable = e instanceof RetryError;
        if (!isRetryable || attempt >= this.retryConfig.maxRetries) throw e;
        const delay = this.#computeBackoffDelayMs(attempt);
        this.handlerProps?.log?.(
          `[Retry] ${label} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}): ${e.message || e}. Retrying in ${delay}ms...`
        );
        await this.#sleep(delay);
      }
    }
    throw lastErr;
  }

  /**
   * 设置权限配置
   * @param {Object} config - 权限配置
   */
  setPermissionConfig(config) {
    this.permissionConfig = {
      ...this.permissionConfig,
      ...config,
    };
    return this;
  }

  /**
   * 设置调试追踪器 (Phase L: Agent 调试面板)
   * @param {DebugTracer} debugTracer - 调试追踪器实例
   * @returns {AIbitat} this
   */
  setDebugTracer(debugTracer) {
    this._debugTracer = debugTracer;
    return this;
  }

  /**
   * 评估工具调用权限
   * @param {string} toolName - 工具名称
   * @returns {{decision: string, reason: string, code?: string}}
   */
  evaluateToolPermission(toolName) {
    return evaluateToolCall({
      toolName,
      permissionMode: this.permissionConfig.permissionMode,
      allowedTools: this.permissionConfig.allowedTools,
      autoApprovedTools: this.permissionConfig.autoApprovedTools,
    });
  }

  async #waitForHitLDecision(confirmationId, maxWaitSeconds = 300) {
    const startTime = Date.now();
    const pollIntervalMs = 2000;

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      const confirmation =
        await WorkflowPendingConfirmation.get(confirmationId);
      if (!confirmation) {
        return {
          approved: false,
          userResponse: "Confirmation record not found",
        };
      }

      if (confirmation.status === "approved") {
        return {
          approved: true,
          userResponse: confirmation.userResponse || null,
        };
      }

      if (confirmation.status === "rejected") {
        return {
          approved: false,
          userResponse: confirmation.userResponse || null,
        };
      }

      if (confirmation.status === "expired") {
        return {
          approved: false,
          expired: true,
          userResponse: "Confirmation expired",
        };
      }

      await this.#sleep(pollIntervalMs);
    }

    // Timeout: expire and return.
    await WorkflowPendingConfirmation.expire(confirmationId);
    return {
      approved: false,
      expired: true,
      userResponse: "Confirmation timeout",
    };
  }

  async #requireToolApproval({ toolName, toolArgs, reason }) {
    // 编排上下文：有审批委托 → 走非阻塞 broker 路径（不写遗留 confirmation/不阻塞轮询）
    const approvalDelegate = this.handlerProps?.approvalDelegate || null;
    if (approvalDelegate && typeof approvalDelegate.requestApproval === "function") {
      const riskLevel = getToolRiskLevel(toolName);
      const r = await approvalDelegate.requestApproval({
        toolName,
        toolArgs,
        reason,
        riskLevel,
        childRunId: this.handlerProps?.runId || null,
      });
      if (r?.decision === "suspend") {
        // 中央发 approvalSuspended 事件（EmployeeRunEventSink 捕获 → approval_needed）
        try { this.socket?.send?.("approvalSuspended", { confirmationId: r.confirmationId, toolName, riskLevel }); } catch (_) {}
        return { approved: false, suspended: true, confirmationId: r.confirmationId };
      }
      if (r?.decision === "rejected") {
        return { approved: false, userResponse: r.userResponse || "审批被拒绝" };
      }
      // approved
      return { approved: true, userResponse: r?.userResponse || null };
    }
    // 无 delegate → 落到下面现有遗留逻辑（一字不改）

    const invocation = this.handlerProps?.invocation || null;
    const runId = this.handlerProps?.runId || null;
    const threadSlug = this.handlerProps?.threadSlug || null;
    const workspaceId =
      this.handlerProps?.workspaceId ?? invocation?.workspace_id ?? null;
    const userId = invocation?.user_id ?? this.handlerProps?.user?.id ?? null;
    const threadId = invocation?.thread_id ?? null;

    // If we can't build a confirmation context, fallback to allow.
    if (!workspaceId) return { approved: true, skipped: true };

    const riskLevel = getToolRiskLevel(toolName);
    const sanitizedArgs = safeJsonParse(
      DataSanitizer.sanitize(toolArgs, { maxLength: 2000 }),
      {}
    );

    const params = createHitLConfirmationParams({
      workspaceId: Number(workspaceId),
      userId: userId != null ? Number(userId) : null,
      threadId: threadId != null ? Number(threadId) : null,
      chatId: null,
      toolName,
      toolArgs: sanitizedArgs,
      riskLevel,
      reason,
    });

    const confirmation = await WorkflowPendingConfirmation.create({
      ...params,
      runId: runId ? String(runId) : null,
    });

    // Emit approval request + block the run.
    if (threadSlug && runId) {
      runEventEmitter.emitForSession(
        threadSlug,
        SSE_EVENTS.APPROVAL_REQUESTED,
        {
          approvalId: String(confirmation.id),
          runId: String(runId),
          toolName,
          riskLevel,
          planTitle: confirmation.planTitle,
          expiresAt: confirmation.expiresAt,
        }
      );
    }

    if (runId) {
      const blocked = await Run.updateStatus(runId, Run.STATUS.BLOCKED, {});
      if (threadSlug) {
        runEventEmitter.emitForSession(threadSlug, SSE_EVENTS.RUN_BLOCKED, {
          runId: blocked.id,
          status: blocked.status,
          updatedAt: blocked.updatedAt,
        });
      }
    }

    this?.introspect?.(
      `⏸️ 需要人工确认后才能继续执行（审批ID: ${confirmation.id}）`
    );

    const decision = await this.#waitForHitLDecision(confirmation.id, 300);

    if (!decision.approved) {
      if (runId) {
        const failed = await Run.updateStatus(runId, Run.STATUS.FAILED, {
          errorCode: decision.expired
            ? Run.ERROR_CODE.HITL_EXPIRED
            : Run.ERROR_CODE.HITL_REJECTED,
          errorDetail: decision.userResponse || "",
        });
        if (threadSlug) {
          runEventEmitter.emitForSession(threadSlug, SSE_EVENTS.RUN_COMPLETED, {
            runId: failed.id,
            status: failed.status,
            errorCode: failed.errorCode,
            errorDetail: failed.errorDetail,
            completedAt: failed.completedAt,
          });
        }
      }
      return decision;
    }

    // Approved: resume run.
    if (runId) {
      const resumed = await Run.updateStatus(runId, Run.STATUS.RUNNING, {});
      if (threadSlug) {
        runEventEmitter.emitForSession(threadSlug, SSE_EVENTS.RUN_UPDATED, {
          runId: resumed.id,
          status: resumed.status,
          updatedAt: resumed.updatedAt,
        });
      }
    }

    this?.introspect?.(`✅ 审批通过，继续执行工具 "${toolName}"`);
    return decision;
  }

  /**
   * Get the chat history between agents and channels.
   */
  get chats() {
    return this._chats;
  }

  /**
   * Install a plugin.
   */
  use(plugin) {
    plugin.setup(this);
    return this;
  }

  /**
   * Add a new agent to the AIbitat.
   *
   * @param name
   * @param config
   * @returns
   */
  agent(name = "", config = {}) {
    this.agents.set(name, config);
    return this;
  }

  /**
   * Add a new channel to the AIbitat.
   *
   * @param name
   * @param members
   * @param config
   * @returns
   */
  channel(name = "", members = [""], config = {}) {
    this.channels.set(name, {
      members,
      ...config,
    });
    return this;
  }

  /**
   * Get the specific agent configuration.
   *
   * @param agent The name of the agent.
   * @throws When the agent configuration is not found.
   * @returns The agent configuration.
   */
  getAgentConfig(agent = "") {
    const config = this.agents.get(agent);
    if (!config) {
      throw new Error(`Agent configuration "${agent}" not found`);
    }
    return {
      role: "You are a helpful AI assistant.",
      //       role: `You are a helpful AI assistant.
      // Solve tasks using your coding and language skills.
      // In the following cases, suggest typescript code (in a typescript coding block) or shell script (in a sh coding block) for the user to execute.
      //     1. When you need to collect info, use the code to output the info you need, for example, browse or search the web, download/read a file, print the content of a webpage or a file, get the current date/time, check the operating system. After sufficient info is printed and the task is ready to be solved based on your language skill, you can solve the task by yourself.
      //     2. When you need to perform some task with code, use the code to perform the task and output the result. Finish the task smartly.
      // Solve the task step by step if you need to. If a plan is not provided, explain your plan first. Be clear which step uses code, and which step uses your language skill.
      // When using code, you must indicate the script type in the code block. The user cannot provide any other feedback or perform any other action beyond executing the code you suggest. The user can't modify your code. So do not suggest incomplete code which requires users to modify. Don't use a code block if it's not intended to be executed by the user.
      // If you want the user to save the code in a file before executing it, put # filename: <filename> inside the code block as the first line. Don't include multiple code blocks in one response. Do not ask users to copy and paste the result. Instead, use 'print' function for the output when relevant. Check the execution result returned by the user.
      // If the result indicates there is an error, fix the error and output the code again. Suggest the full code instead of partial code or code changes. If the error can't be fixed or if the task is not solved even after the code is executed successfully, analyze the problem, revisit your assumption, collect additional info you need, and think of a different approach to try.
      // When you find an answer, verify the answer carefully. Include verifiable evidence in your response if possible.
      // Reply "TERMINATE" when everything is done.`,
      ...config,
    };
  }

  /**
   * Get the specific channel configuration.
   *
   * @param channel The name of the channel.
   * @throws When the channel configuration is not found.
   * @returns The channel configuration.
   */
  getChannelConfig(channel = "") {
    const config = this.channels.get(channel);
    if (!config) {
      throw new Error(`Channel configuration "${channel}" not found`);
    }
    return {
      maxRounds: 10,
      role: "",
      ...config,
    };
  }

  /**
   * Get the members of a group.
   * @throws When the group is not defined as an array in the connections.
   * @param node The name of the group.
   * @returns The members of the group.
   */
  getGroupMembers(node = "") {
    const group = this.getChannelConfig(node);
    return group.members;
  }

  /**
   * Triggered when a plugin, socket, or command is aborted.
   *
   * @param listener
   * @returns
   */
  onAbort(listener = () => null) {
    this.emitter.on("abort", listener);
    return this;
  }

  /**
   * 补偿当前未配对的工具调用，确保中断/终止时也有 tool_result。
   *
   * @private
   * @param {string} reason
   */
  #cancelPendingTurnState(reason = "工具执行已取消。") {
    const state = this._currentTurnState;
    if (!state) return;

    state.aborted = true;
    state.transition = "aborted";
    this._activeStreamingToolExecutor?.discard(reason);

    const eventLog = this.getEventLog();
    eventLog.append({
      type: "abort",
      data: { reason },
    });

    for (const pendingCall of state.getUnpairedToolCalls()) {
      const cancelledResult = ToolResult.cancelled(
        pendingCall.toolUseId,
        pendingCall.name,
        reason
      );

      if (state.recordToolResult(pendingCall.toolUseId, cancelledResult)) {
        eventLog.append({
          type: "tool_result",
          toolUseId: pendingCall.toolUseId,
          toolName: pendingCall.name,
          data: { type: cancelledResult.type },
        });
      }
    }
  }

  /**
   * Abort the running of any plugins that may still be pending (Langchain summarize)
   */
  abort() {
    this.#cancelPendingTurnState(
      "⛔ 本次运行已被中断，未完成的工具调用已取消。"
    );
    this.emitter.emit("abort", null, this);
  }

  /**
   * Triggered when a chat is terminated. After this, the chat can't be continued.
   *
   * @param listener
   * @returns
   */
  onTerminate(listener = () => null) {
    this.emitter.on("terminate", listener);
    return this;
  }

  /**
   * Terminate the chat. After this, the chat can't be continued.
   *
   * @param node Last node to chat with
   */
  terminate(node = "") {
    this.#cancelPendingTurnState("⛔ 本次运行已终止，未完成的工具调用已取消。");
    this.emitter.emit("terminate", node, this);
  }

  /**
   * Triggered when a chat is interrupted by a node.
   *
   * @param listener
   * @returns
   */
  onInterrupt(listener = () => null) {
    this.emitter.on("interrupt", listener);
    return this;
  }

  /**
   * Interruption the chat.
   *
   * @param route The nodes that participated in the interruption.
   * @returns
   */
  interrupt(route) {
    this.#cancelPendingTurnState("⛔ 本次运行已暂停，未完成的工具调用已取消。");
    this._chats.push({
      ...route,
      state: "interrupt",
    });
    this.emitter.emit("interrupt", route, this);
  }

  /**
   * Triggered when a message is added to the chat history.
   * This can either be the first message or a reply to a message.
   *
   * @param listener
   * @returns
   */
  onMessage(listener = (chat) => null) {
    this.emitter.on("message", listener);
    return this;
  }

  /**
   * Register a new successful message in the chat history.
   * This will trigger the `onMessage` event.
   *
   * @param message
   */
  newMessage(message) {
    const chat = {
      ...message,
      state: "success",
    };

    console.log(
      `[AIbitat] newMessage called - from: ${message.from}, to: ${message.to}, content length: ${message.content?.length || 0}`
    );
    this._chats.push(chat);
    this.emitter.emit("message", chat, this);
  }

  /**
   * Triggered when an error occurs during the chat.
   *
   * @param listener
   * @returns
   */
  onError(
    listener = (
      /**
       * The error that occurred.
       *
       * Native errors are:
       * - `APIError`
       * - `AuthorizationError`
       * - `UnknownError`
       * - `RateLimitError`
       * - `ServerError`
       */
      error = null,
      /**
       * The message when the error occurred.
       */
      {}
    ) => null
  ) {
    this.emitter.on("replyError", listener);
    return this;
  }

  /**
   * Register an error in the chat history.
   * This will trigger the `onError` event.
   *
   * @param route
   * @param error
   */
  newError(route, error) {
    const chat = {
      ...route,
      content: error instanceof Error ? error.message : String(error),
      state: "error",
    };
    this._chats.push(chat);
    this.emitter.emit("replyError", error, chat);
  }

  /**
   * Triggered when a chat is interrupted by a node.
   *
   * @param listener
   * @returns
   */
  onStart(listener = (chat, aibitat) => null) {
    this.emitter.on("start", listener);
    return this;
  }

  /**
   * Start a new chat.
   *
   * @param message The message to start the chat.
   */
  async start(message) {
    // 【修复】清理上一轮对话的知识来源，避免累积
    this._knowledgeSources = [];

    // register the message in the chat history
    this.newMessage(message);
    this.emitter.emit("start", message, this);

    // ask the node to reply
    await this.chat({
      to: message.from,
      from: message.to,
    });

    return this;
  }

  /**
   * Recursively chat between two nodes.
   *
   * @param route
   * @param keepAlive Whether to keep the chat alive.
   */
  async chat(route, keepAlive = true) {
    // check if the message is for a group
    // if it is, select the next node to chat with from the group
    // and then ask them to reply.
    if (this.channels.get(route.from)) {
      // select a node from the group
      let nextNode;
      try {
        nextNode = await this.selectNext(route.from);
      } catch (error) {
        if (error instanceof APIError) {
          return this.newError({ from: route.from, to: route.to }, error);
        }
        throw error;
      }

      if (!nextNode) {
        // TODO: should it throw an error or keep the chat alive when there is no node to chat with in the group?
        // maybe it should wrap up the chat and reply to the original node
        // For now, it will terminate the chat
        this.terminate(route.from);
        return;
      }

      const nextChat = {
        from: nextNode,
        to: route.from,
      };

      if (this.shouldAgentInterrupt(nextNode)) {
        this.interrupt(nextChat);
        return;
      }

      // get chats only from the group's nodes
      const history = this.getHistory({ to: route.from });
      const group = this.getGroupMembers(route.from);
      const rounds = history.filter((chat) => group.includes(chat.from)).length;

      const { maxRounds } = this.getChannelConfig(route.from);
      if (rounds >= maxRounds) {
        this.terminate(route.to);
        return;
      }

      await this.chat(nextChat);
      return;
    }

    // If it's a direct message, reply to the message
    let reply = "";
    try {
      reply = await this.reply(route);
    } catch (error) {
      if (error instanceof APIError) {
        return this.newError({ from: route.from, to: route.to }, error);
      }
      throw error;
    }

    if (
      reply === "TERMINATE" ||
      this.hasReachedMaximumRounds(route.from, route.to)
    ) {
      this.terminate(route.to);
      return;
    }

    const newChat = { to: route.from, from: route.to };

    if (
      reply === "INTERRUPT" ||
      (this.agents.get(route.to) && this.shouldAgentInterrupt(route.to))
    ) {
      this.interrupt(newChat);
      return;
    }

    if (keepAlive) {
      // keep the chat alive by replying to the other node
      await this.chat(newChat, true);
    }
  }

  /**
   * Check if the agent should interrupt the chat based on its configuration.
   *
   * @param agent
   * @returns {boolean} Whether the agent should interrupt the chat.
   */
  shouldAgentInterrupt(agent = "") {
    const config = this.getAgentConfig(agent);
    return this.defaultInterrupt === "ALWAYS" || config.interrupt === "ALWAYS";
  }

  /**
   * Select the next node to chat with from a group. The node will be selected based on the history of chats.
   * It will select the node that has not reached the maximum number of rounds yet and has not chatted with the channel in the last round.
   * If it could not determine the next node, it will return a random node.
   *
   * @param channel The name of the group.
   * @returns The name of the node to chat with.
   */
  async selectNext(channel = "") {
    // get all members of the group
    const nodes = this.getGroupMembers(channel);
    const channelConfig = this.getChannelConfig(channel);

    // TODO: move this to when the group is created
    // warn if the group is underpopulated
    if (nodes.length < 3) {
      console.warn(
        `- Group (${channel}) is underpopulated with ${nodes.length} agents. Direct communication would be more efficient.`
      );
    }

    // get the nodes that have not reached the maximum number of rounds
    const availableNodes = nodes.filter(
      (node) => !this.hasReachedMaximumRounds(channel, node)
    );

    // remove the last node that chatted with the channel, so it doesn't chat again
    const lastChat = this._chats.filter((c) => c.to === channel).at(-1);
    if (lastChat) {
      const index = availableNodes.indexOf(lastChat.from);
      if (index > -1) {
        availableNodes.splice(index, 1);
      }
    }

    // TODO: what should it do when there is no node to chat with?
    if (!availableNodes.length) return;

    // get the provider that will be used for the channel
    // if the channel has a provider, use that otherwise
    // use the GPT-4 because it has a better reasoning
    const provider = this.getProviderForConfig({
      // @ts-expect-error
      model: "gpt-4",
      ...this.defaultProvider,
      ...channelConfig,
    });
    const history = this.getHistory({ to: channel });

    // build the messages to send to the provider
    const messages = [
      {
        role: "system",
        content: channelConfig.role,
      },
      {
        role: "user",
        content: `You are in a role play game. The following roles are available:
${availableNodes
  .map((node) => `@${node}: ${this.getAgentConfig(node).role}`)
  .join("\n")}.

Read the following conversation.

CHAT HISTORY
${history.map((c) => `@${c.from}: ${c.content}`).join("\n")}

Then select the next role from that is going to speak next.
Only return the role.
`,
      },
    ];

    // ask the provider to select the next node to chat with
    // and remove the @ from the response
    const { result } = await withSpan(
      "llm." + (provider?.constructor?.name || "unknown"),
      { provider: String(provider?.constructor?.name || ""), model: String(provider?.model || ""), streaming: false },
      () => provider.complete(messages)
    );
    const name = result?.replace(/^@/g, "");
    if (this.agents.get(name)) return name;

    // if the name is not in the nodes, return a random node
    return availableNodes[Math.floor(Math.random() * availableNodes.length)];
  }

  /**
   *
   * @param {string} pluginName this name of the plugin being called
   * @returns string of the plugin to be called compensating for children denoted by # in the string.
   * eg: sql-agent:list-database-connections
   * or is a custom plugin
   * eg: @@custom-plugin-name
   */
  #parseFunctionName(pluginName = "") {
    if (!pluginName.includes("#") && !pluginName.startsWith("@@"))
      return pluginName;
    if (pluginName.startsWith("@@")) return pluginName.replace("@@", "");
    return pluginName.split("#")[1];
  }

  /**
   * Check if the chat has reached the maximum number of rounds.
   */
  hasReachedMaximumRounds(from = "", to = "") {
    return this.getHistory({ from, to }).length >= this.maxRounds;
  }

  /**
   * Get the chat history between two nodes or all chats to/from a node.
   *
   * @param route
   * @returns
   */
  getOrFormatNodeChatHistory(route) {
    if (this.channels.get(route.to)) {
      return [
        {
          role: "user",
          content: `You are in a whatsapp group. Read the following conversation and then reply.
Do not add introduction or conclusion to your reply because this will be a continuous conversation. Don't introduce yourself.

CHAT HISTORY
${this.getHistory({ to: route.to })
  .map((c) => `@${c.from}: ${c.content}`)
  .join("\n")}

@${route.from}:`,
        },
      ];
    }

    // This is normal chat between user<->agent
    return this.getHistory(route).map((c) => ({
      content: c.content,
      role: c.from === route.to ? "user" : "assistant",
    }));
  }

  /**
   * Ask the for the AI provider to generate a reply to the chat.
   * This will load the functions that the node can call and the chat history.
   * Then before calling the provider, it will check if the provider supports agent streaming.
   * If it does, it will call the provider asynchronously (streaming).
   * Otherwise, it will call the provider synchronously (non-streaming).
   * `.supportsAgentStreaming` is used to determine if the provider supports agent streaming on the respective provider.
   *
   * @param route.to The node that sent the chat.
   * @param route.from The node that will reply to the chat.
   */
  async reply(route) {
    const fromConfig = this.getAgentConfig(route.from);
    const chatHistory = this.getOrFormatNodeChatHistory(route);
    const messages = [
      {
        content: fromConfig.role,
        role: "system",
      },
      ...(this.shouldRequireDoneTool() ? [this.getDonePolicyMessage()] : []),
      ...chatHistory,
    ];

    // get the functions that the node can call
    // 关键：仅暴露权限层不会拒绝的工具给 LLM。
    // 否则 LLM 看到 schema 中有 `done` / `save-file-to-browser`（被强制注入的系统/输出工具）
    // 但实际权限白名单不允许 → LLM 反复尝试调用 → 被 deny → 浪费多轮 token
    // 并在最终回复里啰嗦解释失败过程（"我无法调用 done 工具…"）。
    const functions = fromConfig.functions
      ?.map((name) => this.functions.get(this.#parseFunctionName(name)))
      .filter((fn) => {
        if (!fn) return false;
        const permission = this.evaluateToolPermission(fn.name);
        return permission.decision !== "deny";
      });

    const provider = this.getProviderForConfig({
      ...this.defaultProvider,
      ...fromConfig,
    });

    let content;
    let usedStreaming = false;

    if (provider.supportsAgentStreaming) {
      this.handlerProps.log?.(
        "[DEBUG] Provider supports agent streaming - will use async execution!"
      );
      content = await this.handleAsyncExecution(
        provider,
        messages,
        functions,
        route.from
      );
      usedStreaming = true;
    } else {
      this.handlerProps.log?.(
        "[DEBUG] Provider does not support agent streaming - will use synchronous execution!"
      );
      content = await this.handleExecution(
        provider,
        messages,
        functions,
        route.from
      );
    }

    // If a tool signaled explicit completion, emit the completion message but terminate the loop.
    if (this._taskComplete) {
      const finalMessage = this._taskCompleteMessage || content || "";
      // Reset direct-output flag so it never leaks across invocations.
      if (this.skipHandleExecution) this.skipHandleExecution = false;
      // Reset completion flags for safety before sending downstream.
      this._taskComplete = false;
      this._taskCompleteMessage = null;

      // Persist/send the final message like a normal assistant message.
      this.handlerProps.log?.(
        `[DEBUG] Task completed via done tool. Terminating: ${this.shouldRequireDoneTool()}`
      );
      this.newMessage({ ...route, content: finalMessage });
      return this.shouldRequireDoneTool() ? "TERMINATE" : finalMessage;
    }

    // 检查是否有 directOutput（skipHandleExecution 在 handleAsyncExecution/handleExecution 返回后仍为 true）
    // 如果是 directOutput，无论是否流式模式都需要调用 newMessage 发送到前端
    const isDirectOutput = this.skipHandleExecution;

    // 重置 skipHandleExecution 标志，防止影响下一次工具调用
    if (this.skipHandleExecution) {
      this.skipHandleExecution = false;
    }

    // 决定是否调用 newMessage：
    // 无论是否流式模式，都需要调用 newMessage 以触发 chat-history 插件保存聊天记录
    // 流式模式下消息已通过 eventHandler 发送到前端，但仍需要保存到数据库
    this.handlerProps.log?.(
      `[DEBUG] Calling newMessage - usedStreaming: ${usedStreaming}, isDirectOutput: ${isDirectOutput}`
    );
    this.newMessage({ ...route, content });
    return content;
  }

  /**
   * Shared turn-state execution loop used by the Phase 1 feature flag path.
   *
   * @private
   * @param {Object} params
   * @param {*} params.provider
   * @param {Array} params.messages
   * @param {Array} params.functions
   * @param {string|null} params.byAgent
   * @param {number} params.requireDoneAttempts
   * @param {"stream"|"complete"} params.mode
   * @param {Function} params.callProvider
   * @param {string} params.label
   * @returns {Promise<string>}
   */
  async #handleExecutionLoop({
    provider,
    messages = [],
    functions = [],
    byAgent = null,
    requireDoneAttempts = 0,
    mode,
    callProvider,
    label,
    deduplicator = null,
  }) {
    let state = new TurnState({
      messages: [...messages],
      maxTurns: this.maxRounds,
    });
    let doneAttempts = requireDoneAttempts;
    const eventLog = this.getEventLog();

    this.#captureTurnStateSnapshot(null);
    this._currentTurnState = state;

    try {
      while (!state.aborted && state.transition !== "completed" && state.transition !== "suspended_approval") {
        if (state.hasReachedMaxTurns()) {
          state.transition = "max_turns";
          this.handlerProps?.log?.(
            `[TurnState] Maximum tool turns reached (${state.maxTurns}).`
          );
          return "工具调用轮次已达到上限，任务已停止。";
        }

        const shouldBufferDraft =
          mode === "stream" &&
          this.#shouldBufferRequireDoneAttempt(doneAttempts);
        this.#beginDraftThinkingBuffer(shouldBufferDraft);
        const completion = preserveReasoningContentOnCompletion(
          await this.#withRetry(
            () => callProvider(state.messages, functions),
            { label }
          )
        );

        if (completion?.toolCalls?.length > 1) {
          this.#clearDraftThinkingBuffer();
          let allResults = [];

          if (mode === "stream" && this.isStreamingToolExecutorEnabled()) {
            const executor = new StreamingToolExecutor(
              this.functions,
              async (call, toolUseId) =>
                await this.#executeTurnStateToolCall({
                  call,
                  toolUseId,
                  trackToolUse: false,
                  byAgent,
                  provider,
                  state,
                  mode,
                  eventLog,
                  deduplicator,
                }),
              {
                maxConcurrency: parseInt(
                  process.env.AGENT_MAX_TOOL_CONCURRENCY || "5",
                  10
                ),
                onQueued: (trackedTool) => {
                  state.recordToolCall(
                    trackedTool.call.name,
                    trackedTool.call.arguments,
                    trackedTool.toolUseId
                  );
                  eventLog.append({
                    type: "tool_use",
                    toolUseId: trackedTool.toolUseId,
                    toolName: trackedTool.call.name,
                    data: { args: trackedTool.call.arguments },
                  });
                },
                onDiscarded: (trackedTool, result) => {
                  if (state.recordToolResult(trackedTool.toolUseId, result)) {
                    eventLog.append({
                      type: "tool_result",
                      toolUseId: trackedTool.toolUseId,
                      toolName: trackedTool.call.name,
                      data: { type: result.type },
                    });
                  }
                },
              }
            );
            const previousExecutor = this._activeStreamingToolExecutor;
            this._activeStreamingToolExecutor = executor;

            try {
              for (const call of completion.toolCalls) {
                executor.addTool(call, this.createToolUseId());
              }
              allResults = await executor.getResults();
            } finally {
              if (this._activeStreamingToolExecutor === executor) {
                this._activeStreamingToolExecutor = previousExecutor || null;
              }
            }
          } else {
            const batches = partitionToolCalls(
              completion.toolCalls,
              this.functions
            );
            allResults = await executeBatches(
              batches,
              async (call) =>
                await this.#executeTurnStateToolCall({
                  call,
                  byAgent,
                  provider,
                  state,
                  mode,
                  eventLog,
                  deduplicator,
                })
            );
          }

          if (state.aborted) {
            state.transition = "aborted";
            this.handlerProps?.log?.(
              `[TurnState] Execution aborted during batched tool execution.`
            );
            return "";
          }

          const suspendedResult = allResults.find(
            (result) => result.type === "approvalSuspended"
          );
          if (suspendedResult) {
            state.transition = "suspended_approval";
            this.handlerProps?.log?.(
              `[TurnState] Run suspended for approval during batched tool execution.`
            );
            return "";
          }

          const directResult = allResults.find(
            (result) => result.type === "direct_output"
          );
          if (directResult) {
            state.transition = "direct_output";
            return directResult.content;
          }

          for (const result of allResults) {
            state.messages.push(result.toFunctionMessage());
          }
          state = state.nextTurn();
          this._currentTurnState = state;
          continue;
        }

        if (!completion?.functionCall) {
          if (
            this.shouldRequireDoneTool() &&
            !this._taskComplete &&
            doneAttempts < 1
          ) {
            if (mode === "stream") {
              this.#emitRejectedDraftThinking(completion);
            }
            state.messages.push({
              role: "user",
              content:
                "如果你认为任务已经完成：请调用 done({message}) 结束；如果未完成：继续调用工具推进。不要在未调用 done 的情况下直接给最终答复。",
            });
            doneAttempts += 1;
            state = state.nextTurn();
            this._currentTurnState = state;
            continue;
          }

          // After the single nudge: the model's prose answer was already streamed live, so
          // return it and let the normal message path commit it (reconciled by uuid). Do NOT
          // markTaskComplete — that emits a second, duplicate bubble.
          if (mode === "stream") this.#clearDraftThinkingBuffer();
          state.transition = "completed";
          return completion?.textResponse;
        }

        this.#clearDraftThinkingBuffer();
        const result = await this.#executeTurnStateToolCall({
          call: completion.functionCall,
          byAgent,
          provider,
          state,
          mode,
          eventLog,
          deduplicator,
        });

        if (state.aborted) {
          state.transition = "aborted";
          this.handlerProps?.log?.(
            `[TurnState] Execution aborted after tool "${completion.functionCall.name}".`
          );
          return "";
        }

        if (result.type === "approvalSuspended") {
          state.transition = "suspended_approval";
          this.handlerProps?.log?.(
            `[TurnState] Run suspended for approval on tool "${completion.functionCall.name}".`
          );
          return "";
        }

        if (result.type === "direct_output") {
          state.transition = "direct_output";
          return result.content;
        }

        state.messages.push(result.toFunctionMessage());
        state = state.nextTurn();
        this._currentTurnState = state;
      }

      // 若因 suspended_approval 退出循环，干净结束（不产出伪最终答复）
      if (state.transition === "suspended_approval") {
        return "";
      }

      return "";
    } catch (error) {
      this.#clearDraftThinkingBuffer();
      this.#captureTurnStateSnapshot(state);
      throw error;
    } finally {
      if (this._currentTurnState === state) {
        this._currentTurnState = null;
      }
    }
  }

  /**
   * Execute one turn-state tool call and persist its paired event entries.
   *
   * @private
   * @param {Object} params
   * @param {{name: string, arguments: *}} params.call
   * @param {string|null} params.byAgent
   * @param {*} params.provider
   * @param {TurnState} params.state
   * @param {"stream"|"complete"} params.mode
   * @param {EventLog} params.eventLog
   * @param {ToolCallDeduplicator|null} [params.deduplicator]
   * @returns {Promise<ToolResult>}
   */
  async #executeTurnStateToolCall({
    call,
    toolUseId = null,
    trackToolUse = true,
    byAgent,
    provider,
    state,
    mode,
    eventLog,
    deduplicator = null,
  }) {
    const currentToolUseId = toolUseId || this.createToolUseId();

    if (trackToolUse) {
      state.recordToolCall(call.name, call.arguments, currentToolUseId);
      eventLog.append({
        type: "tool_use",
        toolUseId: currentToolUseId,
        toolName: call.name,
        data: { args: call.arguments },
      });
    }

    if (deduplicator) {
      const { isDuplicate, previousToolUseId } = deduplicator.check(
        call.name,
        call.arguments,
        currentToolUseId
      );

      if (isDuplicate) {
        this.handlerProps?.log?.(
          `[TurnState] Duplicate tool call detected, skipping: ${call.name} (previous: ${previousToolUseId})`
        );
        const duplicateResult = ToolResult.inputError(
          currentToolUseId,
          call.name,
          "This tool call was already executed with the same arguments. Skipping duplicate.",
          {
            originalFunctionCall: call,
          }
        );
        const recordedDuplicate = state.recordToolResult(
          currentToolUseId,
          duplicateResult
        );
        if (recordedDuplicate) {
          eventLog.append({
            type: "tool_result",
            toolUseId: currentToolUseId,
            toolName: call.name,
            data: {
              type: duplicateResult.type,
              duplicateOf: previousToolUseId,
            },
          });
        }
        return duplicateResult;
      }
    }

    const result = await this._executeToolWithResult(
      call.name,
      call.arguments,
      currentToolUseId,
      byAgent,
      provider,
      state,
      {
        mode,
        originalFunctionCall: call,
      }
    );

    const recorded = state.recordToolResult(currentToolUseId, result);
    if (recorded) {
      deduplicator?.markCompleted(currentToolUseId);
      eventLog.append({
        type: "tool_result",
        toolUseId: currentToolUseId,
        toolName: call.name,
        data: { type: result.type },
      });
    }

    return result;
  }

  /**
   * Execute a tool call and normalize the outcome into a ToolResult.
   * Thin OTel wrapper — opens a `tool.<name>` span then delegates to
   * `_executeToolWithResultInner` which contains all the real logic.
   *
   * @param {string} name
   * @param {*} args
   * @param {string} toolUseId
   * @param {string|null} byAgent
   * @param {*} provider
   * @param {TurnState} state
   * @param {Object} [options]
   * @param {"stream"|"complete"} [options.mode]
   * @param {Object|null} [options.originalFunctionCall]
   * @returns {Promise<ToolResult>}
   */
  async _executeToolWithResult(
    name,
    args,
    toolUseId,
    byAgent,
    provider,
    state,
    options = {}
  ) {
    const argsLen =
      typeof args === "string"
        ? args.length
        : JSON.stringify(args ?? {}).length;

    return withSpan(
      `tool.${name}`,
      { toolName: String(name), argsLen },
      async (span) => {
        const result = await this._executeToolWithResultInner(
          name,
          args,
          toolUseId,
          byAgent,
          provider,
          state,
          options
        );
        span.setAttributes(
          safeAttrs({
            resultType: result?.type || "",
            isError: !!result?.isError,
          })
        );
        return result;
      }
    );
  }

  /**
   * Inner implementation of tool execution (all logic lives here).
   * Called by `_executeToolWithResult` via the OTel span wrapper.
   *
   * @param {string} name
   * @param {*} args
   * @param {string} toolUseId
   * @param {string|null} byAgent
   * @param {*} provider
   * @param {TurnState} state
   * @param {Object} [options]
   * @returns {Promise<ToolResult>}
   */
  async _executeToolWithResultInner(
    name,
    args,
    toolUseId,
    byAgent,
    provider,
    state,
    options = {}
  ) {
    const { mode = "complete", originalFunctionCall = null } = options;
    const fn = this.functions.get(name);

    if (!fn) {
      return ToolResult.inputError(
        toolUseId,
        name,
        `Function "${name}" not found. Try again.`,
        { originalFunctionCall }
      );
    }

    fn.caller = byAgent || "agent";
    this.markToolUsed();

    const permissionResult = this.evaluateToolPermission(name);
    if (permissionResult.decision === "deny") {
      this.handlerProps?.log?.(
        `[permission] Tool "${name}" denied: ${permissionResult.reason}`
      );
      // 不再 introspect 到前端：agent 会自动尝试替代方案；
      // 推送 ⛔ trace 会被渲染成额外 status 气泡，污染对话视图。

      return ToolResult.permissionDenied(
        toolUseId,
        name,
        permissionResult.reason,
        { originalFunctionCall }
      );
    }

    if (permissionResult.decision === "require_confirmation") {
      this.handlerProps?.log?.(
        `[permission] Tool "${name}" requires confirmation: ${permissionResult.reason}`
      );

      const decision = await this.#requireToolApproval({
        toolName: name,
        toolArgs: safeJsonParse(args, {}),
        reason: permissionResult.reason,
      });

      if (decision.suspended) {
        return ToolResult.approvalSuspended(toolUseId, name, decision.confirmationId, { originalFunctionCall });
      }

      if (!decision.approved) {
        const reasonText = decision.userResponse
          ? `原因: ${decision.userResponse}`
          : "";
        const blockedText = decision.expired
          ? `⏳ 工具 "${name}" 审批超时，已终止本次运行。${reasonText}`
          : `⛔ 工具 "${name}" 审批被拒绝，已终止本次运行。${reasonText}`;

        return ToolResult.permissionDenied(toolUseId, name, blockedText, {
          originalFunctionCall,
          message: blockedText,
        });
      }
    }

    if (permissionResult.decision === "plan_only") {
      this.handlerProps?.log?.(
        `[permission] Tool "${name}" in plan-only mode: ${permissionResult.reason}`
      );
      if (mode === "stream") {
        this?.introspect?.(
          `📋 计划模式：工具 "${name}" 已记录到计划中，不会实际执行`
        );
      }

      return ToolResult.planOnly(toolUseId, name, args, {
        originalFunctionCall,
      });
    }

    if (provider?.verbose) {
      if (mode === "stream") {
        this?.introspect?.(
          `${fn.caller} is executing \`${name}\` tool ${JSON.stringify(args, null, 2)}`
        );
      } else {
        this?.introspect?.(
          `[debug]: ${fn.caller} is attempting to call \`${name}\` tool`
        );
      }
    }

    this.handlerProps?.log?.(
      mode === "stream"
        ? `[debug]: ${fn.caller} is attempting to call \`${name}\` tool ${JSON.stringify(args, null, 2)}`
        : `[debug]: ${fn.caller} is attempting to call \`${name}\` tool`
    );

    const stepTrackingEnabled = process.env.ENABLE_STEP_TRACKING === "true";
    const currentStep = this.currentStepIndex++;
    const estimatedMs = this.toolTimeoutExecutor.getTimeout(name);

    let callId = null;
    if (mode === "stream") {
      callId = toolStats.startCall(name);
    }

    this?.reportToolCall?.({
      toolName: name,
      stage: "start",
      args,
      estimatedMs,
    });

    if (mode === "stream") {
      this._debugTracer?.traceToolCallStart?.({ toolName: name, args });
    }

    const timeoutResult = await this.toolTimeoutExecutor.executeWithTimeout(
      name,
      fn.handler.bind(fn),
      args
    );

    const errorMessage =
      timeoutResult?.error instanceof Error
        ? timeoutResult.error.message
        : String(timeoutResult?.error || "");

    if (!timeoutResult.success) {
      if (mode === "stream" && callId) {
        toolStats.endCall(name, callId, false, { error: errorMessage });
        this._debugTracer?.traceToolCallError?.({
          toolName: name,
          error: errorMessage,
        });
      }

      this?.reportToolCall?.({
        toolName: name,
        stage: "error",
        args,
        error: errorMessage,
        durationMs: timeoutResult.durationMs,
      });

      if (stepTrackingEnabled) {
        this.#recordStepAsync({
          invocation_id: this.handlerProps?.invocation?.id,
          step_index: currentStep,
          step_type: InvocationStep.StepTypes.TOOL_CALL,
          tool_name: name,
          input_summary: DataSanitizer.sanitize(args, { maxLength: 1000 }),
          success: false,
          error_message: errorMessage,
          duration_ms: timeoutResult.durationMs,
        });
      }

      if (timeoutResult.timedOut) {
        return ToolResult.timeout(toolUseId, name, timeoutResult.durationMs, {
          originalFunctionCall,
          message: errorMessage,
        });
      }

      return ToolResult.inputError(toolUseId, name, errorMessage, {
        originalFunctionCall,
      });
    }

    const result = timeoutResult.result;

    if (mode === "stream" && callId) {
      toolStats.endCall(name, callId, true);
      this._debugTracer?.traceToolCallEnd?.({
        toolName: name,
        success: true,
        durationMs: timeoutResult.durationMs,
      });
    }

    this?.reportToolCall?.({
      toolName: name,
      stage: "success",
      args,
      result,
      durationMs: timeoutResult.durationMs,
    });

    if (stepTrackingEnabled) {
      this.#recordStepAsync({
        invocation_id: this.handlerProps?.invocation?.id,
        step_index: currentStep,
        step_type: InvocationStep.StepTypes.TOOL_CALL,
        tool_name: name,
        input_summary: DataSanitizer.sanitize(args, { maxLength: 1000 }),
        output_summary: DataSanitizer.sanitize(result, { maxLength: 1000 }),
        success: true,
        duration_ms: timeoutResult.durationMs,
      });
    }

    Telemetry.sendTelemetry("agent_tool_call", { tool: name }, null, true);

    if (mode === "stream") {
      const diagnosticResult = await this.#performDiagnostics({
        toolName: name,
        result,
        success: timeoutResult.success,
        durationMs: timeoutResult.durationMs,
        stepIndex: currentStep,
      });

      if (diagnosticResult && needsUserIntervention(diagnosticResult)) {
        const formattedDiagnostics = formatForFrontend(diagnosticResult);
        this?.socket?.send("agent:diagnostics", formattedDiagnostics);
        this?.introspect?.(
          `⚠️ 诊断发现问题: ${formattedDiagnostics.issues[0]?.message || "执行异常"}`
        );
        this.handlerProps?.log?.(
          `[SelfDiagnostics] Issues detected: ${JSON.stringify(formattedDiagnostics.issues)}`
        );
      }
    }

    if (this.skipHandleExecution) {
      this?.introspect?.(
        `The tool call has direct output enabled! The result will be returned directly to the chat without any further processing and no further tool calls will be run.`
      );
      this?.introspect?.(`Tool use completed.`);
      this.handlerProps?.log?.(
        `${fn.caller} tool call resulted in direct output! Returning raw result as string. NO MORE TOOL CALLS WILL BE EXECUTED.`
      );
      return ToolResult.success(toolUseId, name, result, {
        directOutput: true,
        originalFunctionCall,
      });
    }

    const _offload = maybeOffloadResult(name, result, {
      enabled:
        String(process.env.TOOL_RESULT_OFFLOAD_ENABLED || "").toLowerCase() ===
        "true",
      runId:
        this?.handlerProps?.runId ||
        this?.handlerProps?.invocation?.uuid ||
        this?.conversationId ||
        "norun",
      storageDir:
        process.env.STORAGE_DIR || require("path").resolve(__dirname, "../../../storage"),
    });
    const { compressed: compressedResult } = _offload.offloaded
      ? { compressed: _offload.result }
      : COMPRESSION_CONFIG.enabled
        ? compressToolResult(name, _offload.result, {
            maxResultTokens: this.functions?.get?.(name)?.maxResultTokens,
          })
        : { compressed: _offload.result };

    return ToolResult.success(toolUseId, name, compressedResult, {
      originalFunctionCall,
    });
  }

  /**
   * Determine whether a streaming error is safe to recover via non-streaming fallback.
   *
   * @param {Error} error
   * @returns {boolean}
   */
  _isRetriableStreamError(error) {
    if (!error) return false;
    const message =
      error?.message?.toLowerCase?.() || String(error || "").toLowerCase();

    if (
      message.includes("permission") ||
      message.includes("auth") ||
      message.includes("unauthorized") ||
      message.includes("forbidden") ||
      message.includes("invalid")
    ) {
      return false;
    }

    if (
      /econnreset|etimedout|enotfound|socket hang up|network/i.test(message)
    ) {
      return true;
    }

    if (typeof error.status === "number" && error.status >= 500) {
      return true;
    }

    return /stream|sse|chunk/i.test(message);
  }

  /**
   * Handle the async (streaming) execution of the provider
   * with tool calls.
   *
   * @param provider
   * @param messages
   * @param functions
   * @param byAgent
   *
   * @returns {Promise<string>}
   */
  async handleAsyncExecution(
    provider,
    messages = [],
    functions = [],
    byAgent = null,
    requireDoneAttempts = 0
  ) {
    if (this.isTurnStateEnabled()) {
      const eventHandler = (type, data) => {
        if (type === "reasoning") {
          const ctrl = this._reasoningController;
          if (!ctrl) return; // flag 关:丢弃,零影响
          const r = ctrl.accept(data?.content);
          if (!r.emit) return;
          this.socket?.send?.("reasoningChunk", r.truncate ? { truncated: true } : { content: r.content });
          return; // 不进 textResponse
        }
        this.#sendStreamEvent(type, data);
      };
      const deduplicator = new ToolCallDeduplicator();

      try {
        return await this.#handleExecutionLoop({
          provider,
          messages,
          functions,
          byAgent,
          requireDoneAttempts,
          mode: "stream",
          callProvider: (currentMessages, currentFunctions) =>
            withSpan(
              "llm." + (provider?.constructor?.name || "unknown"),
              { provider: String(provider?.constructor?.name || ""), model: String(provider?.model || ""), streaming: true },
              () => provider.stream(currentMessages, currentFunctions, eventHandler)
            ),
          label: `${provider?.constructor?.name || "Provider"}.stream`,
          deduplicator,
        });
      } catch (streamError) {
        if (provider.complete && this._isRetriableStreamError(streamError)) {
          this.handlerProps?.log?.(
            `[TurnState] Streaming failed, falling back to non-streaming: ${streamError.message || streamError}`
          );
          this?.introspect?.("⚠️ 流式传输失败，切换到非流式模式...");

          const fallbackMessages = this._lastTurnStateSnapshot?.messages
            ? [...this._lastTurnStateSnapshot.messages]
            : [...messages];

          this.getEventLog().append({
            type: "retry_boundary",
            data: {
              reason: "streaming_fallback",
              from: "stream",
              to: "complete",
            },
          });

          this._activeStreamingToolExecutor?.discard("streaming_fallback");
          deduplicator.discardIncomplete();
          if (!this._currentTurnState && this._lastTurnStateSnapshot?.state) {
            this._currentTurnState = this._lastTurnStateSnapshot.state;
          }
          this.#cancelPendingTurnState("streaming_fallback");
          this._currentTurnState = null;

          return await this.#handleExecutionLoop({
            provider,
            messages: fallbackMessages,
            functions,
            byAgent,
            requireDoneAttempts,
            mode: "complete",
            callProvider: (currentMessages, currentFunctions) =>
              withSpan(
                "llm." + (provider?.constructor?.name || "unknown"),
                { provider: String(provider?.constructor?.name || ""), model: String(provider?.model || ""), streaming: false },
                () => provider.complete(currentMessages, currentFunctions)
              ),
            label: `${provider?.constructor?.name || "Provider"}.complete (fallback)`,
            deduplicator,
          });
        }

        throw streamError;
      }
    }

    const eventHandler = (type, data) => {
      if (type === "reasoning") {
        const ctrl = this._reasoningController;
        if (!ctrl) return; // flag 关:丢弃,零影响
        const r = ctrl.accept(data?.content);
        if (!r.emit) return;
        this.socket?.send?.("reasoningChunk", r.truncate ? { truncated: true } : { content: r.content });
        return; // 不进 textResponse
      }
      this.#sendStreamEvent(type, data);
    };

    /** @type {{ functionCall: { name: string, arguments: string }, textResponse: string }} */
    const shouldBufferDraft =
      this.#shouldBufferRequireDoneAttempt(requireDoneAttempts);
    this.#beginDraftThinkingBuffer(shouldBufferDraft);
    let completionStream;
    try {
      completionStream = preserveReasoningContentOnCompletion(
        await this.#withRetry(
          () => withSpan(
            "llm." + (provider?.constructor?.name || "unknown"),
            { provider: String(provider?.constructor?.name || ""), model: String(provider?.model || ""), streaming: true },
            () => provider.stream(messages, functions, eventHandler)
          ),
          { label: `${provider?.constructor?.name || "Provider"}.stream` }
        )
      );
    } catch (error) {
      this.#clearDraftThinkingBuffer();
      throw error;
    }

    if (completionStream.functionCall) {
      this.#clearDraftThinkingBuffer();
      const { name, arguments: args } = completionStream.functionCall;
      const fn = this.functions.get(name);

      // if provider hallucinated on the function name
      // ask the provider to complete again
      if (!fn) {
        return await this.handleAsyncExecution(
          provider,
          [
            ...messages,
            {
              name,
              role: "function",
              content: `Function "${name}" not found. Try again.`,
              originalFunctionCall: completionStream.functionCall,
            },
          ],
          functions,
          byAgent
        );
      }

      // Execute the function and return the result to the provider
      fn.caller = byAgent || "agent";
      this.markToolUsed();

      // 权限检查：在执行工具之前评估权限
      const permissionResult = this.evaluateToolPermission(name);
      if (permissionResult.decision === "deny") {
        this.handlerProps?.log?.(
          `[permission] Tool "${name}" denied: ${permissionResult.reason}`
        );
        // 不再 introspect 到前端（同上：避免污染对话）

        // 返回拒绝消息给 LLM，让它选择其他方案
        return await this.handleAsyncExecution(
          provider,
          [
            ...messages,
            {
              name,
              role: "function",
              content: `工具 "${name}" 无法执行: ${permissionResult.reason}。请尝试其他方式完成任务。`,
              originalFunctionCall: completionStream.functionCall,
            },
          ],
          functions,
          byAgent
        );
      }

      // If confirmation is required, create a HITL approval and wait (default),
      // unless the invocation is running in FULL AUTHORIZE mode.
      if (permissionResult.decision === "require_confirmation") {
        this.handlerProps?.log?.(
          `[permission] Tool "${name}" requires confirmation: ${permissionResult.reason}`
        );

        const decision = await this.#requireToolApproval({
          toolName: name,
          toolArgs: safeJsonParse(args, {}),
          reason: permissionResult.reason,
        });

        if (decision.suspended) {
          return ToolResult.approvalSuspended(null, name, decision.confirmationId, {
            originalFunctionCall: completionStream.functionCall,
          });
        }

        if (!decision.approved) {
          const reasonText = decision.userResponse
            ? `原因: ${decision.userResponse}`
            : "";
          const blockedText = decision.expired
            ? `⏳ 工具 "${name}" 审批超时，已终止本次运行。${reasonText}`
            : `⛔ 工具 "${name}" 审批被拒绝，已终止本次运行。${reasonText}`;

          return await this.handleAsyncExecution(
            provider,
            [
              ...messages,
              {
                name,
                role: "function",
                content: blockedText,
                originalFunctionCall: completionStream.functionCall,
              },
            ],
            functions,
            byAgent,
            requireDoneAttempts
          );
        }
      }

      // 如果是 plan_only 模式，只返回计划不执行
      if (permissionResult.decision === "plan_only") {
        this.handlerProps?.log?.(
          `[permission] Tool "${name}" in plan-only mode: ${permissionResult.reason}`
        );
        this?.introspect?.(
          `📋 计划模式：工具 "${name}" 已记录到计划中，不会实际执行`
        );

        return await this.handleAsyncExecution(
          provider,
          [
            ...messages,
            {
              name,
              role: "function",
              content: `[计划模式] 工具 "${name}" 已添加到执行计划中，参数: ${JSON.stringify(args)}。请继续规划其他步骤，或告知用户当前的执行计划。`,
              originalFunctionCall: completionStream.functionCall,
            },
          ],
          functions,
          byAgent
        );
      }

      // If provider is verbose, log the tool call to the frontend
      if (provider?.verbose) {
        this?.introspect?.(
          `${fn.caller} is executing \`${name}\` tool ${JSON.stringify(args, null, 2)}`
        );
      }

      // Always log the tool call to the console for debugging purposes
      this.handlerProps?.log?.(
        `[debug]: ${fn.caller} is attempting to call \`${name}\` tool ${JSON.stringify(args, null, 2)}`
      );

      // 开始工具调用统计
      const callId = toolStats.startCall(name);
      let result;

      // 步骤追踪: 记录步骤索引 (时间由 ToolTimeoutExecutor 追踪)
      const stepTrackingEnabled = process.env.ENABLE_STEP_TRACKING === "true";
      const currentStep = this.currentStepIndex++;

      // 🔥 Phase D: 上报工具调用开始
      const estimatedMs = this.toolTimeoutExecutor.getTimeout(name);
      this?.reportToolCall?.({
        toolName: name,
        stage: "start",
        args,
        estimatedMs,
      });

      // 🔥 Phase L: 调试追踪器 - 工具调用开始
      this._debugTracer?.traceToolCallStart?.({ toolName: name, args });

      // 🔥 Phase G: 使用超时保护执行工具
      // 绑定 fn 作为 handler 的 this 上下文，确保内部方法调用正确
      const timeoutResult = await this.toolTimeoutExecutor.executeWithTimeout(
        name,
        fn.handler.bind(fn),
        args
      );

      if (timeoutResult.success) {
        result = timeoutResult.result;
        toolStats.endCall(name, callId, true);

        // 🔥 Phase D: 上报工具调用成功
        this?.reportToolCall?.({
          toolName: name,
          stage: "success",
          args,
          result,
          durationMs: timeoutResult.durationMs,
        });

        // 🔥 Phase L: 调试追踪器 - 工具调用成功
        this._debugTracer?.traceToolCallEnd?.({
          toolName: name,
          success: true,
          durationMs: timeoutResult.durationMs,
        });

        // 步骤追踪: 记录成功步骤
        if (stepTrackingEnabled) {
          this.#recordStepAsync({
            invocation_id: this.handlerProps?.invocation?.id,
            step_index: currentStep,
            step_type: InvocationStep.StepTypes.TOOL_CALL,
            tool_name: name,
            input_summary: DataSanitizer.sanitize(args, { maxLength: 1000 }),
            output_summary: DataSanitizer.sanitize(result, { maxLength: 1000 }),
            success: true,
            duration_ms: timeoutResult.durationMs,
          });
        }
      } else {
        toolStats.endCall(name, callId, false, { error: timeoutResult.error });

        // 🔥 Phase D: 上报工具调用失败
        this?.reportToolCall?.({
          toolName: name,
          stage: "error",
          args,
          error: timeoutResult.error,
          durationMs: timeoutResult.durationMs,
        });

        // 🔥 Phase L: 调试追踪器 - 工具调用失败
        this._debugTracer?.traceToolCallError?.({
          toolName: name,
          error: timeoutResult.error,
        });

        // 步骤追踪: 记录失败步骤
        if (stepTrackingEnabled) {
          this.#recordStepAsync({
            invocation_id: this.handlerProps?.invocation?.id,
            step_index: currentStep,
            step_type: InvocationStep.StepTypes.TOOL_CALL,
            tool_name: name,
            input_summary: DataSanitizer.sanitize(args, { maxLength: 1000 }),
            success: false,
            error_message: timeoutResult.error,
            duration_ms: timeoutResult.durationMs,
          });
        }

        // 超时时不抛出错误，而是返回友好提示让 LLM 重新规划
        if (timeoutResult.timedOut) {
          return await this.handleAsyncExecution(
            provider,
            [
              ...messages,
              {
                name,
                role: "function",
                content: timeoutResult.error,
                originalFunctionCall: completionStream.functionCall,
              },
            ],
            functions,
            byAgent
          );
        }

        // 非超时错误仍然抛出
        throw new Error(timeoutResult.error);
      }
      Telemetry.sendTelemetry("agent_tool_call", { tool: name }, null, true);

      // 🔥 自我诊断: 检查步骤健康状况 (Phase L3.1)
      const diagnosticResult = await this.#performDiagnostics({
        toolName: name,
        result,
        success: timeoutResult.success,
        durationMs: timeoutResult.durationMs,
        stepIndex: currentStep,
      });

      // 如果诊断发现需要用户干预的问题，通过 WebSocket 通知前端
      if (diagnosticResult && needsUserIntervention(diagnosticResult)) {
        const formattedDiagnostics = formatForFrontend(diagnosticResult);
        this?.socket?.send("agent:diagnostics", formattedDiagnostics);
        this?.introspect?.(
          `⚠️ 诊断发现问题: ${formattedDiagnostics.issues[0]?.message || "执行异常"}`
        );
        this.handlerProps?.log?.(
          `[SelfDiagnostics] Issues detected: ${JSON.stringify(formattedDiagnostics.issues)}`
        );
      }

      // If the tool call has direct output enabled, return the result directly to the chat
      // without any further processing and no further tool calls will be run.
      if (this.skipHandleExecution) {
        // 不在这里重置 skipHandleExecution，让调用者知道这是一个 directOutput
        // this.skipHandleExecution = false; // 移到 #chat() 方法中重置
        this?.introspect?.(
          `The tool call has direct output enabled! The result will be returned directly to the chat without any further processing and no further tool calls will be run.`
        );
        this?.introspect?.(`Tool use completed.`);
        this.handlerProps?.log?.(
          `${fn.caller} tool call resulted in direct output! Returning raw result as string. NO MORE TOOL CALLS WILL BE EXECUTED.`
        );
        return result;
      }

      // Phase 3: Observation Masking - 压缩工具结果以减少 token 消耗
      const _offload = maybeOffloadResult(name, result, {
        enabled:
          String(process.env.TOOL_RESULT_OFFLOAD_ENABLED || "").toLowerCase() ===
          "true",
        runId:
          this?.handlerProps?.runId ||
          this?.handlerProps?.invocation?.uuid ||
          this?.conversationId ||
          "norun",
        storageDir:
          process.env.STORAGE_DIR || require("path").resolve(__dirname, "../../../storage"),
      });
      const { compressed: compressedResult } = _offload.offloaded
        ? { compressed: _offload.result }
        : COMPRESSION_CONFIG.enabled
          ? compressToolResult(name, _offload.result, {
              maxResultTokens: this.functions?.get?.(name)?.maxResultTokens,
            })
          : { compressed: _offload.result };

      return await this.handleAsyncExecution(
        provider,
        [
          ...messages,
          {
            name,
            role: "function",
            content: compressedResult,
            originalFunctionCall: completionStream.functionCall,
          },
        ],
        functions,
        byAgent,
        requireDoneAttempts
      );
    }

    // Require explicit done tool in auto/long-task mode.
    if (
      this.shouldRequireDoneTool() &&
      !this._taskComplete &&
      requireDoneAttempts < 1
    ) {
      this.#emitRejectedDraftThinking(completionStream);
      return await this.handleAsyncExecution(
        provider,
        [
          ...messages,
          {
            role: "user",
            content:
              "如果你认为任务已经完成：请调用 done({message}) 结束；如果未完成：继续调用工具推进。不要在未调用 done 的情况下直接给最终答复。",
          },
        ],
        functions,
        byAgent,
        requireDoneAttempts + 1
      );
    }

    // After the single nudge: the model's prose answer was already streamed live to the
    // user (draft buffer is off for this attempt), so just return it and let the normal
    // message path commit it (reconciled by uuid). Do NOT markTaskComplete here — that
    // routes through the task-complete newMessage which emits a SECOND, duplicate bubble.
    this.#clearDraftThinkingBuffer();
    return completionStream?.textResponse;
  }

  /**
   * Handle the synchronous (non-streaming) execution of the provider
   * with tool calls.
   *
   * @param provider
   * @param messages
   * @param functions
   * @param byAgent
   *
   * @returns {Promise<string>}
   */
  async handleExecution(
    provider,
    messages = [],
    functions = [],
    byAgent = null,
    requireDoneAttempts = 0
  ) {
    if (this.isTurnStateEnabled()) {
      const deduplicator = new ToolCallDeduplicator();
      return await this.#handleExecutionLoop({
        provider,
        messages,
        functions,
        byAgent,
        requireDoneAttempts,
        mode: "complete",
        callProvider: (currentMessages, currentFunctions) =>
          withSpan(
            "llm." + (provider?.constructor?.name || "unknown"),
            { provider: String(provider?.constructor?.name || ""), model: String(provider?.model || ""), streaming: false },
            () => provider.complete(currentMessages, currentFunctions)
          ),
        label: `${provider?.constructor?.name || "Provider"}.complete`,
        deduplicator,
      });
    }

    // get the chat completion
    const completion = preserveReasoningContentOnCompletion(
      await this.#withRetry(
        () => withSpan(
          "llm." + (provider?.constructor?.name || "unknown"),
          { provider: String(provider?.constructor?.name || ""), model: String(provider?.model || ""), streaming: false },
          () => provider.complete(messages, functions)
        ),
        { label: `${provider?.constructor?.name || "Provider"}.complete` }
      )
    );

    if (completion.functionCall) {
      const { name, arguments: args } = completion.functionCall;
      const fn = this.functions.get(name);

      // if provider hallucinated on the function name
      // ask the provider to complete again
      if (!fn) {
        return await this.handleExecution(
          provider,
          [
            ...messages,
            {
              name,
              role: "function",
              content: `Function "${name}" not found. Try again.`,
              originalFunctionCall: completion.functionCall,
            },
          ],
          functions,
          byAgent
        );
      }

      // Execute the function and return the result to the provider
      fn.caller = byAgent || "agent";
      this.markToolUsed();

      // 权限检查：在执行工具之前评估权限
      const permissionResult = this.evaluateToolPermission(name);
      if (permissionResult.decision === "deny") {
        this.handlerProps?.log?.(
          `[permission] Tool "${name}" denied: ${permissionResult.reason}`
        );

        return await this.handleExecution(
          provider,
          [
            ...messages,
            {
              name,
              role: "function",
              content: `工具 "${name}" 无法执行: ${permissionResult.reason}。请尝试其他方式完成任务。`,
              originalFunctionCall: completion.functionCall,
            },
          ],
          functions,
          byAgent
        );
      }

      // If confirmation is required, create a HITL approval and wait (default),
      // unless the invocation is running in FULL AUTHORIZE mode.
      if (permissionResult.decision === "require_confirmation") {
        this.handlerProps?.log?.(
          `[permission] Tool "${name}" requires confirmation: ${permissionResult.reason}`
        );

        const decision = await this.#requireToolApproval({
          toolName: name,
          toolArgs: safeJsonParse(args, {}),
          reason: permissionResult.reason,
        });

        if (decision.suspended) {
          return ToolResult.approvalSuspended(null, name, decision.confirmationId, {
            originalFunctionCall: completion.functionCall,
          });
        }

        if (!decision.approved) {
          const reasonText = decision.userResponse
            ? `原因: ${decision.userResponse}`
            : "";
          const blockedText = decision.expired
            ? `⏳ 工具 "${name}" 审批超时，已终止本次运行。${reasonText}`
            : `⛔ 工具 "${name}" 审批被拒绝，已终止本次运行。${reasonText}`;

          return await this.handleExecution(
            provider,
            [
              ...messages,
              {
                name,
                role: "function",
                content: blockedText,
                originalFunctionCall: completion.functionCall,
              },
            ],
            functions,
            byAgent,
            requireDoneAttempts
          );
        }
      }

      // 如果是 plan_only 模式，只返回计划不执行
      if (permissionResult.decision === "plan_only") {
        this.handlerProps?.log?.(
          `[permission] Tool "${name}" in plan-only mode`
        );

        return await this.handleExecution(
          provider,
          [
            ...messages,
            {
              name,
              role: "function",
              content: `[计划模式] 工具 "${name}" 已添加到执行计划中，参数: ${JSON.stringify(args)}。请继续规划其他步骤，或告知用户当前的执行计划。`,
              originalFunctionCall: completion.functionCall,
            },
          ],
          functions,
          byAgent
        );
      }

      // If provider is verbose, log the tool call to the frontend
      if (provider?.verbose) {
        this?.introspect?.(
          `[debug]: ${fn.caller} is attempting to call \`${name}\` tool`
        );
      }

      // Always log the tool call to the console for debugging purposes
      this.handlerProps?.log?.(
        `[debug]: ${fn.caller} is attempting to call \`${name}\` tool`
      );

      // 步骤追踪: 记录步骤索引 (时间由 ToolTimeoutExecutor 追踪)
      const stepTrackingEnabled = process.env.ENABLE_STEP_TRACKING === "true";
      const currentStep = this.currentStepIndex++;

      let result;

      // 🔥 Phase D/Task List: 上报工具调用开始（同步执行也需要上报）
      const estimatedMs = this.toolTimeoutExecutor.getTimeout(name);
      this?.reportToolCall?.({
        toolName: name,
        stage: "start",
        args,
        estimatedMs,
      });

      // 🔥 Phase G: 使用超时保护执行工具
      // 绑定 fn 作为 handler 的 this 上下文，确保内部方法调用正确
      const timeoutResult = await this.toolTimeoutExecutor.executeWithTimeout(
        name,
        fn.handler.bind(fn),
        args
      );

      if (timeoutResult.success) {
        result = timeoutResult.result;

        // 🔥 Phase D/Task List: 上报工具调用成功（同步执行）
        this?.reportToolCall?.({
          toolName: name,
          stage: "success",
          args,
          result,
          durationMs: timeoutResult.durationMs,
        });

        // 步骤追踪: 记录成功步骤
        if (stepTrackingEnabled) {
          this.#recordStepAsync({
            invocation_id: this.handlerProps?.invocation?.id,
            step_index: currentStep,
            step_type: InvocationStep.StepTypes.TOOL_CALL,
            tool_name: name,
            input_summary: DataSanitizer.sanitize(args, { maxLength: 1000 }),
            output_summary: DataSanitizer.sanitize(result, { maxLength: 1000 }),
            success: true,
            duration_ms: timeoutResult.durationMs,
          });
        }
      } else {
        // 🔥 Phase D/Task List: 上报工具调用失败（同步执行）
        this?.reportToolCall?.({
          toolName: name,
          stage: "error",
          args,
          error: timeoutResult.error,
          durationMs: timeoutResult.durationMs,
        });

        // 步骤追踪: 记录失败步骤
        if (stepTrackingEnabled) {
          this.#recordStepAsync({
            invocation_id: this.handlerProps?.invocation?.id,
            step_index: currentStep,
            step_type: InvocationStep.StepTypes.TOOL_CALL,
            tool_name: name,
            input_summary: DataSanitizer.sanitize(args, { maxLength: 1000 }),
            success: false,
            error_message: timeoutResult.error,
            duration_ms: timeoutResult.durationMs,
          });
        }

        // 超时时不抛出错误，而是返回友好提示让 LLM 重新规划
        if (timeoutResult.timedOut) {
          return await this.handleExecution(
            provider,
            [
              ...messages,
              {
                name,
                role: "function",
                content: timeoutResult.error,
                originalFunctionCall: completion.functionCall,
              },
            ],
            functions,
            byAgent
          );
        }

        // 非超时错误仍然抛出
        throw new Error(timeoutResult.error);
      }
      Telemetry.sendTelemetry("agent_tool_call", { tool: name }, null, true);

      // If the tool call has direct output enabled, return the result directly to the chat
      // without any further processing and no further tool calls will be run.
      if (this.skipHandleExecution) {
        // 不在这里重置 skipHandleExecution，让调用者知道这是一个 directOutput
        // this.skipHandleExecution = false; // 移到 #chat() 方法中重置
        this?.introspect?.(
          `The tool call has direct output enabled! The result will be returned directly to the chat without any further processing and no further tool calls will be run.`
        );
        this?.introspect?.(`Tool use completed.`);
        this.handlerProps?.log?.(
          `${fn.caller} tool call resulted in direct output! Returning raw result as string. NO MORE TOOL CALLS WILL BE EXECUTED.`
        );
        return result;
      }

      // Phase 3: Observation Masking - 压缩工具结果以减少 token 消耗
      const _offload = maybeOffloadResult(name, result, {
        enabled:
          String(process.env.TOOL_RESULT_OFFLOAD_ENABLED || "").toLowerCase() ===
          "true",
        runId:
          this?.handlerProps?.runId ||
          this?.handlerProps?.invocation?.uuid ||
          this?.conversationId ||
          "norun",
        storageDir:
          process.env.STORAGE_DIR || require("path").resolve(__dirname, "../../../storage"),
      });
      const { compressed: compressedResult } = _offload.offloaded
        ? { compressed: _offload.result }
        : COMPRESSION_CONFIG.enabled
          ? compressToolResult(name, _offload.result, {
              maxResultTokens: this.functions?.get?.(name)?.maxResultTokens,
            })
          : { compressed: _offload.result };

      return await this.handleExecution(
        provider,
        [
          ...messages,
          {
            name,
            role: "function",
            content: compressedResult,
            originalFunctionCall: completion.functionCall,
          },
        ],
        functions,
        byAgent,
        requireDoneAttempts
      );
    }

    // Require explicit done tool in auto/long-task mode.
    if (
      this.shouldRequireDoneTool() &&
      !this._taskComplete &&
      requireDoneAttempts < 1
    ) {
      return await this.handleExecution(
        provider,
        [
          ...messages,
          {
            role: "user",
            content:
              "如果你认为任务已经完成：请调用 done({message}) 结束；如果未完成：继续调用工具推进。不要在未调用 done 的情况下直接给最终答复。",
          },
        ],
        functions,
        byAgent,
        requireDoneAttempts + 1
      );
    }

    // After the single nudge: return the model's prose answer and let the normal message
    // path commit it. Do NOT markTaskComplete — that would emit a second, duplicate bubble.
    return completion?.textResponse;
  }

  /**
   * Continue the chat from the last interruption.
   * If the last chat was not an interruption, it will throw an error.
   * Provide a feedback where it was interrupted if you want to.
   *
   * @param feedback The feedback to the interruption if any.
   * @returns
   */
  async continue(feedback) {
    const lastChat = this._chats.at(-1);
    if (!lastChat || lastChat.state !== "interrupt") {
      throw new Error("No chat to continue");
    }

    // remove the last chat's that was interrupted
    this._chats.pop();

    const { from, to } = lastChat;

    if (this.hasReachedMaximumRounds(from, to)) {
      throw new Error("Maximum rounds reached");
    }

    if (feedback) {
      const message = {
        from,
        to,
        content: feedback,
      };

      // register the message in the chat history
      this.newMessage(message);

      // ask the node to reply
      await this.chat({
        to: message.from,
        from: message.to,
      });
    } else {
      await this.chat({ from, to });
    }

    return this;
  }

  /**
   * Retry the last chat that threw an error.
   * If the last chat was not an error, it will throw an error.
   */
  async retry() {
    const lastChat = this._chats.at(-1);
    if (!lastChat || lastChat.state !== "error") {
      throw new Error("No chat to retry");
    }

    // remove the last chat's that threw an error
    const { from, to } = this?._chats?.pop();

    await this.chat({ from, to });
    return this;
  }

  /**
   * Get the chat history between two nodes or all chats to/from a node.
   */
  getHistory({ from, to }) {
    return this._chats.filter((chat) => {
      const isSuccess = chat.state === "success";

      // return all chats to the node
      if (!from) {
        return isSuccess && chat.to === to;
      }

      // get all chats from the node
      if (!to) {
        return isSuccess && chat.from === from;
      }

      // check if the chat is between the two nodes
      const hasSent = chat.from === from && chat.to === to;
      const hasReceived = chat.from === to && chat.to === from;
      const mutual = hasSent || hasReceived;

      return isSuccess && mutual;
    });
  }

  /**
   * Get provider based on configurations.
   * If the provider is a string, it will return the default provider for that string.
   *
   * @param config The provider configuration.
   */
  getProviderForConfig(config) {
    if (typeof config.provider === "object") {
      return config.provider;
    }

    switch (config.provider) {
      case "openai":
        return new Providers.OpenAIProvider({ model: config.model });
      case "anthropic":
        return new Providers.AnthropicProvider({ model: config.model });
      case "lmstudio":
        return new Providers.LMStudioProvider({ model: config.model });
      case "ollama":
        return new Providers.OllamaProvider({ model: config.model });
      case "groq":
        return new Providers.GroqProvider({ model: config.model });
      case "togetherai":
        return new Providers.TogetherAIProvider({ model: config.model });
      case "azure":
        return new Providers.AzureOpenAiProvider({ model: config.model });
      case "koboldcpp":
        return new Providers.KoboldCPPProvider({});
      case "localai":
        return new Providers.LocalAIProvider({ model: config.model });
      case "openrouter":
        return new Providers.OpenRouterProvider({ model: config.model });
      case "mistral":
        return new Providers.MistralProvider({ model: config.model });
      case "generic-openai":
        return new Providers.GenericOpenAiProvider({ model: config.model });
      case "aihubmix":
        return new Providers.AiHubMixProvider({ model: config.model });
      case "perplexity":
        return new Providers.PerplexityProvider({ model: config.model });
      case "textgenwebui":
        return new Providers.TextWebGenUiProvider({});
      case "bedrock":
        return new Providers.AWSBedrockProvider({});
      case "fireworksai":
        return new Providers.FireworksAIProvider({ model: config.model });
      case "nvidia-nim":
        return new Providers.NvidiaNimProvider({ model: config.model });
      case "moonshotai":
        return new Providers.MoonshotAiProvider({ model: config.model });
      case "deepseek":
        return new Providers.DeepSeekProvider({ model: config.model });
      case "litellm":
        return new Providers.LiteLLMProvider({ model: config.model });
      case "apipie":
        return new Providers.ApiPieProvider({ model: config.model });
      case "xai":
        return new Providers.XAIProvider({ model: config.model });
      case "novita":
        return new Providers.NovitaProvider({ model: config.model });
      case "ppio":
        return new Providers.PPIOProvider({ model: config.model });
      case "gemini":
        return new Providers.GeminiProvider({ model: config.model });
      case "dpais":
        return new Providers.DellProAiStudioProvider({ model: config.model });
      case "cometapi":
        return new Providers.CometApiProvider({ model: config.model });
      case "foundry":
        return new Providers.FoundryProvider({ model: config.model });
      default:
        throw new Error(
          `Unknown provider: ${config.provider}. Please use a valid provider.`
        );
    }
  }

  /**
   * Register a new function to be called by the AIbitat agents.
   * You are also required to specify the which node can call the function.
   * @param functionConfig The function configuration.
   */
  function(functionConfig) {
    this.functions.set(functionConfig.name, {
      ...functionConfig,
      isConcurrencySafe: isConcurrencySafe(functionConfig.name, functionConfig),
      isReadOnly: functionConfig.isReadOnly ?? false,
      isDestructive: functionConfig.isDestructive ?? false,
    });
    return this;
  }

  /**
   * 异步记录调用步骤 (不阻塞主流程)
   * @private
   * @param {Object} stepData - 步骤数据
   * @param {number} stepData.invocation_id - 关联的 invocation ID
   * @param {number} stepData.step_index - 步骤序号
   * @param {string} stepData.step_type - 步骤类型
   * @param {string} [stepData.tool_name] - 工具名称
   * @param {string} [stepData.input_summary] - 输入摘要
   * @param {string} [stepData.output_summary] - 输出摘要
   * @param {boolean} [stepData.success] - 是否成功
   * @param {string} [stepData.error_message] - 错误信息
   * @param {number} [stepData.duration_ms] - 执行耗时
   */
  #recordStepAsync(stepData) {
    // 如果没有 invocation_id，跳过记录
    if (!stepData.invocation_id) {
      this.handlerProps?.log?.(
        `[StepTracking] Skipped: No invocation_id available`
      );
      return;
    }

    // 使用 setImmediate 异步执行，不阻塞主流程
    setImmediate(async () => {
      try {
        await InvocationStep.create(stepData);
        this.handlerProps?.log?.(
          `[StepTracking] Recorded step ${stepData.step_index}: ${stepData.tool_name || stepData.step_type}`
        );
      } catch (error) {
        // 静默失败，不影响主流程
        console.error("[StepTracking] Failed to record step:", error.message);
      }
    });
  }

  /**
   * 执行自我诊断 (Phase L3.1)
   * @private
   * @param {Object} step - 步骤信息
   * @param {string} step.toolName - 工具名称
   * @param {*} step.result - 执行结果
   * @param {boolean} step.success - 是否成功
   * @param {number} step.durationMs - 执行耗时
   * @param {number} step.stepIndex - 步骤索引
   * @param {string} [step.error] - 错误信息
   * @returns {Promise<Object|null>} 诊断结果，如果诊断未启用则返回 null
   */
  async #performDiagnostics(step) {
    // 检查是否启用自我诊断
    const selfDiagnosticsEnabled =
      process.env.ENABLE_SELF_DIAGNOSTICS === "true";
    if (!selfDiagnosticsEnabled || !this.diagnosticContext) {
      return null;
    }

    try {
      // 执行诊断
      const result = await diagnoseStep(step, this.diagnosticContext);

      // 记录诊断历史
      this.diagnosticHistory.push({
        stepIndex: step.stepIndex,
        toolName: step.toolName,
        timestamp: Date.now(),
        result,
      });

      this.handlerProps?.log?.(
        `[SelfDiagnostics] Step ${step.stepIndex} diagnosed: ${result.issues.length} issues found`
      );

      return result;
    } catch (error) {
      // 诊断失败不应影响主流程
      console.error("[SelfDiagnostics] Diagnosis failed:", error.message);
      return null;
    }
  }
}

module.exports = AIbitat;
