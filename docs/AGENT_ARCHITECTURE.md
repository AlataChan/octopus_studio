# Agent Architecture (AGENT_ARCHITECTURE)

> This document is the **authoritative description of agent capabilities** in Octopus Studio: which agent systems currently exist, which engines they run on, which ready-made capabilities we already have, and the future unification direction.
>
> Status baseline: 2026-08-09. This document describes the current
> interface-gated chat paths and the separate FDE workflow runtime. Engine
> changes are evidence-gated; there is no unconditional "one engine" target.
>
> **Update (2026-08-09):** Phase 3 added a tested `ChatAgentEngine` type
> contract and pure selection policy. Production chat still calls AIbitat;
> there is no production caller that persists the policy result and no Mastra
> chat implementation. The M0.5
> spike rejected Mastra as the FDE workflow orchestrator: native resume needs
> an opaque Mastra snapshot, bounded loops were not enforced, and the removed
> wait API did not meet the contract. The Studio graph executor therefore owns
> FDE control flow and Prisma owns all durable state.

---

## 1. TL;DR / Quick Overview

- The current product contains **two independent agent systems**:
  - **AIbitat** — powers chat / @agent / "AI employees"; AnythingLLM's in-house "conversation + tool-calling" framework.
  - **work-agent (Mastra engine)** — an independent autonomous task execution subsystem (submit → approve → artifact), running on `@mastra/core`.
- A `ChatAgentEngine` type contract and pure policy define how a future caller
  must pin a session and roll back; production routing is not wired yet.
- Mastra is a supported agent/model-invocation path, not the owner of Studio
  workflow orchestration or persistence.

```text
                   ┌─────────────────────────────────────────────┐
    Today          │  Chat / @agent / AI employees  →  AIbitat engine │
    (current)      │  Autonomous work execution     →  Mastra engine  │
                   └─────────────────────────────────────────────┘
                                   │  parity-gated canary / rollback
                                   ▼
                   ┌─────────────────────────────────────────────┐
    Target         │  Stable interfaces select proven engines;    │
    (evidence)     │  Studio graph + Prisma own FDE workflows     │
                   └─────────────────────────────────────────────┘
```

---

## 2. Current State: Two Agent Systems

### 2.1 AIbitat (chat / @agent / AI employees)

AnythingLLM's in-house provider-agnostic "conversation + tool-calling" loop framework. **All production chat, @agent calls, and AI employee runs execute on it.**

Code location: `server/utils/agents/` (framework core in `server/utils/agents/aibitat/`; assembly entry point in `server/utils/agents/index.js`).

#### Key fact: the framework natively supports multiple agents, but the product has not activated it yet

AIbitat is **natively a multi-agent framework at the framework layer**:

- `.agent(name, def)` — registers any number of agents (`server/utils/agents/aibitat/index.js`).
- `.channel(name, members)` — groups multiple agents into a collaborative channel (`server/utils/agents/aibitat/index.js:597`).
- Inter-agent routing / conversation handoff / interruption / `TERMINATE` termination semantics.
- The official examples already include a multi-agent collaboration demo: `server/utils/agents/aibitat/example/websocket/websock-branding-collab.js` registers four agents, `creativeDirector` / `marketResearcher` / `copywriter` / `PM`, into the same `.channel("#branding")` for collaboration.

**However, the product currently registers only 2 fixed agents** — `user` and `workspace` (`server/utils/agents/index.js:838-839`):

```js
this.aibitat.agent(USER_AGENT.name, userAgentDef);
this.aibitat.agent(WORKSPACE_AGENT.name, workspaceAgentDef);
```

Each "AI employee" = the same `workspace` agent with different prompts / tools / knowledge bases. **There is no collaboration, delegation, or division of labor between employees.** `personaTemplates` defines `internalRoles` (planner/writer/editor, etc.), but nothing consumes them.

> Conclusion: **multi-agent capability already exists in the framework but has not yet been activated in the product.** Shipping "multi-agent collaboration" does not need to wait for engine convergence (see §5).

#### AIbitat capability surface (all must be matched during migration)

- **30+ tools across three layers**: system layer / output layer / business layer.
- **RAG**: vector retrieval + knowledge graph + knowledge sensing (`server/utils/agents/knowledgeSensing.js`); deterministic pre-model context assembly for source citations / pinned items / memory summaries, etc.
- **Planning / Orchestrator**: `server/utils/agents/orchestrator.js` (currently planning only).
- **HITL permission gateway**: risk tiers / allow-deny / scoped tools / audit / durable confirmation / frontend confirmation cards.
- **Skills**, **MCP**, **Agent Flow** (single-agent sequential workflows).
- **30+ provider fallback chain**.
- **A complete custom socket streaming UI protocol** (`reportStreamEvent` / `statusResponse` / `toolExecution` / `planningDecision` / `flowProgress` / `rechartVisualize` / `fileDownload`, etc.).
- **Per-assistant conversation isolation**, agent invocation, responseStyle, attachments, etc.

### 2.2 work-agent (Mastra engine)

An independent **autonomous task execution subsystem**: receives a work goal → autonomously uses tools such as files / shell / search / patches → requests approval for high-risk actions → produces verifiable artifacts (submit → approve → artifact). It runs entirely inside the server process and is provider-agnostic.

Code location: `server/utils/workAgent/`.

- **Stable interface seam**: `WorkAgentEngine` (`server/utils/workAgent/engine/types.js`) — the UI and backend business logic depend only on this interface, not on a concrete engine. Methods include `submitGoal` / `streamEvents` / `approve` / `getRun` / `getArtifacts` / `cancel` / `recover`.
- **Default adapter = Mastra**: `server/utils/workAgent/engine/mastraAdapter.js`; engine selection defaults to Mastra (`server/utils/workAgent/engines.js`, `enginePolicy.js`).
- **Dependency**: `@mastra/core` **v1.42.0** (`server/package.json:40`), Apache-2.0 parts only.
- **Currently only Mastra `Agent` + `createTool` are used** (`server/utils/workAgent/mastraLoader.js` loads only these two + `zod`). Mastra Workflow / suspend-resume / memory / network / model-router are **not enabled yet** (this subsystem implements its own execution base, safety policy, approval loop, and cost estimation).
- **Mastra is the only active work-agent adapter.** The former compatibility adapter was retired after the Phase 3 asset comparison; historical run rows retain their recorded engine value, but cannot dispatch into removed runtime code.

> The stable engine seam remains so a future replacement must enter through the same contract and parity gates.

---

## 3. Mastra capabilities available for evaluation

The table below lists Mastra APIs that can be evaluated. API presence is not
product-contract parity. The current product activates Agents + Tools; the
M0.5 evidence specifically rejects Mastra Workflow persistence and loop helpers
for Studio FDE orchestration.

| Capability                                          | One-line Description                                                                                                                                                                                                                                                      | Key APIs                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Agents + fine-grained streaming                     | Single-agent conversation + tool loop, emitting fine-grained chunks such as text / tool / reasoning / step / finish                                                                                                                                                       | `new Agent()`, `agent.stream().fullStream`, `agent.generate()`  |
| Workflows + suspend/resume                          | Available upstream, but **not adopted**: durable resume requires an opaque Mastra snapshot, conflicting with Prisma as sole truth                                                                                                                                         | `createWorkflow()`, `step.suspend()` / `resume()`               |
| Supervisor-agent multi-agent orchestration          | Use one supervisor agent to schedule sub-agents for collaboration. **Note: `Agent Network` (`.network()`) has been officially marked deprecated. The target architecture uses the supervisor-agent pattern; Network is only for short-term experiments, not the target.** | supervisor `agent.stream()` / `generate()` schedules sub-agents |
| Tools + approval + dynamic enablement               | Define tools, tool-level approval, and dynamically enable tool sets by context                                                                                                                                                                                            | `createTool()`, tool `requireApproval`                          |
| Memory                                              | Conversation history / semantic recall / working memory                                                                                                                                                                                                                   | `@mastra/memory`                                                |
| RAG + external vector stores + rerank               | Connect existing vector stores for retrieval augmentation + reranking                                                                                                                                                                                                     | `@mastra/rag`, `createVectorQueryTool()`                        |
| Multiple providers + local models + dynamic routing | OpenAI / Anthropic / OpenAI-compatible / Ollama / LMStudio + dynamic routing by cost                                                                                                                                                                                      | Model Router                                                    |
| SSE streaming (AI SDK)                              | Stream to the frontend as AI SDK UI message stream (SSE)                                                                                                                                                                                                                  | `@mastra/ai-sdk`                                                |
| Bidirectional MCP                                   | Native MCP, bidirectional (acts as client and can expose a server)                                                                                                                                                                                                        | `@mastra/mcp`                                                   |
| Pure library embeddable in Express                  | `@mastra/core` as an in-process pure library embedded in existing Express, with ESM/CJS dual compatibility (verified with CJS `require()` under packaged Electron / Node 24)                                                                                              | Server Adapter                                                  |

> Capability parity remains evidence-gated; API availability alone does not justify switching engines.

---

## 4. Direction: interface-gated chat convergence

> The current decision and evidence are in [`docs/evidence/`](evidence/).

### 4.1 Why retain the seam

- Reduce long-term burden only when migration evidence exceeds switching cost.
- Preserve existing-session behavior and a tested rollback path.
- Keep provider/model invocation replaceable without moving Studio approval,
  graph, checkpoint, or artifact authority into an engine SDK.

### 4.2 Target architecture

The `ChatAgentEngine` types and pure policy define a future selection contract;
a production caller must still persist the result, and a Mastra chat
implementation must still be built. Any capability migration must remain
reversible and preserve tools, RAG, event protocol, attachment behavior,
permissions, and Skills. Separately,
FDE workflows always use Studio's graph executor, Prisma checkpoints, server
permission gates, existing workspace retrieval, and Studio evidence protocol.
Mastra may be called for an LLM/agent step; it never stores workflow snapshots.

### 4.3 Bridge strategy (strangler pattern, no chat interruption)

Complete the `ChatAgentEngine` production caller and implementation adapters,
then use tool/MCP bridges to **migrate capability by capability**, with
independent verification and explicit rollback in every phase. AIbitat and
Mastra would coexist through a canary period; retirement requires a later owner
decision, and every phase acceptance requires its golden tests.

### 4.4 Two real boundaries (migration focus)

1. **Custom streaming UI protocol (largest engineering effort)**: the current frontend consumes a custom socket event protocol, while Mastra natively emits AI SDK UI message stream (SSE). Two paths:
   - (Recommended, long-term) migrate the frontend to the AI SDK stream format (Octopus-specific artifacts carried by custom data parts).
   - (Transitional) write a **protocol adapter**: consume Mastra `fullStream` and re-serialize it into the existing socket protocol, requiring zero frontend changes.
2. **Knowledge graph**: outside Mastra's domain. **Keep the existing graph construction / query stack**, wrap it as a Mastra tool or external MCP server; use `@mastra/rag` for the vector side of RAG.

### 4.5 Phased roadmap

| Phase                                | Content                                                                                                                                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **-1 Parity contract**               | Turn the current state into an acceptance baseline: `ChatAgentEngine` interface, event schema mapping table, tool registration mapping, provider fallback matrix, RAG mode contract, permission semantics table, golden conversation scripts + golden socket event sequences |
| **0 Streaming foundation**           | In-process Mastra integration; single-employee pure conversation runs on Mastra, while frontend events remain 100% compatible (via streaming adapter); dual-track + feature flag                                                                                             |
| **1 Three gates**                    | 1a tools (`createTool` re-registration) / 1b RAG (first retain deterministic pre-model context assembly) / 1c provider routing (align as an independent subsystem) — three independent gates, not merged                                                                     |
| **2 Multi-agent**                    | Evaluate supervisor-based invocation behind the seam; Studio-owned workflow/approval state remains outside Mastra                                                                                                                                                            |
| **3 HITL/Skills/Flow/graph closure** | Server permission gateway remains authoritative; Skills and knowledge graph cross only stable tool/MCP contracts                                                                                                                                                             |
| **4 Retirement decision**            | Retire AIbitat only after capability parity, production canary, rollback rehearsal, and explicit owner decision                                                                                                                                                              |
| **5 Documentation unification**      | Fully update according to the documentation checklist                                                                                                                                                                                                                        |

---

## 5. Important Distinction: Two Decoupled Tracks

Clearly distinguish the following two efforts as **two independently executable tracks**; do not conflate them:

| Track                                          | What it is                                                                          | Scale                            | Where it can land                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Track A: Ship multi-agent collaboration**    | Make the "AI team" real — delegation between employees / orchestrator collaboration | Relatively fast (weeks)          | **Can be implemented quickly on existing AIbitat (whose multi-agent capability already exists) or on a thin bridge** |
| **Track B: Evaluate chat migration to Mastra** | Move only chat capabilities that meet the parity and canary gates                   | Large migration (months, phased) | Must preserve the seam, existing-session pins, and rollback; retirement is a later owner decision                    |

> Multi-agent collaboration uses an orchestrator spine plus delegation while reusing the existing single-employee pipeline.

**Do not delay the multi-agent collaboration feature just because "we need to converge to Mastra"** — the former does not depend on completion of the latter.

---

## 6. Current-State Quick Reference

| Dimension                                                 | Current State                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Which engine powers chat / @agent / AI employees**      | **AIbitat** (`server/utils/agents/`)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Which engine powers work-agent (autonomous execution)** | **Mastra** (`@mastra/core` v1.42.0, default adapter; `server/utils/workAgent/`), using only Agent + createTool                                                                                                                                                                                                                                                                                                                                                     |
| **FDE workflow engine**                                   | **Studio graph executor + Prisma checkpoints**; Mastra is an optional per-step agent/model invocation boundary and stores no workflow snapshot                                                                                                                                                                                                                                                                                                                     |
| **Multi-agent current state**                             | **Delivered, flags off by default, canary-ready**: `@team` team orchestration (LLM planner → per-employee execution + durable HITL + Plan confirmation gate + recitation + read-only sub-agent), controlled by flags such as `TEAM_ORCHESTRATION_ENABLED`; a real DeepSeek planner run has been verified. Light-up still needs "single-employee chat guardrail + canary" (see light-up roadmap). The lower layer still reuses the AIbitat single-employee pipeline |
| **Current phase of chat migration**                       | Interface types, pure selection-policy tests, and parity matrix exist; production still uses AIbitat, and no caller persists a pin or dispatches chat to a Mastra implementation                                                                                                                                                                                                                                                                                   |

---

## 7. Related Documentation Index

- [`docs/evidence/`](evidence/) — current architecture, runtime decision, tests, and recovery evidence.

### Key Code Locations

- `server/utils/agents/` — AIbitat engine (chat / @agent / AI employees).
  - `server/utils/agents/index.js:838-839` — the product only registers two agents: user + workspace.
  - `server/utils/agents/aibitat/index.js:597` — `.channel()` multi-agent group.
  - `server/utils/agents/aibitat/example/websocket/websock-branding-collab.js` — four-employee multi-agent collaboration example.
  - `server/utils/agents/orchestrator.js` — Planning / Orchestrator (currently planning only).
- `server/utils/workAgent/` — work-agent subsystem (Mastra engine seam).
  - `server/utils/workAgent/engine/types.js` — stable `WorkAgentEngine` interface.
  - `server/utils/workAgent/engine/mastraAdapter.js` — Mastra adapter (default).
  - `server/utils/workAgent/mastraLoader.js` — currently loads only Agent + createTool.
  - `server/utils/workAgent/engines.js` / `enginePolicy.js` — engine selection, defaulting to Mastra.
- `server/package.json:40` — `"@mastra/core": "1.42.0"`.
- `server/utils/observability/otel.js` — OTel instrumentation entry point (withSpan / resetForTests). See [docs/OBSERVABILITY.md](./OBSERVABILITY.md) for details.
