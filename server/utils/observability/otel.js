"use strict";
/**
 * server/utils/observability/otel.js
 *
 * Thin OpenTelemetry wrapper for the Octopus agent layers.
 *
 * Design goals
 * ────────────
 * 1. **Zero overhead by default** — if OTEL_EXPORTER is absent / "none" / "noop",
 *    no provider is registered.  trace.getTracer() returns a no-op Tracer whose
 *    spans are discarded with virtually zero cost.
 * 2. **Env-driven export** — OTEL_EXPORTER=console | otlp | langfuse.
 * 3. **Test-injectable** — resetForTests({ exporter }) wires an InMemorySpanExporter
 *    per test; resetForTests() tears down and returns to no-op.
 * 4. **PII-safe attrs** — safeAttrs() strips long strings, objects, nulls.
 *
 * OTel JS 2.8 API notes (verified against installed source):
 *   - NodeTracerProvider constructor: new NodeTracerProvider({ spanProcessors: [...] })
 *   - Register globally:              provider.register()  (or .register({ contextManager, propagator }))
 *   - Shutdown:                       await provider.shutdown()
 *   - Reset global:                   trace.disable()
 */

const { trace, SpanStatusCode } = require("@opentelemetry/api");
const {
  NodeTracerProvider,
  SimpleSpanProcessor,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  InMemorySpanExporter,
} = require("@opentelemetry/sdk-trace-node");

// ──────────────────────────────────────────────────────────────────────────────
// Module-level state  (reset via resetForTests)
// ──────────────────────────────────────────────────────────────────────────────
let _provider = null;     // NodeTracerProvider | null
let _initialized = false; // guard for idempotent init

// ──────────────────────────────────────────────────────────────────────────────
// Internal: build + register provider
// ──────────────────────────────────────────────────────────────────────────────
function _buildProvider(spanProcessors) {
  // OTel 2.8: spanProcessors passed in constructor config
  const provider = new NodeTracerProvider({ spanProcessors });
  provider.register(); // sets global TracerProvider + AsyncLocalStorage context mgr
  return provider;
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal: lazy init driven by OTEL_EXPORTER env
// ──────────────────────────────────────────────────────────────────────────────
function _maybeInit() {
  if (_initialized) return;
  _initialized = true;

  const exporterEnv = (process.env.OTEL_EXPORTER || "").toLowerCase().trim();
  if (!exporterEnv || exporterEnv === "none" || exporterEnv === "noop") {
    // No provider registered — trace.getTracer() returns a built-in no-op Tracer.
    return;
  }

  let spanProcessors;
  if (exporterEnv === "console") {
    spanProcessors = [new SimpleSpanProcessor(new ConsoleSpanExporter())];
  } else if (exporterEnv === "otlp" || exporterEnv === "langfuse") {
    // Dynamic require so OTLPTraceExporter is only loaded when needed.
    const {
      OTLPTraceExporter,
    } = require("@opentelemetry/exporter-trace-otlp-http");

    const exporterOptions = {
      url:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
        "http://localhost:4318/v1/traces",
    };

    if (exporterEnv === "langfuse") {
      // Langfuse uses OTLP/HTTP with additional auth headers.
      const publicKey = process.env.LANGFUSE_PUBLIC_KEY || "";
      const secretKey = process.env.LANGFUSE_SECRET_KEY || "";
      const token = Buffer.from(`${publicKey}:${secretKey}`).toString(
        "base64"
      );
      exporterOptions.headers = { Authorization: `Basic ${token}` };
    }

    spanProcessors = [
      new BatchSpanProcessor(new OTLPTraceExporter(exporterOptions)),
    ];
  } else {
    // Unknown value — fall back to no-op (safe default).
    return;
  }

  _provider = _buildProvider(spanProcessors);
}

// ──────────────────────────────────────────────────────────────────────────────
// Public: getTracer
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Returns an OTel Tracer (lazy init, idempotent).
 * Without a registered provider this returns the built-in no-op Tracer.
 *
 * @param {string} [name="octopus-agents"]
 * @returns {import("@opentelemetry/api").Tracer}
 */
function getTracer(name = "octopus-agents") {
  _maybeInit();
  return trace.getTracer(name);
}

// ──────────────────────────────────────────────────────────────────────────────
// Public: safeAttrs — PII-safe attribute filter
// ──────────────────────────────────────────────────────────────────────────────
const SAFE_STRING_MAX = 64;
const SAFE_MSG_MAX = 200;

/**
 * Filters attribute values to prevent PII / large data from entering traces.
 *
 * Rules:
 *   - number | boolean → pass through as-is
 *   - string ≤ 64 chars → pass through
 *   - string > 64 chars → "[len:N]"
 *   - object / array → "[obj:len:N]" (using JSON.stringify length) or "[obj]"
 *   - null | undefined → omitted
 *
 * @param {Record<string, unknown>} attrs
 * @returns {Record<string, string|number|boolean>}
 */
function safeAttrs(attrs) {
  if (!attrs || typeof attrs !== "object") return {};
  const safe = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "number" || typeof v === "boolean") {
      safe[k] = v;
    } else if (typeof v === "string") {
      safe[k] = v.length <= SAFE_STRING_MAX ? v : `[len:${v.length}]`;
    } else if (typeof v === "object") {
      try {
        const jsonLen = JSON.stringify(v).length;
        safe[k] = `[obj:len:${jsonLen}]`;
      } catch {
        safe[k] = "[obj]";
      }
    }
    // Functions and other primitives are silently dropped.
  }
  return safe;
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal: sanitize exception before recording
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Returns a sanitized exception descriptor.
 * - `name`: error constructor name (safe — no user data)
 * - `message`: omitted — original message may contain PII / secrets.
 *   Only a truncated form appears in the span STATUS, not in the event attrs.
 * - Stack is intentionally omitted.
 */
function _sanitizeException(err) {
  if (!(err instanceof Error)) {
    return { name: "UnknownError" };
  }
  return {
    name: err.name || "Error",
    // message deliberately excluded from exception event attributes to
    // prevent secrets / PII from appearing in trace exports.
  };
}

/**
 * Returns a safe status message — only the error type name, NOT the raw message.
 * Raw messages may contain secrets / PII and must never reach trace exports.
 */
function _sanitizeStatusMessage(err) {
  if (!(err instanceof Error)) return "UnknownError";
  // Use only the error constructor name — never the raw message which may
  // contain user-supplied secrets or PII.
  return err.name || "Error";
}

// ──────────────────────────────────────────────────────────────────────────────
// Public: withSpan — active span wrapping an async fn
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Runs `fn` inside an active OTel span with context propagation.
 * - Attributes are filtered through safeAttrs.
 * - On success: status = OK.
 * - On exception: recordException (sanitized) + status = ERROR, then rethrow.
 * - span.end() is always called in finally.
 *
 * @template T
 * @param {string} name - Span name
 * @param {Record<string, unknown>} attrs - Raw attributes (will be filtered)
 * @param {(span: import("@opentelemetry/api").Span) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withSpan(name, attrs, fn) {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    try {
      span.setAttributes(safeAttrs(attrs));
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      // Record only the error name (type) in event attributes — never the raw
      // message which may contain secrets or PII.
      const sanitized = _sanitizeException(err);
      span.recordException(sanitized);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: _sanitizeStatusMessage(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Public: startSpan — manual span (caller controls lifecycle)
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Starts a span without making it "active" in the context.
 * The caller is responsible for calling span.end().
 *
 * @param {string} name - Span name
 * @param {Record<string, unknown>} [attrs={}] - Raw attributes
 * @returns {import("@opentelemetry/api").Span}
 */
function startSpan(name, attrs = {}) {
  const tracer = getTracer();
  const span = tracer.startSpan(name);
  span.setAttributes(safeAttrs(attrs));
  return span;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public: resetForTests — Jest isolation helper
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Shuts down the current provider, resets OTel global state, and optionally
 * installs a new InMemorySpanExporter-backed provider for the current test.
 *
 * Usage:
 *   beforeEach: await resetForTests({ exporter: new InMemorySpanExporter() });
 *   afterEach:  await resetForTests();  // tear down, return to no-op
 *
 * @param {{ exporter?: import("@opentelemetry/sdk-trace-base").InMemorySpanExporter }} [options={}]
 */
async function resetForTests({ exporter: injectedExporter } = {}) {
  // 1. Shutdown existing provider if any.
  if (_provider) {
    try {
      await _provider.shutdown();
    } catch {
      // Best effort — don't let teardown errors block tests.
    }
    _provider = null;
  }

  // 2. Reset the global OTel trace API (removes registered provider).
  trace.disable();

  // 3. Clear module-level init flag so next call to _maybeInit / getTracer
  //    goes through the full setup path again.
  _initialized = false;

  // 4. If a test exporter is provided, wire it up immediately.
  if (injectedExporter) {
    const processor = new SimpleSpanProcessor(injectedExporter);
    _provider = _buildProvider([processor]);
    _initialized = true; // block env-based init
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────
module.exports = {
  getTracer,
  withSpan,
  startSpan,
  safeAttrs,
  resetForTests,
};
