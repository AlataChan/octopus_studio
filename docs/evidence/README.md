# FDE + Studio product evidence package

Evidence date: 2026-08-09. This directory is the canonical technical narrative
for the consolidation gate; detailed command transcripts remain in the phase
execution notes linked below.

## Canonical product narrative

Octopus Studio is the delivery platform: it owns tenancy, workspaces, bindings,
review and publication, durable execution state, artifacts, events, audit, and
the operator UI. FDE is the compilation core: it turns a requirement into a
reviewable intermediate representation and compiles that IR into a versioned
Studio workflow contract; the same source IR retains explicit Dify and HiAgent
compatibility targets.

At the current evidence baseline, cross-border e-commerce is the validation
market. The proof is a governed customer-service FAQ that retrieves from the
workspace KB, produces JSON-schema-validated structured output, requires
separate author/reviewer/publisher actors, survives a process kill, and leaves
an artifact/audit trail.

Studio graph executor owns workflow control flow and durable state. Mastra is
a supported agent/model-invocation boundary; it does not own the graph or an
opaque workflow snapshot. This boundary is deliberate: the M0.5 spike found
that native Mastra resume requires its own snapshot storage and that its loop
helpers do not enforce the IR's bound.

## Package index

- [`demo.md`](./demo.md) — reproducible e-commerce demonstration
- [`architecture.md`](./architecture.md) — the architecture as implemented
- [`test-results.md`](./test-results.md) — current verification commands/counts
- [`performance-cost.md`](./performance-cost.md) — measured local data and its limits
- [`audit-sample.json`](./audit-sample.json) — sanitized, reproducible audit sample
- [`failure-recovery.md`](./failure-recovery.md) — SIGKILL/restart evidence

## Claim boundary

This is engineering evidence, not proof of market demand or paid conversion.
Commercial metrics are `P3-04` and remain a separate owner-led track. No real
customer data, credentials, model response, or production cost is embedded in
this package.
