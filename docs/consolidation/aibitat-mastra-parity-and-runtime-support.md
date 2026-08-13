# AIbitat → Mastra chat parity and FDE runtime support

Date: 2026-08-09  
Owner: Studio platform team  
Decision scope: chat compatibility only. Studio's graph executor owns FDE workflow control flow and durable state; Mastra workflows and snapshot storage are not part of this matrix.

## Evidence boundary

The real AIbitat surface was enumerated with:

```text
find server/utils/agents -maxdepth 2 -type d
server/utils/agents
server/utils/agents/aibitat
server/utils/agents/aibitat/__tests__
server/utils/agents/aibitat/example
server/utils/agents/aibitat/plugins
server/utils/agents/aibitat/providers
server/utils/agents/aibitat/utils
server/utils/agents/coding
server/utils/agents/coding/__fixtures__
server/utils/agents/cot
server/utils/agents/diagnostics
server/utils/agents/employeeRun
server/utils/agents/employeeRun/__tests__
server/utils/agents/evals
server/utils/agents/evals/datasets
server/utils/agents/guardrails
server/utils/agents/guardrails/processors
server/utils/agents/langchain-tools
server/utils/agents/orchestration
server/utils/agents/orchestration/__tests__
server/utils/agents/reasoning
server/utils/agents/runtime
server/utils/agents/structured
server/utils/agents/trajectoryMemory
server/utils/agents/trajectoryMemory/__tests__
```

`UNKNOWN` means there is no AIbitat-versus-Mastra **chat** contract test. A Mastra primitive or a passing work-agent test is evidence of an available building block, not chat parity.

## Chat parity matrix

| Capability | Current AIbitat behavior | Mastra equivalent actually present | Owner | Parity test | Status |
| --- | --- | --- | --- | --- | --- |
| Tools | Registers plugins/functions, executes serial and concurrent tool batches, deduplicates calls, compensates aborted calls, and supports streamed execution. | `@mastra/core` `Agent` + `createTool` are used by `server/utils/workAgent/engine/mastraAdapter.js`; no Mastra chat adapter exists. | Agent runtime | AIbitat-only: `server/__tests__/utils/agents/aibitat/runtimeLoop.test.js`, `streamingToolExecutor.test.js`, `toolCallDeduplicator.test.js`. Candidate parity test: run the same tool transcript through both `ChatAgentEngine` implementations. | **UNKNOWN** |
| RAG | Workspace retrieval happens in `server/utils/chats/apiChatHandler.js`; agent plugins add memory and knowledge-graph tools. | No Mastra chat implementation or shared RAG contract exists. The work-agent adapter has filesystem tools, not chat RAG. | Retrieval platform | Candidate parity test: fixed workspace/vector fixture asserting identical source selection, citations, and tenant namespace. | **UNKNOWN** |
| Providers | AIbitat has provider adapters for OpenAI, Anthropic, Azure, Gemini, DeepSeek, OpenRouter, Ollama, LM Studio, Moonshot, AIHubMix, and generic OpenAI-compatible APIs. | Work-agent Mastra accepts a routed `languageModel` through `providerRoute`, but no chat-provider matrix is exercised through Mastra. | Provider platform | AIbitat-only provider tests plus candidate parameterized chat canary over every supported connector. | **UNKNOWN** |
| Streaming events | AIbitat emits ordered turn/tool/thinking events and has abort/error compensation. | Work-agent Mastra writes `RunEvent` and SSE events, but its autonomous-work event vocabulary is not the chat event contract. | Realtime platform | AIbitat-only: `eventLog.test.js`, `runtimeLoop.test.js`, `toolSpan.otel.test.js`. Candidate parity test: golden ordered chat event transcript including abort and tool error. | **UNKNOWN** |
| Approvals | Tool execution can suspend on HITL approval without emitting a fake final message. | The work-agent Mastra adapter persists `WorkflowPendingConfirmation`; no Mastra chat approval/resume path exists. | Security/runtime | AIbitat-only: `runtimeLoop.test.js` approval cases and `toolResult.approvalSuspended.test.js`. Candidate parity E2E: suspend, process restart, approve/deny, resume. | **UNKNOWN** |
| Attachments | Chat handlers carry attachments into provider routing and persisted chat responses. | No Mastra chat adapter consumes or normalizes attachments. | Chat platform | Candidate parity test: text plus each allowed attachment type, size rejection, redaction, and persisted response shape. | **UNKNOWN** |
| Graph | AIbitat can route among registered agents/channels. This is a chat capability, distinct from FDE workflows. | Mastra workflow orchestration is intentionally excluded after the M0.5 evidence; the Studio graph executor only serves FDE workflows and does not establish chat graph parity. | Agent runtime | Candidate parity test: deterministic multi-agent route and handoff transcript. | **UNKNOWN** |
| Skills | AIbitat attaches built-in plugins, imported plugins, and flows through `attachAgentPlugins`. | Mastra `createTool` is available, but no adapter maps the Studio Skills/plugin lifecycle into a Mastra chat session. | Skills platform | AIbitat-only: `server/__tests__/utils/agents/runtime/attachAgentPlugins.test.js`. Candidate parity test: install, invoke, missing skill, permission denial, and uninstall. | **UNKNOWN** |

No AIbitat capability is declared at parity. Phase 3.2 supplies only the engine-selection boundary and rollback pinning; it does not turn these `UNKNOWN` rows green.

## FDE runtime support matrix

Source of truth: the FDE worktree's `loom/runtimes/base.py`, adapters, compilers, and runtime tests at commit `e87b6c75674900e4a750925e83ab1cf03bcbb999`.

| Target | Status | Supported nodes / trigger modes | Evidence-backed gaps |
| --- | --- | --- | --- |
| `studio` target `1`, schema `1.0`/`1.1` | **default** | Frozen compiler contract: `trigger(mode=manual)`, `retrieval(dataset=workspace_kb, rerank=false)`, `llm(model=default-chat-model, optional output_schema in 1.1)`, `output`. | Fails closed on HTTP, code, condition, loop, parallel, agent, schedule/webhook, per-node retries, rerank, and document-scoped retrieval. Although the Studio executor contains graph-control machinery, the FDE `studio-v1` compiler does not expose those nodes, so they remain unsupported contract surface. Evidence: `loom/runtimes/studio/v1/compiler.py`, `tests/runtimes/studio/v1/test_compiler.py`, `test_schema.py`. |
| `dify` target `1.14` | **compatibility** | Compiler emitters cover trigger/start, LLM, retrieval, HTTP, code, simple condition, and output when none of the governed redlines is requested. Lifecycle push/publish/run operations remain deferred. | Bounded loop, parallel fan-out/merge, agent semantics, complex conditions, HTTP credential/retry/idempotency, LLM/retrieval/code retry, and retrieval rerank fail closed through `assert_runtime_ir_supported`. Trigger mode equivalence beyond emitted Dify start shape is not runtime-conformance-proven. Evidence: `loom/runtimes/base.py`, `loom/runtimes/dify/adapter.py`, `tests/runtimes/dify/v1_14/`, `tests/runtimes/test_compile_capabilities.py`. |
| `hiagent` target `2.6` | **compatibility** | With a required customer binding, compiler emitters cover trigger/start, LLM, retrieval, HTTP, code, and output when none of the governed redlines is requested. Chat and chatflow bundle modes exist. | Condition rules, bounded loop, parallel, agent semantics, HTTP credential/retry/idempotency, LLM/retrieval/code retry, and retrieval rerank fail closed in the governed adapter path. Push/publish/run and trigger-mode equivalence beyond Start-node emission are deferred. Evidence: `loom/runtimes/base.py`, `loom/runtimes/hiagent/adapter.py`, `tests/runtimes/hiagent/`, `tests/runtimes/test_compile_capabilities.py`. |

Compatibility targets must not leak into Studio product state. The Studio importer accepts only `target: "studio"`; Dify and HiAgent remain FDE compilation/export concerns.
