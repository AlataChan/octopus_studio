const { ChannelAccount } = require("../../models/channelAccount");
const { ChannelBinding } = require("../../models/channelBinding");
const { ChannelMessageEvent } = require("../../models/channelMessageEvent");
const {
  EphemeralAgentHandler,
  EphemeralEventListener,
} = require("../agents/ephemeral");
const {
  WorkflowPendingConfirmation,
} = require("../../models/workflowPendingConfirmation");
const { safeJsonParse } = require("../http");
const { createAdapter } = require("./adapters");
const { MessageQueue } = require("./queue/MessageQueue");
const { matchBinding } = require("./router/BindingMatcher");
const { SessionManager } = require("./session/SessionManager");
const {
  evaluateCommandPolicy,
  extractSlashCommand,
} = require("./security/commandFilter");
const { ChannelRateController } = require("./security/rateControl");
const {
  DEFAULT_QUEUE_CONFIG,
  DEFAULT_SECURITY_POLICY,
  ERROR_TYPES,
} = require("./constants");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class IMGatewayService {
  constructor(options = {}) {
    this.queueConfig = {
      ...DEFAULT_QUEUE_CONFIG,
      ...(options.queueConfig || {}),
    };
    this.sessionManager = options.sessionManager || new SessionManager();
    this.rateController =
      options.rateController ||
      new ChannelRateController({
        peerWindowMs: Number(process.env.IM_GATEWAY_PEER_WINDOW_MS || 60_000),
        peerMax: Number(process.env.IM_GATEWAY_PEER_MAX || 20),
        accountConcurrencyMax: Number(
          process.env.IM_GATEWAY_ACCOUNT_CONCURRENCY_MAX || 10
        ),
      });
    this.agentTimeoutMs = Number(
      process.env.IM_GATEWAY_AGENT_TIMEOUT_MS || 60_000
    );

    this.queue = new MessageQueue({
      concurrency: this.queueConfig.concurrency,
      handler: (task) => this._handleQueuedInbound(task),
    });
  }

  async _getAccountContext(provider, accountId) {
    const account = await ChannelAccount.get({ provider, accountId });
    if (!account || account.status !== "active") {
      return { account: null, adapter: null, secrets: {} };
    }

    const secrets = ChannelAccount.parseSecrets(account);
    const adapter = createAdapter({ provider, account, secrets });
    return { account, adapter, secrets };
  }

  async verifyWebhook({ provider, accountId, request }) {
    try {
      const { account, adapter } = await this._getAccountContext(
        provider,
        accountId
      );
      if (!account || !adapter) {
        return { ok: false, reason: "ACCOUNT_NOT_FOUND" };
      }

      const ok = adapter.verifyWebhook(request);
      return ok
        ? { ok: true, account, adapter }
        : { ok: false, reason: "WEBHOOK_VERIFICATION_FAILED" };
    } catch (error) {
      console.error("[IMGateway] verifyWebhook failed:", error);
      return { ok: false, reason: "WEBHOOK_VERIFICATION_ERROR" };
    }
  }

  async acceptInbound({
    provider,
    accountId,
    rawEvent,
    query = {},
    request = null,
  }) {
    const { account, adapter } = await this._getAccountContext(
      provider,
      accountId
    );
    if (!account || !adapter) {
      return { accepted: true, ignored: true, reason: "ACCOUNT_NOT_FOUND" };
    }

    const normalizedProvider = String(provider || "").toLowerCase();

    // Fast-path URL verification challenges.
    if (normalizedProvider === "feishu") {
      const body =
        typeof rawEvent === "string"
          ? safeJsonParse(rawEvent, {})
          : rawEvent || {};
      if (body?.type === "url_verification" && body?.challenge) {
        return { accepted: true, challenge: body.challenge };
      }
      const parsed = adapter.parseEvent(body);
      if (parsed?.type === "challenge") {
        return { accepted: true, challenge: parsed.challenge };
      }
    }

    if (normalizedProvider === "wecom") {
      const echostr =
        rawEvent?.echostr || query?.echostr || request?.query?.echostr;
      if (echostr) {
        const parsed = adapter.parseEvent({ echostr });
        if (parsed?.type === "challenge") {
          return { accepted: true, challenge: parsed.challenge };
        }
        return { accepted: true, ignored: true, reason: "INVALID_CHALLENGE" };
      }
    }

    this.queue
      .push({
        provider: normalizedProvider,
        accountId: String(accountId),
        rawEvent,
        query,
      })
      .catch((error) => {
        console.error("[IMGateway] Queue push failed:", error);
      });

    return {
      accepted: true,
      queued: true,
    };
  }

  async _sendWithRetry(adapter, peer, text) {
    let lastResult = null;
    for (let i = 0; i < this.queueConfig.retryAttempts; i += 1) {
      lastResult = await adapter.sendTextReply(peer, text);
      if (lastResult?.ok) return lastResult;
      await sleep(this.queueConfig.retryBackoffMs * 2 ** i);
    }
    return lastResult;
  }

  async _runAgent({
    adapter,
    workspace,
    thread,
    message,
    binding,
    sessionKey,
    source,
    prompt,
  }) {
    const assistantId =
      binding?.route?.assistantId || binding?.route?.agentId || null;
    if (!assistantId) {
      throw new Error("BINDING_MISSING_AGENT_ID");
    }

    const uuid = String(message.eventId || message.messageId || Date.now());
    const agentHandler = new EphemeralAgentHandler({
      uuid,
      workspace,
      prompt: String(prompt || message.textContent || ""),
      userId: null,
      threadId: thread?.id || null,
      sessionId: null,
      assistantId: String(assistantId),
      source,
    });

    const eventListener = new EphemeralEventListener();
    await agentHandler.init();
    await agentHandler.createAIbitat({ handler: eventListener });

    // Apply binding-level permission policy (overrides assistant defaults).
    const permissionMode = binding?.security?.permissionMode;
    if (permissionMode) {
      agentHandler.aibitat.setPermissionConfig({
        permissionMode: String(permissionMode),
      });
    }

    // Notify IM user when a tool call requires confirmation.
    agentHandler.aibitat.handlerProps.onToolConfirmationRequired = async ({
      confirmationId,
      toolName,
      riskLevel,
      reason,
    }) => {
      const hint = [
        `工具调用需要人工确认`,
        `ID: ${confirmationId}`,
        `Tool: ${toolName}`,
        riskLevel ? `Risk: ${riskLevel}` : null,
        reason ? `Reason: ${reason}` : null,
        ``,
        `在当前对话发送:`,
        `/approve ${confirmationId}`,
        `或 /reject ${confirmationId}`,
      ]
        .filter(Boolean)
        .join("\n");

      await this._sendWithRetry(adapter, message.replyTarget, hint);

      await this._recordOutbound({
        message,
        binding,
        sessionKey,
        status: "processed",
        latencyMs: null,
        payload: {
          type: "hitl_confirmation_required",
          confirmationId,
          toolName,
          riskLevel,
        },
      });
    };

    const runPromise = eventListener.waitForClose();
    agentHandler.startAgentCluster();

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("AGENT_TIMEOUT")),
        this.agentTimeoutMs
      );
    });

    try {
      return await Promise.race([runPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _recordOutbound({
    message,
    binding,
    sessionKey = null,
    status,
    errorType = null,
    errorMessage = null,
    latencyMs = null,
    payload = null,
  }) {
    try {
      await ChannelMessageEvent.create({
        provider: message.provider,
        accountId: message.accountId,
        eventId: `${message.eventId}:outbound:${Date.now()}`,
        messageId: message.messageId,
        direction: "outbound",
        bindingId: binding?.id || null,
        sessionKey,
        agentId: binding?.route?.agentId || null,
        status,
        errorType,
        errorMessage,
        latencyMs,
        payload,
      });
    } catch (error) {
      console.error(
        "[IMGateway] Failed to record outbound event:",
        error.message
      );
    }
  }

  async _handleError({
    adapter,
    message,
    inboundEventId,
    binding = null,
    sessionKey = null,
    errorType,
    reason,
    latencyMs,
  }) {
    try {
      await adapter.sendErrorFeedback(message.replyTarget, errorType, "zh");
    } catch (sendError) {
      console.error("[IMGateway] sendErrorFeedback failed:", sendError.message);
    }

    await this._recordOutbound({
      message,
      binding,
      sessionKey,
      status: "failed",
      errorType,
      errorMessage: reason,
      latencyMs,
      payload: { reason },
    });

    await ChannelMessageEvent.updateStatus(inboundEventId, {
      bindingId: binding?.id || null,
      sessionKey,
      agentId: binding?.route?.agentId || null,
      status: "failed",
      errorType,
      errorMessage: reason,
      latencyMs,
    });
  }

  async _handleQueuedInbound(task) {
    const startTime = Date.now();
    const { provider, accountId, rawEvent } = task;

    const { account, adapter } = await this._getAccountContext(
      provider,
      accountId
    );
    if (!account || !adapter) {
      return;
    }

    const parsed = adapter.parseEvent(rawEvent);
    if (!parsed || parsed.type === "challenge") {
      return;
    }

    const message = {
      ...parsed,
      triggerType: parsed.triggerType || "message",
      eventType: parsed.eventType || null,
      eventKey: parsed.eventKey || null,
      provider: String(provider).toLowerCase(),
      accountId: String(accountId),
      eventId:
        parsed.eventId ||
        `${provider}:${accountId}:${parsed.messageId || "unknown"}:${Date.now()}`,
      timestamp: parsed.timestamp || Date.now(),
    };

    // Inbound audit + dedupe: only the first eventId wins.
    const inboundRecord = await ChannelMessageEvent.create({
      provider: message.provider,
      accountId: message.accountId,
      eventId: message.eventId,
      messageId: message.messageId,
      direction: "inbound",
      status: "queued",
      payload: {
        triggerType: message.triggerType,
        eventType: message.eventType,
        eventKey: message.eventKey,
        textLength: Number(message.textContent?.length || 0),
        peerType: message.peerType,
        peerId: message.peerId,
        senderId: message.senderId,
        isMentioned: message.isMentioned === true,
      },
    });

    if (inboundRecord?.duplicate) {
      return;
    }

    const inboundEventId = inboundRecord.id;

    const bindings = await ChannelBinding.getEnabledByAccount(
      provider,
      accountId
    );
    const binding = matchBinding(bindings, message);

    if (!binding) {
      await this._handleError({
        adapter,
        message,
        inboundEventId,
        errorType: ERROR_TYPES.NO_ROUTE,
        reason: "NO_ROUTE_MATCHED",
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    const security = {
      ...DEFAULT_SECURITY_POLICY,
      ...(binding.security || {}),
    };

    // We compute sessionKey pre-flight for audit/guardrails without creating DB state.
    const sessionScope = binding?.route?.sessionScope || "per-channel-peer";
    let sessionKey = this.sessionManager.buildSessionKey(message, sessionScope);

    // HITL approval commands (gateway-internal): /approve <id> | /reject <id>
    // Do not apply mention requirement, command policy, or agent concurrency limits for these.
    const command = extractSlashCommand(message.textContent);
    if (command === "/approve" || command === "/reject") {
      let workspace = null;
      let thread = null;
      try {
        const sessionResult = await this.sessionManager.getOrCreateThread({
          message,
          binding,
        });
        workspace = sessionResult.workspace;
        thread = sessionResult.thread;
        sessionKey = sessionResult.session?.sessionKey || sessionKey;
      } catch (error) {
        await this._handleError({
          adapter,
          message,
          inboundEventId,
          binding,
          sessionKey,
          errorType: ERROR_TYPES.AGENT_ERROR,
          reason: error.message,
          latencyMs: Date.now() - startTime,
        });
        return;
      }

      const allowlist = Array.isArray(binding?.match?.senderAllowlist)
        ? binding.match.senderAllowlist.map((v) => String(v))
        : [];

      // Approving tool calls is high-risk: require explicit allowlist (no wildcard).
      const senderIsExplicitlyAllowed =
        allowlist.length > 0 &&
        !allowlist.includes("*") &&
        allowlist.includes(String(message.senderId || ""));

      if (!senderIsExplicitlyAllowed) {
        await this._handleError({
          adapter,
          message,
          inboundEventId,
          binding,
          sessionKey,
          errorType: ERROR_TYPES.PERMISSION_DENIED,
          reason: "SENDER_NOT_AUTHORIZED_FOR_HITL",
          latencyMs: Date.now() - startTime,
        });
        return;
      }

      const parts = String(message.textContent || "")
        .trim()
        .split(/\s+/);
      const id = Number(parts[1]);
      if (!Number.isFinite(id) || id <= 0) {
        await this._sendWithRetry(
          adapter,
          message.replyTarget,
          `Usage:\n/approve <id>\n/reject <id>`
        );
        await this._recordOutbound({
          message,
          binding,
          sessionKey,
          status: "processed",
          latencyMs: Date.now() - startTime,
          payload: { type: "hitl_command_invalid", command },
        });
        await ChannelMessageEvent.updateStatus(inboundEventId, {
          bindingId: binding.id,
          sessionKey,
          agentId: binding.route?.agentId || null,
          status: "processed",
          latencyMs: Date.now() - startTime,
          payload: { type: "hitl_command_invalid", command },
        });
        return;
      }

      const confirmation = await WorkflowPendingConfirmation.get(id);
      if (!confirmation) {
        await this._sendWithRetry(
          adapter,
          message.replyTarget,
          `确认ID不存在: ${id}`
        );
        await this._recordOutbound({
          message,
          binding,
          sessionKey,
          status: "processed",
          latencyMs: Date.now() - startTime,
          payload: { type: "hitl_command_not_found", confirmationId: id },
        });
        await ChannelMessageEvent.updateStatus(inboundEventId, {
          bindingId: binding.id,
          sessionKey,
          agentId: binding.route?.agentId || null,
          status: "processed",
          latencyMs: Date.now() - startTime,
          payload: { type: "hitl_command_not_found", confirmationId: id },
        });
        return;
      }

      if (
        Number(confirmation.workspaceId) !== Number(binding.workspaceId) ||
        (confirmation.threadId != null &&
          Number(confirmation.threadId) !== Number(thread.id))
      ) {
        await this._handleError({
          adapter,
          message,
          inboundEventId,
          binding,
          sessionKey,
          errorType: ERROR_TYPES.PERMISSION_DENIED,
          reason: "CONFIRMATION_CONTEXT_MISMATCH",
          latencyMs: Date.now() - startTime,
        });
        return;
      }

      const ok =
        command === "/approve"
          ? await WorkflowPendingConfirmation.approve(
              id,
              `IM:${message.senderId || "unknown"}`
            )
          : await WorkflowPendingConfirmation.reject(
              id,
              `IM:${message.senderId || "unknown"}`
            );

      await this._sendWithRetry(
        adapter,
        message.replyTarget,
        ok
          ? `已${command === "/approve" ? "批准" : "拒绝"}确认: ${id}`
          : `无法处理确认: ${id}`
      );

      await this._recordOutbound({
        message,
        binding,
        sessionKey,
        status: ok ? "processed" : "failed",
        errorType: ok ? null : ERROR_TYPES.AGENT_ERROR,
        errorMessage: ok ? null : "HITL_UPDATE_FAILED",
        latencyMs: Date.now() - startTime,
        payload: {
          type: "hitl_command_result",
          command,
          confirmationId: id,
          ok,
        },
      });

      await ChannelMessageEvent.updateStatus(inboundEventId, {
        bindingId: binding.id,
        sessionKey,
        agentId: binding.route?.agentId || null,
        status: ok ? "processed" : "failed",
        errorType: ok ? null : ERROR_TYPES.AGENT_ERROR,
        errorMessage: ok ? null : "HITL_UPDATE_FAILED",
        latencyMs: Date.now() - startTime,
        payload: {
          type: "hitl_command_handled",
          command,
          confirmationId: id,
          ok,
        },
      });
      return;
    }

    if (
      security.requireMention &&
      message.peerType === "group" &&
      !message.isMentioned
    ) {
      await ChannelMessageEvent.updateStatus(inboundEventId, {
        bindingId: binding.id,
        sessionKey,
        agentId: binding.route?.agentId || null,
        status: "ignored",
        errorType: null,
        errorMessage: "REQUIRE_MENTION_NOT_MET",
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    if (
      Number(security.maxMessageLength) > 0 &&
      message.textContent.length > Number(security.maxMessageLength)
    ) {
      await this._handleError({
        adapter,
        message,
        inboundEventId,
        binding,
        sessionKey,
        errorType: ERROR_TYPES.MESSAGE_TOO_LONG,
        reason: "MESSAGE_TOO_LONG",
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    const commandDecision = evaluateCommandPolicy({
      textContent: message.textContent,
      security,
    });
    if (!commandDecision.allowed) {
      await this._handleError({
        adapter,
        message,
        inboundEventId,
        binding,
        sessionKey,
        errorType: commandDecision.errorType || ERROR_TYPES.COMMAND_BLOCKED,
        reason: commandDecision.reason || "COMMAND_BLOCKED",
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    const peerLimit = this.rateController.allowPeerMessage({
      provider,
      accountId,
      peerId: message.peerId,
    });
    if (!peerLimit.allowed) {
      await this._handleError({
        adapter,
        message,
        inboundEventId,
        binding,
        sessionKey,
        errorType: ERROR_TYPES.RATE_LIMITED,
        reason: "PEER_RATE_LIMITED",
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    if (!this.rateController.acquireAccountSlot({ provider, accountId })) {
      await this._handleError({
        adapter,
        message,
        inboundEventId,
        binding,
        sessionKey,
        errorType: ERROR_TYPES.RATE_LIMITED,
        reason: "ACCOUNT_CONCURRENCY_LIMITED",
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    try {
      // Create or reuse thread mapping only when we're about to run the agent.
      const sessionResult = await this.sessionManager.getOrCreateThread({
        message,
        binding,
      });
      const workspace = sessionResult.workspace;
      const thread = sessionResult.thread;
      sessionKey = sessionResult.session?.sessionKey || sessionKey;

      const source = {
        kind: "im_gateway",
        triggerType: message.triggerType,
        eventType: message.eventType,
        eventKey: message.eventKey,
        provider: message.provider,
        accountId: message.accountId,
        peerType: message.peerType,
        peerId: message.peerId,
        senderId: message.senderId,
        bindingId: binding.id,
        sessionKey,
        agentId: binding?.route?.agentId || null,
      };

      const agentPrompt =
        message.triggerType === "menu_action"
          ? String(binding?.route?.inputTemplate || "").trim()
          : String(message.textContent || "").trim();

      if (!agentPrompt) {
        throw new Error("EMPTY_INBOUND_PROMPT");
      }

      const result = await this._runAgent({
        adapter,
        workspace,
        thread,
        message,
        binding,
        sessionKey,
        source,
        prompt: agentPrompt,
      });
      const textResponse = String(result?.textResponse || "").trim();

      if (!textResponse) {
        throw new Error(result?.error || "EMPTY_AGENT_RESPONSE");
      }

      const sendResult = await this._sendWithRetry(
        adapter,
        message.replyTarget,
        textResponse
      );

      if (!sendResult?.ok) {
        throw new Error(sendResult?.error || "OUTBOUND_SEND_FAILED");
      }

      const latencyMs = Date.now() - startTime;
      await this._recordOutbound({
        message,
        binding,
        sessionKey,
        status: "processed",
        latencyMs,
        payload: {
          textLength: textResponse.length,
          outboundMessageId: sendResult.messageId,
        },
      });

      await ChannelMessageEvent.updateStatus(inboundEventId, {
        bindingId: binding.id,
        sessionKey,
        agentId: binding.route?.agentId || null,
        status: "processed",
        latencyMs,
      });
    } catch (error) {
      const isTimeout = error.message === "AGENT_TIMEOUT";
      await this._handleError({
        adapter,
        message,
        inboundEventId,
        binding,
        sessionKey,
        errorType: isTimeout
          ? ERROR_TYPES.AGENT_TIMEOUT
          : ERROR_TYPES.AGENT_ERROR,
        reason: error.message,
        latencyMs: Date.now() - startTime,
      });
    } finally {
      this.rateController.releaseAccountSlot({ provider, accountId });
    }
  }

  getHealth() {
    return {
      queue: {
        pending: this.queue.pending,
        running: this.queue.running,
        idle: this.queue.idle,
        concurrency: this.queueConfig.concurrency,
      },
    };
  }
}

module.exports = {
  IMGatewayService,
};
