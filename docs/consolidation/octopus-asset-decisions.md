# Octopus asset decisions

Date: 2026-08-09  
Read-only source: `octopus@ddf895a6c4330f0dbb9110ed8c47d1f05c2487e2`

The source repository was read only. No source test, package manager, Git write,
or file write was run. An asset is copied only if a grep or regression test
first proves Studio lacks an equivalent. Every area below has a tested Studio
equivalent, so the prerequisite for adoption is false and no Octopus runtime is
copied.

## Decisions

| Area | Octopus evidence | Studio evidence | Decision | Owner / regression evidence |
| --- | --- | --- | --- | --- |
| Approvals | `packages/gateway/src/routes/approval.ts` validates allow/deny, checks `sessions.approve`, updates policy, and emits a resolution event. | `server/models/workflowPendingConfirmation.js` persists create/approve/reject state; `server/utils/workAgent/engine/mastraAdapter.js` suspends execution and resolves it; `server/models/fdeWorkflowDraft.js` owns review/publish separation and fresh-subject validation in Prisma. | **equivalent exists**. The Studio mechanisms are more strongly persisted and tenant-bound; migrating the gateway's process-policy mutation would create a second approval truth. | Security/runtime. `approvalBroker.test.js`, `mastraAdapter.test.js`, `fdeWorkflowDraft.test.js`. |
| Artifacts | `packages/gateway/src/routes/artifacts.ts` authorizes session reads, constrains paths, renders UTF-8 preview, and optionally returns Git diff. | `server/models/runArtifact.js` is the metadata source of truth; `server/endpoints/runArtifacts.js` workspace-scopes reads with indistinguishable 404; `server/utils/fde/artifactRedaction.js` sanitizes bytes before storage; Live Canvas already previews the stored artifact contract. | **equivalent exists**. Copying the Octopus file-path route would bypass Studio's workspace/run relation and redaction boundary. | Runtime/UI. `runArtifactsAccess.test.js`, `artifactRedaction.test.js`, `server/__tests__/utils/artifacts.test.js`. |
| Validation | `packages/gateway/src/secret-ref-validator.ts`, `tenant-path-validator.ts`, and `packages/work-core/src/verification/schema-validator.ts` cover secret handles, filesystem containment, and a small JSON shape validator. | `server/utils/workAgent/security/policy.js` plus `tools/localExecution.js` enforce approved workspace roots and execution policy; `server/utils/fde/redaction.js` rejects/scans secrets at persistence boundaries; `studioWorkflowImporter.js` validates the pinned JSON Schema and semantic binding equality. | **equivalent exists**. Studio's checks are attached to the actual persistence/execution boundaries. The Octopus simple schema validator would be weaker than the pinned AJV contract. | Security/runtime. `securityPolicy.test.js`, `localExecution.test.js`, `studioWorkflowImporter.test.js`. |
| Evaluation | `packages/eval-runner/src/{runner,scorer}.ts` runs cases in temporary workspaces and checks file/session/artifact assertions; gateway files add an Octopus-specific persistence/UI service. | `server/utils/agents/evals/{datasetLoader,runner,scorer,llmScorer}.js` already provides offline datasets, timeouts/abort, deterministic and LLM scorers, thresholds, result summaries, and CLI output. Studio's broader evaluation metrics remain under `server/evaluation/`. | **equivalent exists**. The Octopus runner is coupled to the retiring engine/session type; its gateway persistence would duplicate Studio run/evaluation state. | Evaluation platform. `server/__tests__/utils/agents/evals/runner.test.js`, `scorer.test.js`, and `server/__tests__/evaluation/metrics.test.js`. |

## Absence proof

The governing rule was "prove absence before adopting." Searches found the
named Studio modules in all four areas, so **absence was not proven and no
adoption was allowed**. A focused verification of those existing boundaries
returned:

```text
Test Suites: 10 passed, 10 total
Tests:       125 passed, 125 total
Snapshots:   0 total
```

This is a deliberate no-copy result, not an unevaluated backlog. The source
assets remain readable in the archive candidate and the decision can be
reopened only with a failing Studio regression that demonstrates a concrete
missing behavior.
