# Octopus Studio — Observability (OpenTelemetry)

## Overview

Cap5 adds **OpenTelemetry distributed tracing** to the agent layers.
A single team run produces a connected span tree so you can see exactly which
employee ran, how long each step took, and whether it succeeded — without
touching production prompts or user data.

---

## Default: zero overhead

By default no `OTEL_EXPORTER` is set, so no provider is registered.
`trace.getTracer()` returns the built-in OTel no-op tracer.
**All span calls are no-ops with virtually zero overhead.**

---

## Enabling export

Set `OTEL_EXPORTER` (and optional companions) before starting the server:

### Local console debug

```bash
OTEL_EXPORTER=console node server.js
```

Prints every finished span as JSON to stdout. Useful for local debugging.

### OTLP backend (Jaeger, Tempo, Honeycomb, etc.)

```bash
OTEL_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces  # default
```

Spans are batched and exported via OTLP/HTTP.

### Langfuse

```bash
OTEL_EXPORTER=langfuse
OTEL_EXPORTER_OTLP_ENDPOINT=https://cloud.langfuse.com/api/public/otel/v1/traces
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

Langfuse uses OTLP/HTTP with Basic-auth headers (public:secret, base64).

---

## Span vocabulary

### `team.orchestration`

Root span. Wraps the entire team run from plan decomposition to summary.

| Attribute | Type | Meaning |
|---|---|---|
| `orchestrationRunId` | string | Durable run ID (for resume) |
| `goalLen` | number | Character length of the goal (not the text itself) |
| `maxSteps` | number | Step limit configured |
| `steps` | number | Steps actually executed |
| `status` | string | `done` / `cancelled` / `budget_exceeded` / `suspended` |
| `resumed` | boolean | Whether this was a resumed run |
| `suspended` | boolean | Whether a step triggered HITL suspension |

### `team.step`

One per plan step, nested inside `team.orchestration`.

| Attribute | Type | Meaning |
|---|---|---|
| `stepId` | number | Zero-based step index |
| `assistantId` | string | The employee assigned to this step |
| `ok` | boolean | Whether the step succeeded |
| `errorCode` | string | Error code if failed (empty on success) |
| `retried` | boolean | Whether the step was retried once |

### `employee.run`

The actual employee execution span, nested inside the enclosing `team.step`.

| Attribute | Type | Meaning |
|---|---|---|
| `runId` | string | Per-run unique ID |
| `parentRunId` | string | `orchestrationRunId` of the enclosing team run |
| `assistantId` | string | Employee identifier |
| `depth` | number | Recursion depth (0 = top-level call from orchestrator) |
| `maxDepth` | number | Maximum allowed recursion depth |
| `hasContext` | boolean | Whether prior-step context was injected |
| `taskLen` | number | Character length of the task string |
| `textLen` | number | Character length of the result text |
| `sources` | number | Number of knowledge sources returned |
| `artifacts` | number | Number of artifacts returned |
| `hasError` | boolean | Whether the run failed |
| `errorCode` | string | Error code if failed |
| `suspended` | boolean | Whether HITL approval was triggered |

### `tool.<name>`

Emitted when an aibitat tool is executed via `_executeToolWithResult`.
Name is `tool.<toolName>` (e.g., `tool.docSearch`, `tool.run_employee`).

| Attribute | Type | Meaning |
|---|---|---|
| `toolName` | string | Tool identifier |
| `argsLen` | number | JSON-serialized args character length |
| `resultType` | string | `string` / `object` / `null` / etc. |
| `isError` | boolean | Whether the tool returned an error |

---

## PII guarantee

**No span attribute ever contains user-supplied text, prompt content, tool
arguments, result text, knowledge source content, or file names.**

Every attribute records only:
- IDs (opaque strings, safe)
- Counts / lengths (numbers, e.g. `goalLen`, `argsLen`)
- Booleans (e.g. `ok`, `hasError`)
- Status codes (short enum strings)
- Durations (implicit in span timestamps)

Strings longer than 64 characters are replaced with `[len:N]`.
Objects are replaced with `[obj:len:N]`.

---

## DebugTracer (parallel, unchanged)

The existing `DebugTracer` JSONL log (`__debug_tracer__` namespace) is
**not replaced by OTel**. It continues to run in parallel.
OTel is a side-channel — it adds structured trace export without touching
the existing debug path.

---

## Context propagation result (verified)

The acceptance test `server/__tests__/utils/agents/orchestration/teamTrace.e2e.test.js`
proves that `employee.run` nests **directly under `team.step`** across the full
real call chain:

```
team.orchestration (root)
  └── team.step (stepId=0, assistantId=worker-1)
        └── employee.run (runId=..., parentRunId=orchestrationRunId)
```

OTel's `AsyncLocalStorageContextManager` propagates context correctly through:

```
withSpan("team.step") → tool.execute() → callable.invoke() → service.run()
  → withSpan("employee.run")
```

No context loss detected across any `await` boundary in the chain.

---

## Known refinements (future work)

The following are NOT bugs — they are deferred enhancements:

1. **Provider / LLM spans**: No spans yet for the inner LLM call (tokens,
   latency, streaming). Adding these requires hooking into each provider
   adapter and handling streaming span durations carefully.

2. **Parallel streaming tool spans**: When multiple tools run concurrently
   under a single step, span ordering may not reflect wall-clock parallelism.
   This needs additional span links or concurrent-span support.

3. **Resume cross-request span linking**: A suspended-then-resumed run
   produces two separate `team.orchestration` spans (one per HTTP request).
   They share `orchestrationRunId` as an attribute, but are not linked as
   parent/child via OTel `SpanLink`. Adding `SpanLink` would make the
   resume relationship explicit in trace UIs.

4. **`tool.<name>` spans in e2e test**: The e2e acceptance test uses
   `FakeAibitat` which does not invoke `_executeToolWithResult`. As a result,
   `tool.*` spans are not produced in the e2e test. They are covered
   separately by Cap5-T4 unit tests.
