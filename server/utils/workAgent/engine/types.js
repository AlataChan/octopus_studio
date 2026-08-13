/**
 * WorkAgentEngine is the stable boundary between Alata and any autonomous
 * work engine implementation.
 *
 * @typedef {Object} WorkAgentEngine
 * @property {(input: SubmitGoalInput) => Promise<{runId: string}>} submitGoal
 * @property {(runId: string) => AsyncIterable<WorkEvent>} streamEvents
 * @property {(runId: string, input: ApprovalInput) => Promise<Object>} approve
 * @property {(runId: string) => Promise<Object|null>} getRun
 * @property {(runId: string) => Promise<Object[]>} getArtifacts
 * @property {(runId: string) => Promise<Object>} cancel
 * @property {(runId: string) => Promise<Object>} recover
 */

/**
 * @typedef {Object} SubmitGoalInput
 * @property {string} goal
 * @property {{userId?: number|null, role?: string|null}} authCtx
 * @property {{id: number, slug?: string, name?: string}} workspace
 * @property {{slug: string, id?: number|string|null}} thread
 * @property {string|null} workspaceRoot
 * @property {Object} policy
 * @property {Object} providerRoute
 * @property {"mastra"} engine
 */

/**
 * WorkEvent payload contract for UI rendering and replay.
 *
 * Common fields:
 * - runId: Live Canvas run id.
 * - seq: monotonically increasing per run.
 * - type: one of the event type strings below.
 * - payload: JSON object specific to the type.
 * - createdAt: event timestamp.
 *
 * Event types and payloads:
 * - status: { status, message?, engine? }
 * - step.started: { stepId, title, engine? }
 * - step.completed: { stepId, title?, output? }
 * - tool.call: { toolName, redacted args/summary, title? }
 * - tool.result: { toolName, result?, stdout?, stderr?, exitCode?, timedOut?, truncated? }
 * - thinking: { text }
 * - approval.requested: { approvalId, title, riskLevel, details }
 * - approval.resolved: { approvalId, decision, note? }
 * - artifact.created: { artifactId, artifactType, label, storageRef, metadata? }
 * - cost.updated: { provider, model, inputTokens?, outputTokens?, totalTokens?, costUsd?, pricingSource? }
 */

const WORK_EVENT_TYPES = Object.freeze({
  STATUS: "status",
  STEP_STARTED: "step.started",
  STEP_COMPLETED: "step.completed",
  TOOL_CALL: "tool.call",
  TOOL_RESULT: "tool.result",
  THINKING: "thinking",
  APPROVAL_REQUESTED: "approval.requested",
  APPROVAL_RESOLVED: "approval.resolved",
  ARTIFACT_CREATED: "artifact.created",
  COST_UPDATED: "cost.updated",
});

module.exports = { WORK_EVENT_TYPES };
