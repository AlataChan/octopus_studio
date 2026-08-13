# Studio product-surface classification

Date: 2026-08-09

Inventory commit: `82706377`

Decider: product owner

This is a product-judgement decision, not a usage-data result: the repository
does not instrument route-level product adoption consistently enough to rank
these surfaces by measured use. The owner reserves `default-visible` for the
first sellable FDE loop and the account, workspace, model, and knowledge-base
configuration it needs. `hidden` remains reachable by direct route/API for
compatibility, `maintenance-only` supports operators or integrations without
navigation, and `deletion-candidate` is only a C3 decision marker—nothing is
deleted in Phase 2B.

`VITE_STUDIO_FOCUSED_SURFACE` defaults to `true`. Setting it to `false` restores
compatibility navigation; it does not change server authorization or delete a
route.

## Server endpoint entries (52/52)

| Entry | Classification | Evidence / reason |
| --- | --- | --- |
| `server/endpoints/admin.js` | default-visible | Provisions the separate creator/admin accounts and workspace membership required by approval separation. |
| `server/endpoints/agentFlows.js` | hidden | Legacy agent-flow authoring, outside the FDE loop. |
| `server/endpoints/agentStatus.js` | maintenance-only | Runtime health/status support. |
| `server/endpoints/agentWebsocket.js` | hidden | Legacy interactive agent transport. |
| `server/endpoints/aiSystem.js` | hidden | General AI-system administration beyond required model configuration. |
| `server/endpoints/api` | maintenance-only | Versioned external/integration APIs remain supported without product navigation. |
| `server/endpoints/apiKeys.js` | hidden | General external API-key management, not FDE service credentials. |
| `server/endpoints/assistantLibrary.js` | hidden | Assistant marketplace is outside the first loop. |
| `server/endpoints/billing.js` | hidden | Commercial account surface is flag-gated and outside the first loop. |
| `server/endpoints/browserExtension.js` | hidden | Browser-extension compatibility surface. |
| `server/endpoints/chat.js` | hidden | General workspace chat remains compatible; FDE authoring is the default entry point. |
| `server/endpoints/codingAgent.js` | hidden | Coding-agent product is outside the first loop. |
| `server/endpoints/communityHub.js` | deletion-candidate | Community Hub is already absent from navigation and has no FDE dependency. |
| `server/endpoints/document.js` | default-visible | Upload/embedding path for the reserved `workspace_kb` binding. |
| `server/endpoints/embed` | hidden | Embeddable chat compatibility API. |
| `server/endpoints/embedManagement.js` | hidden | Administration for the hidden embed surface. |
| `server/endpoints/experimental` | deletion-candidate | Experimental connectors have no first-loop dependency; owner decides at C3. |
| `server/endpoints/extensions` | maintenance-only | Extension integration API, retained without navigation. |
| `server/endpoints/fdeAuthoring.js` | default-visible | Describe, clarify, diff, and compile-import entry point. |
| `server/endpoints/fdeRuns.js` | default-visible | Run, monitor, cancel, resume, event, and artifact loop. |
| `server/endpoints/fdeWorkflows.js` | default-visible | Draft, binding, review, and publish authority. |
| `server/endpoints/feedback.js` | hidden | Generic feedback channel is not required by the loop. |
| `server/endpoints/imGateway.js` | hidden | Channel delivery integration is outside the primary demo. |
| `server/endpoints/internalApi.js` | maintenance-only | Server-to-server compatibility surface. |
| `server/endpoints/invite.js` | hidden | Direct admin account provisioning is the Phase 2B demo path. |
| `server/endpoints/liveCanvas.js` | hidden | Existing live-canvas product surface; FDE has its own monitor. |
| `server/endpoints/mcpServers.js` | hidden | MCP administration is outside the first loop. |
| `server/endpoints/metrics.js` | maintenance-only | Operator metrics, not end-user navigation. |
| `server/endpoints/mobile` | maintenance-only | Mobile integration API retained without default navigation. |
| `server/endpoints/molt.js` | hidden | Preview memory/broker product is outside the first loop. |
| `server/endpoints/notifications.js` | hidden | Generic notification center is not required by the loop. |
| `server/endpoints/office.js` | hidden | Office product surface is outside the first loop. |
| `server/endpoints/openClaw.js` | hidden | External runtime operations console is outside the first loop. |
| `server/endpoints/plugins.js` | maintenance-only | Plugin runtime compatibility remains available to existing consumers. |
| `server/endpoints/runArtifacts.js` | default-visible | Workspace-scoped download path used by the FDE run monitor. |
| `server/endpoints/skillHub.js` | hidden | Skills marketplace is outside the first loop. |
| `server/endpoints/system.js` | default-visible | Login, multi-user enablement, and provider/setup discovery. |
| `server/endpoints/tierRouting.js` | hidden | General model-tier routing is not part of the frozen binding contract. |
| `server/endpoints/userBilling.js` | hidden | User billing is outside the first loop. |
| `server/endpoints/utils.js` | default-visible | Model/provider lookup needed by configuration views. |
| `server/endpoints/visualProduction.js` | hidden | Visual generation is outside the first loop. |
| `server/endpoints/workAgent.js` | hidden | Existing autonomous work-agent remains compatible; it is not FDE orchestration. |
| `server/endpoints/workflowConfirmation.js` | hidden | Legacy workflow confirmation is not Prisma FDE approval authority. |
| `server/endpoints/workspaceAITeam.js` | hidden | Team orchestration is outside the first loop. |
| `server/endpoints/workspaceAnalysisFiles.js` | hidden | Optional analysis-file context is not the `workspace_kb` binding path. |
| `server/endpoints/workspaceArtifacts.js` | hidden | Generic workspace artifacts remain compatible; FDE uses run artifacts. |
| `server/endpoints/workspaceGraph.js` | hidden | Knowledge-graph UI/API is not required by workspace-scoped vector retrieval. |
| `server/endpoints/workspaceImages.js` | hidden | Image assets are outside the text/JSON v1 contract. |
| `server/endpoints/workspaceScheduledTasks.js` | hidden | Scheduling is outside the manual-trigger-only v1 contract. |
| `server/endpoints/workspaceThreads.js` | hidden | General chat threads are outside the FDE authoring session model. |
| `server/endpoints/workspaces.js` | default-visible | Workspace creation, configuration, membership-aware access, and KB attachment. |
| `server/endpoints/workspacesParsedFiles.js` | default-visible | Parsed-document staging required by KB ingestion. |

## Frontend page entries (19/19)

| Entry | Classification | Evidence / reason |
| --- | --- | --- |
| `frontend/src/pages/404.jsx` | maintenance-only | Route fallback, never a product navigation item. |
| `frontend/src/pages/Admin` | default-visible | Users, workspaces, and model/vector/embedder configuration. |
| `frontend/src/pages/AssistantLibrary` | hidden | Marketplace outside the first loop. |
| `frontend/src/pages/Docs` | hidden | General documentation browser is not the workflow entry. |
| `frontend/src/pages/DocumentManager` | default-visible | Uploads the synthetic/approved workspace KB. |
| `frontend/src/pages/FdeWorkflows` | default-visible | Seven-view sellable loop and its describe/clarify entry point. |
| `frontend/src/pages/GeneralSettings` | default-visible | Required instance/provider configuration routes live here. |
| `frontend/src/pages/Invite` | hidden | Demo uses explicit admin provisioning for approval separation. |
| `frontend/src/pages/Login` | default-visible | Two-account workflow requires authenticated profile switching. |
| `frontend/src/pages/Main` | default-visible | Authenticated application/workspace shell. |
| `frontend/src/pages/Office` | hidden | Separate product surface. |
| `frontend/src/pages/OnboardingFlow` | default-visible | Initial model, vector, embedding, and workspace configuration. |
| `frontend/src/pages/OpenClaw` | hidden | Runtime operations surface outside the loop. |
| `frontend/src/pages/SkillHub` | hidden | Skills marketplace outside the loop. |
| `frontend/src/pages/VisualProduction` | hidden | Image generation outside the text/JSON v1 contract. |
| `frontend/src/pages/WorkspaceAITeam` | hidden | Team orchestration is not Studio graph execution. |
| `frontend/src/pages/WorkspaceChat` | hidden | Direct routes remain compatible; focused workspace navigation enters FDE. |
| `frontend/src/pages/WorkspaceGraph` | hidden | Not required by workspace-scoped retrieval. |
| `frontend/src/pages/WorkspaceSettings` | default-visible | Workspace model, KB, and membership configuration. |

## C3 decision rule

At C3 the product owner reviews this table with customer-demo feedback and any
new route telemetry. Only then may a `deletion-candidate` move to removal; until
that explicit decision, every hidden and candidate route remains tested and
reachable by its direct URL or API contract.
