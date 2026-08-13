const CHAT_ENGINES = Object.freeze({
  AIBITAT: "aibitat",
  MASTRA: "mastra",
});

function normalizeEngine(value) {
  const engine = typeof value === "string" ? value.trim().toLowerCase() : "";
  return Object.values(CHAT_ENGINES).includes(engine) ? engine : null;
}

function isEngineSelectionVisible({ actorRole = null } = {}) {
  return actorRole === "admin";
}

/**
 * Select an engine for a chat session without mutating session state.
 *
 * A valid persisted pin always wins, including during rollback. This prevents
 * an in-flight conversation from changing protocol or losing engine-owned
 * state. Administrative overrides are accepted only for new sessions; normal
 * users cannot influence the selection even if a request contains the field.
 */
function resolveChatEngineSelection({
  pinnedEngine = null,
  requestedEngine = null,
  actorRole = null,
  flags = {},
} = {}) {
  if (pinnedEngine !== null && typeof pinnedEngine !== "undefined") {
    const pinned = normalizeEngine(pinnedEngine);
    if (!pinned) {
      throw new Error("Unsupported persisted ChatAgentEngine");
    }
    return { engine: pinned, reason: "session_pinned" };
  }

  if (
    isEngineSelectionVisible({ actorRole }) &&
    requestedEngine !== null &&
    typeof requestedEngine !== "undefined"
  ) {
    const requested = normalizeEngine(requestedEngine);
    if (!requested) {
      throw new Error("Unsupported requested ChatAgentEngine");
    }
    return { engine: requested, reason: "admin_override" };
  }

  if (flags.enableMastraChatEngine === true) {
    return { engine: CHAT_ENGINES.MASTRA, reason: "feature_flag" };
  }
  return { engine: CHAT_ENGINES.AIBITAT, reason: "rollback_default" };
}

module.exports = {
  CHAT_ENGINES,
  isEngineSelectionVisible,
  resolveChatEngineSelection,
};
