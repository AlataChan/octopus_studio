"use strict";

const AIbitat = require("../aibitat");
const { USER_AGENT, WORKSPACE_AGENT } = require("../defaults");
const { httpSocket } = require("../aibitat/plugins/http-socket.js");
const { AgentRuntimeFactory } = require("../runtime/agentRuntimeFactory");
const { attachAgentPlugins } = require("../runtime/attachAgentPlugins");
const { EmployeeRunEventSink } = require("./employeeRunEventSink");
const { withSpan, safeAttrs } = require("../../observability/otel");

const RUN_EMPLOYEE_TOOL = "run_employee";

class EmployeeRunService {
  // deps 注入用于测试(默认走真实实现)
  constructor(deps = {}) {
    this._createAibitat = deps.createAibitat || ((opts) => new AIbitat(opts));
    this._AgentRuntimeFactory = deps.AgentRuntimeFactory || AgentRuntimeFactory;
    this._attachAgentPlugins = deps.attachAgentPlugins || attachAgentPlugins;
    this._httpSocket = deps.httpSocket || httpSocket;
    this._genRunId = deps.genRunId || (() => `emp_${Date.now()}_${Math.round(Math.random() * 1e9)}`);
    this._log = deps.log || (() => {});
  }

  /**
   * 跑一个选定 AI 员工一轮(非 socket)。
   * @returns {{text, artifacts, sources, events, runId, usage, error}}
   */
  async run({
    workspace,
    user = null,
    thread = null,
    assistantId,
    task,
    context = null,
    parentRunId = null,
    signal = null,
    onEvent = null,
    maxDepth = 1,
    depth = 0,
    runId = null,
    approvalDelegate = null,
    readOnly = false,
    modelOverride = null,
  }) {
    if (!workspace) return this._fail(runId, "invalid_input", "workspace is required");
    if (!assistantId) return this._fail(runId, "invalid_input", "assistantId is required");
    if (!task) return this._fail(runId, "invalid_input", "task is required");

    const _runId = runId || this._genRunId();

    return withSpan(
      "employee.run",
      {
        runId: _runId,
        parentRunId: parentRunId ?? "",
        assistantId: String(assistantId),
        depth,
        maxDepth,
        hasContext: !!context,
        taskLen: String(task || "").length,
      },
      async (span) => {
        // 过程事件统一打 runId/parentRunId 标记后再外发(B8 trace 串联)
        const tagAndForward = (event) => {
          if (typeof onEvent === "function") {
            try { onEvent({ ...event, runId: _runId, parentRunId }); } catch (_) {}
          }
        };
        const sink = new EmployeeRunEventSink({ onEvent: tagAndForward });

        // provider/model
        const baseline = this._AgentRuntimeFactory.resolveProviderModel({ workspace });
        let provider = baseline.provider;
        let model = baseline.model;
        if (!provider) {
          const result = this._fail(_runId, "no_provider", "No valid provider found for the employee.");
          span.setAttributes(safeAttrs({
            textLen: 0,
            sources: 0,
            artifacts: 0,
            hasError: true,
            errorCode: "no_provider",
            suspended: false,
          }));
          return result;
        }

        const invocationMetadata = {}; // M0:auth-mode 由子员工自身配置决定,父不放大(B7)

        const hasOverride =
          modelOverride &&
          typeof modelOverride === "object" &&
          typeof modelOverride.provider === "string" &&
          typeof modelOverride.model === "string";
        let aibitat = null;
        const createAibitat = (providerValue, modelValue) =>
          this._createAibitat({
            provider: providerValue,
            model: modelValue,
            chats: [],
            handlerProps: {
              invocation: {
                uuid: _runId,
                workspace,
                workspace_id: workspace.id,
                user_id: user?.id ?? null,
                assistant_id: assistantId,
                thread_id: thread?.id ?? null,
              },
              workspaceId: workspace.id,
              workspace,
              user,
              parentRunId,
              runId: _runId,
              depth,
              maxDepth,
              log: this._log,
              requireDoneToolOnStart: true,
              requireDoneToolAfterToolUse: true,
              approvalDelegate: approvalDelegate || undefined,
            },
          });

        if (hasOverride) {
          provider = modelOverride.provider;
          model = modelOverride.model;
          aibitat = createAibitat(provider, model);
          try {
            aibitat.getProviderForConfig({ provider, model });
          } catch (overrideError) {
            this._log(
              `[tier_routing_fallback] employee override provider failed; falling back to baseline: ${overrideError?.message || String(overrideError)}`
            );
            provider = baseline.provider;
            model = baseline.model;
            try {
              aibitat.getProviderForConfig({ provider, model });
            } catch (baselineError) {
              const result = this._fail(
                _runId,
                "no_provider",
                `No valid provider found for the employee: ${baselineError?.message || String(baselineError)}`
              );
              span.setAttributes(safeAttrs({
                textLen: 0,
                sources: 0,
                artifacts: 0,
                hasError: true,
                errorCode: "no_provider",
                suspended: false,
              }));
              return result;
            }
            aibitat = createAibitat(provider, model);
          }
        }

        // 构造隔离 aibitat(chats:[] 不注入父历史;不写 workspace_chats — B4)
        if (!aibitat) aibitat = createAibitat(provider, model);

        // 事件经 httpSocket → sink(非 workspace socket — B1)
        aibitat.use(this._httpSocket.plugin({ handler: sink, muteUserReply: true, introspection: true }));

        // 装配选定员工运行时(B7:子按自身 assistant 权限/authMode;父不放大)
        const plan = await this._AgentRuntimeFactory.assemble({
          workspace,
          user,
          assistantId,
          workspaceId: workspace.id,
          invocationMetadata,
          provider,
          log: this._log,
        });
        aibitat.setPermissionConfig(plan.permissionConfig);
        aibitat.agent(USER_AGENT.name, plan.userAgentDef);
        aibitat.agent(WORKSPACE_AGENT.name, plan.workspaceAgentDef);

        // 防递归(B5):depth>=maxDepth → 子运行不挂 run_employee
        let funcsToLoad = Array.isArray(plan.funcsToLoad) ? plan.funcsToLoad : [];
        if (depth >= maxDepth) {
          funcsToLoad = funcsToLoad.filter(
            (f) => String(f) !== RUN_EMPLOYEE_TOOL
          );
        }
        await this._attachAgentPlugins({ aibitat, funcsToLoad, args: { handler: sink }, log: this._log });

        // B2: read-only sub-run — 硬隔离：留 isReadOnly 或 done（完成控制）；排除保留名（防递归）
        if (readOnly && aibitat.functions instanceof Map) {
          const RESERVED = new Set(["research", "run_employee"]);
          const ALLOW = new Set(["done"]); // 完成控制工具，非副作用，readOnly 也保留（否则无法收尾）
          for (const [fname, fcfg] of [...aibitat.functions]) {
            const keep = (fcfg?.isReadOnly === true || ALLOW.has(fname)) && !RESERVED.has(fname);
            if (!keep) aibitat.functions.delete(fname);
          }
        }

        // 取消传播(B3)
        let aborted = false;
        let resolveDone;
        const donePromise = new Promise((r) => { resolveDone = r; });
        const onAbortFired = () => { resolveDone(); };
        const onTerminateFired = () => { resolveDone(); };
        aibitat.onAbort(onAbortFired);
        aibitat.onTerminate(onTerminateFired);
        const onSignalAbort = () => {
          aborted = true;
          try { aibitat.abort(); } catch (_) {}
        };
        if (signal) {
          if (signal.aborted) {
            onSignalAbort();
          } else {
            signal.addEventListener("abort", onSignalAbort, { once: true });
          }
        }

        const route = {
          from: USER_AGENT.name,
          to: WORKSPACE_AGENT.name,
          content: this._buildPrompt(task, context),
        };

        let runError = null;
        try {
          await Promise.race([
            Promise.resolve(aibitat.start(route)).catch((e) => {
              runError = { code: "agent_error", message: e?.message || String(e) };
            }),
            donePromise,
          ]);
        } catch (e) {
          runError = { code: "agent_error", message: e?.message || String(e) };
        } finally {
          if (signal) {
            try { signal.removeEventListener("abort", onSignalAbort); } catch (_) {}
          }
          // 监听器清理(无悬挂)
          try { aibitat.emitter?.removeListener?.("abort", onAbortFired); } catch (_) {}
          try { aibitat.emitter?.removeListener?.("terminate", onTerminateFired); } catch (_) {}
        }

        const captured = sink.result();
        let error = captured.error || runError || null;
        if (aborted) error = { code: "aborted", message: "run aborted" };

        // HITL suspend: approvalSuspended 事件已被 sink 捕获 → approval_needed 优先于普通完成
        if (!aborted && captured.pendingApproval && captured.pendingApproval.confirmationId) {
          const result = {
            text: captured.text ?? null,
            artifacts: captured.artifacts,
            sources: captured.sources,
            events: captured.events,
            runId: _runId,
            usage: { inputTokens: 0, outputTokens: 0 },
            error: { code: "approval_needed", confirmationId: captured.pendingApproval.confirmationId },
          };
          span.setAttributes(safeAttrs({
            textLen: (result.text || "").length,
            sources: result.sources?.length || 0,
            artifacts: result.artifacts?.length || 0,
            hasError: true,
            errorCode: "approval_needed",
            suspended: true,
          }));
          return result;
        }

        const result = {
          text: captured.text ?? null,
          artifacts: captured.artifacts,
          sources: captured.sources,
          events: captured.events,
          runId: _runId,
          usage: { inputTokens: 0, outputTokens: 0 }, // M0 占位;真 usage 在 Cap5
          error,
        };

        span.setAttributes(safeAttrs({
          textLen: (result.text || "").length,
          sources: result.sources?.length || 0,
          artifacts: result.artifacts?.length || 0,
          hasError: !!result.error,
          errorCode: result.error?.code || "",
          suspended: result.error?.code === "approval_needed",
        }));

        return result;
      }
    );
  }

  _buildPrompt(task, context) {
    if (!context) return String(task);
    const ctx = typeof context === "string" ? context : JSON.stringify(context);
    return `${task}\n\n[上下文]\n${ctx}`;
  }

  _fail(runId, code, message) {
    return {
      text: null,
      artifacts: [],
      sources: [],
      events: [],
      runId: runId || null,
      usage: { inputTokens: 0, outputTokens: 0 },
      error: { code, message },
    };
  }
}

module.exports = { EmployeeRunService, RUN_EMPLOYEE_TOOL };
