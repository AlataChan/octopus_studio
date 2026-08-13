# Backlog: conflict detection at KB ingestion

## Idea

Before a curation proposal can merge into the workspace KB, detect mutually
incompatible assertions from different sources and quarantine the proposal for
review. Examples include two active shipping windows for the same region, a
product simultaneously marked both discontinued and available, or overlapping
refund policies with different day limits.

This is **not** fuzzy duplicate detection and must not be an LLM-only veto. A
first version needs normalized assertions shaped like
`subject / predicate / value / source / valid interval`, plus deterministic
rules for typed negation, exclusive scalar values, and overlapping validity.

## Why the current path lacks it

The active ingestion flow in
`server/utils/graphBuilder/workspaceGraphBuilder.js` is:

```text
ingest source -> propose curation -> check proposal target paths -> validate/apply
```

`KbClient.validate()` delegates structural/policy validation to the absorbed KB
integration. Studio checks caps, safe target paths, command failures and audit
events, but neither the client nor the builder compares candidate claims with
claims already accepted from other sources. Successful validation therefore
means “safe and structurally acceptable,” not “semantically consistent.”

## Likely implementation boundary

The narrow seam is `_runOctopusKbCuration()` after `propose()` and safe-target
validation, but before `validate(..., {apply: true})`.

1. Parse candidate assertions into a versioned, allowlisted fact shape.
2. Read only tenant-scoped active assertions for matching subject/predicate.
3. Apply deterministic conflict rules; an optional model may explain or rank a
   conflict but cannot override a deterministic conflict.
4. On conflict, fail closed: do not apply the proposal, emit a redacted audit
   record with source handles, and place it in a human review queue.
5. On no conflict, continue through the existing validator and apply path.

The detector belongs in `server/utils/octopusKb/` with orchestration at the
builder seam. It must not depend on an external protected checkout or create a
second KB authority.

## Build trigger and acceptance bar

Build this only after a design partner supplies a representative multi-source
corpus and either repeated contradictory-answer incidents or a contractual
pre-merge conflict-review requirement. Before enabling it, require:

- an agreed contradiction taxonomy and temporal semantics;
- labelled precision/recall fixtures, including legitimate policy revisions
  that must not be flagged;
- tenant-isolation, redaction and fail-closed tests at the apply boundary;
- an operator workflow that can resolve/quarantine without silently merging;
  and
- measured ingestion latency and false-positive rate within the partner's SLA.

Until that evidence exists, source attribution and manual curation remain more
honest than an unvalidated “conflict-free” claim.
