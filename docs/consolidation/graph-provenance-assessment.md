# Graph provenance and bi-temporal facts assessment

**Decision: do not integrate Semantica.** Studio does not currently have a
validated regulated decision-provenance problem that justifies a Python
sidecar, RDF/SPARQL/OWL stack, or a second persistence authority. The useful
ideas are retained here as a trigger-based design option, not an integration
backlog.

## What Studio can prove today

| Existing evidence                                                                          | What it proves                                                                                                                                      | What it does not prove                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_events` (`seq`, base `type`, redacted `payload`, `createdAt`) and `RunEvent.append()` | Ordered, append-only execution evidence per run; the returned transport event preserves its dotted phase while storage has a controlled vocabulary. | The world-time interval in which a retrieved fact was valid, or when a source first learned/corrected it. `createdAt` is only the recording time of the event. |
| `run_artifacts`                                                                            | A typed, time-stamped pointer and metadata record for a run output.                                                                                 | A complete provenance graph for every assertion inside the artifact.                                                                                           |
| `fde_workflow_drafts`                                                                      | The canonical spec, compiler/schema/target/engine versions, bindings, actors and approval/publication timestamps.                                   | A reviewer's business rationale or the source facts that motivated a human decision.                                                                           |
| `specDigest`, `reviewSubjectDigest`, `reviewedSubjectDigest`                               | The approved bytes and their compiler/version/engine/binding/review-policy context were unchanged. Approval cannot silently move to a new subject.  | Why the reviewer considered that subject acceptable. A digest proves identity and integrity, not intent.                                                       |
| `fde_run_checkpoints`                                                                      | Current cursor, input digest, redacted outputs, attempt identity, lease owner/expiry and CAS version needed for safe resume.                        | A historical version chain of every checkpoint mutation; run events provide the execution narrative, while the checkpoint is current durable state.            |

The model recomputes the spec digest and fresh binding subject inside the
approval and publication transaction (`server/models/fdeWorkflowDraft.js`),
resets review fields when an imported subject changes, and revalidates that
subject again at run creation (`server/utils/fde/studioRunService.js`). For
workflow approval integrity, that digest chain is the right-sized control and
already closes the drift problem.

## A question current evidence cannot answer

A design partner could ask:

> A seller's refund policy was valid from January 1 through January 15, reached
> Studio on January 20, and was corrected on January 22. For a January 18
> customer answer, what policy was true in the business on that date, what did
> Studio know at execution time, and which later correction superseded it?

Studio can show when the run and retrieval event were recorded, the retrieved
document identifiers, the approved workflow subject, and the emitted artifact.
It cannot query facts independently by **valid time** (truth in the business)
and **recorded time** (truth known to Studio). Nor does the current workspace KB
persist an assertion revision chain that answers both `AS OF` dimensions.

Bi-temporal separation would materially help delayed ingestion, back-dated
contracts/policies, and retroactive corrections. It would not improve ordinary
FAQ provenance where the only requirement is “show the sources and execution
events used at the time.”

## Is decision provenance a real gap?

There are two different questions:

1. **What exact technical subject was approved, by whom, and was it still
   current?** Covered by the digest/actor/timestamp chain and fail-closed
   revalidation.
2. **Why did a human or policy choose it, and which claims supported that
   choice?** Not represented as a first-class decision record. This is a real
   capability gap, but there is no named product use or audit obligation in the
   current e-commerce validation market that makes it a delivery gap.

Adding generic PROV-O nodes now would create ontology and operational cost
without making an existing acceptance criterion pass.

## Recommendation and trigger

**Defer decision records and bi-temporal facts; do not integrate Semantica.**
Re-open the decision only when a contracted design partner requires both:

- reproducible “what was valid” versus “what Studio knew” queries for
  back-dated or corrected facts; and
- a reviewer decision chain with a named audit SLA that the current
  digest/event/artifact evidence cannot satisfy.

At that trigger, benchmark the smallest Prisma-native extension first:
`validFrom`/`validTo` plus `recordedAt`/`supersededAt` on normalized KB
assertions, and a `decision_records` row linking actor, rationale, subject
digest, and source assertion revisions. Consider RDF/PROV-O infrastructure only
if real cross-domain provenance queries exceed that relational model; do not
introduce an independent source of truth pre-emptively.
