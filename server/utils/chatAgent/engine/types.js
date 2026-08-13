/**
 * Stable boundary for a conversational agent engine. Engine policy chooses
 * the implementation once, when a session is created; callers must persist
 * that choice and supply it as the pinned engine on every later turn.
 *
 * @typedef {Object} ChatAgentEngine
 * @property {(input: StartChatSessionInput) => Promise<{sessionId: string}>} startSession
 * @property {(sessionId: string, input: SubmitChatMessageInput) => AsyncIterable<ChatAgentEvent>} submitMessage
 * @property {(sessionId: string, input: ChatApprovalInput) => Promise<Object>} approve
 * @property {(sessionId: string) => Promise<Object|null>} getSession
 * @property {(sessionId: string) => Promise<Object>} cancel
 */

/**
 * @typedef {Object} StartChatSessionInput
 * @property {{userId?: number|null, role?: string|null}} authCtx
 * @property {{id: number, slug: string}} workspace
 * @property {{id?: number|null, slug: string}} thread
 * @property {Object} providerRoute
 * @property {Object} policy
 * @property {"aibitat"|"mastra"} engine
 */

/**
 * @typedef {Object} SubmitChatMessageInput
 * @property {string} message
 * @property {Array<Object>} [attachments]
 */

/**
 * @typedef {Object} ChatApprovalInput
 * @property {string} approvalId
 * @property {"approve"|"deny"} decision
 * @property {string} [note]
 */

/**
 * @typedef {Object} ChatAgentEvent
 * @property {string} type
 * @property {Object} payload
 */

const CHAT_AGENT_EVENT_TYPES = Object.freeze({
  STATUS: "status",
  TEXT_DELTA: "text.delta",
  THINKING: "thinking",
  TOOL_CALL: "tool.call",
  TOOL_RESULT: "tool.result",
  APPROVAL_REQUESTED: "approval.requested",
  APPROVAL_RESOLVED: "approval.resolved",
  COMPLETED: "completed",
  FAILED: "failed",
});

module.exports = { CHAT_AGENT_EVENT_TYPES };
