const { redactSecrets } = require("../../workAgent/security/policy");

class CodingAgentLoop {
  constructor({
    modelAdapter,
    toolRuntime,
    signal = null,
    maxTurns = 20,
    eventSink = null,
    costMeter = null,
  } = {}) {
    if (!modelAdapter) throw new Error("CodingAgentLoop requires modelAdapter");
    if (!toolRuntime) throw new Error("CodingAgentLoop requires toolRuntime");
    this.modelAdapter = modelAdapter;
    this.toolRuntime = toolRuntime;
    this.signal = signal;
    this.maxTurns = maxTurns;
    this.messages = [];
    this.usage = [];
    this.status = "idle";
    this.finalText = "";
    this.turns = 0;
    this.pendingApproval = null;
    this.started = false;
    this.eventSink = eventSink;
    this.costMeter = costMeter;
    this.error = null;
    this.reason = null;
    this.totalCostUsd = null;
  }

  cancelledResult(toolUse) {
    return {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: JSON.stringify({ reason: "cancelled" }),
      is_error: true,
      reason: "cancelled",
    };
  }

  approvalIdFromResult(toolResult) {
    try {
      const parsed = JSON.parse(toolResult?.content || "{}");
      return parsed.approvalId || null;
    } catch {
      return null;
    }
  }

  snapshot(status = this.status) {
    return {
      status,
      messages: this.messages,
      finalText: this.finalText,
      turns: this.turns,
      usage: this.usage,
      ...(this.error ? { error: this.error } : {}),
      ...(this.reason ? { reason: this.reason } : {}),
      ...(this.totalCostUsd != null ? { totalCostUsd: this.totalCostUsd } : {}),
      ...(this.pendingApproval
        ? {
            pendingApproval: {
              approvalId: this.pendingApproval.approvalId,
              tool_use_id: this.pendingApproval.toolUse.id,
              name: this.pendingApproval.toolUse.name,
            },
          }
        : {}),
    };
  }

  async continueLoop() {
    this.status = "running";
    while (this.turns < this.maxTurns) {
      this.turns += 1;
      if (this.signal?.aborted) {
        this.status = "cancelled";
        break;
      }

      let shouldContinue = false;
      try {
        for await (const event of this.modelAdapter.stream({ messages: this.messages })) {
          if (event.type === "text") {
            this.messages.push({ type: "assistant_text", content: event.text });
            this.finalText += event.text;
            continue;
          }
          if (event.type === "thinking") {
            this.messages.push({ type: "assistant_thinking", content: event.text });
            continue;
          }
          if (event.type === "usage") {
            this.usage.push(event.usage);
            this.messages.push({ type: "usage", usage: event.usage });
            if (this.costMeter?.addUsage) {
              const cost = this.costMeter.addUsage(event.usage);
              this.totalCostUsd = cost?.totalCostUsd ?? this.totalCostUsd;
              if (cost?.budgetExceeded) {
                this.status = "failed";
                this.reason = "budget_exceeded";
                this.error = "Coding agent budget exceeded.";
                this.eventSink?.record?.("coding.run.failed", {
                  reason: this.reason,
                  totalCostUsd: this.totalCostUsd,
                });
                return this.snapshot();
              }
            }
            continue;
          }
          if (event.type === "tool_use") {
            const toolUse = {
              type: "tool_use",
              id: event.id,
              name: event.name,
              input: event.input || {},
            };
            this.messages.push(toolUse);
            const toolResult = this.signal?.aborted
              ? this.cancelledResult(toolUse)
              : await this.toolRuntime.executeToolUse(toolUse);
            if (this.signal?.aborted) {
              this.messages.push(this.cancelledResult(toolUse));
              this.status = "cancelled";
              return this.snapshot();
            }
            if (toolResult?.reason === "approval_required") {
              this.pendingApproval = {
                approvalId: this.approvalIdFromResult(toolResult),
                toolUse,
              };
              this.status = "awaiting_approval";
              return this.snapshot();
            }
            this.messages.push(toolResult);
            shouldContinue = true;
            continue;
          }
          if (event.type === "stop_reason" && event.stop_reason === "tool_use") {
            shouldContinue = true;
          }
        }
      } catch (error) {
        this.status = "failed";
        this.error = redactSecrets(error?.message || String(error));
        this.eventSink?.record?.("coding.run.failed", { error: this.error });
        return this.snapshot();
      }
      if (!shouldContinue) {
        this.status = "completed";
        return this.snapshot();
      }
    }

    if (this.status !== "cancelled") this.status = "max_turns";
    return this.snapshot();
  }

  async run(prompt) {
    if (!this.started) {
      this.messages.push({ type: "user", content: prompt });
      this.started = true;
    }
    return this.continueLoop();
  }

  async resume({ approvalId, approved } = {}) {
    if (!this.pendingApproval) {
      return {
        ok: false,
        code: "approval_not_found",
        ...this.snapshot(this.status),
      };
    }
    if (this.pendingApproval.approvalId !== approvalId) {
      return {
        ok: false,
        code: "approval_not_found",
        ...this.snapshot(this.status),
      };
    }
    const toolResult = await this.toolRuntime.resumeApprovedToolUse(approvalId, {
      approved,
    });
    this.messages.push(toolResult);
    this.pendingApproval = null;
    if (this.signal?.aborted) {
      this.status = "cancelled";
      return this.snapshot();
    }
    return this.continueLoop();
  }

  cancelAwaiting() {
    if (this.pendingApproval) {
      this.messages.push(this.cancelledResult(this.pendingApproval.toolUse));
      this.pendingApproval = null;
    }
    this.status = "cancelled";
    return this.snapshot();
  }
}

module.exports = {
  CodingAgentLoop,
};
