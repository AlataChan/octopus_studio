const {
  CHAT_ENGINES,
  isEngineSelectionVisible,
  resolveChatEngineSelection,
} = require("../../../utils/chatAgent/enginePolicy");

describe("ChatAgentEngine policy", () => {
  test("keeps an existing AIbitat session pinned when the Mastra flag turns on", () => {
    expect(
      resolveChatEngineSelection({
        pinnedEngine: CHAT_ENGINES.AIBITAT,
        flags: { enableMastraChatEngine: true },
      })
    ).toEqual({ engine: CHAT_ENGINES.AIBITAT, reason: "session_pinned" });
  });

  test("never switches an existing Mastra session during rollback", () => {
    expect(
      resolveChatEngineSelection({
        pinnedEngine: CHAT_ENGINES.MASTRA,
        flags: { enableMastraChatEngine: false },
      })
    ).toEqual({ engine: CHAT_ENGINES.MASTRA, reason: "session_pinned" });
  });

  test("new sessions follow the rollout flag", () => {
    expect(
      resolveChatEngineSelection({
        flags: { enableMastraChatEngine: true },
      })
    ).toEqual({ engine: CHAT_ENGINES.MASTRA, reason: "feature_flag" });
    expect(
      resolveChatEngineSelection({
        flags: { enableMastraChatEngine: false },
      })
    ).toEqual({ engine: CHAT_ENGINES.AIBITAT, reason: "rollback_default" });
  });

  test("rollback preserves the caller's session record", () => {
    const session = Object.freeze({
      slug: "existing-thread",
      metadata: JSON.stringify({ chatAgentEngine: CHAT_ENGINES.AIBITAT }),
    });

    resolveChatEngineSelection({ flags: { enableMastraChatEngine: false } });

    expect(session).toEqual({
      slug: "existing-thread",
      metadata: JSON.stringify({ chatAgentEngine: CHAT_ENGINES.AIBITAT }),
    });
  });

  test("ordinary users cannot see or override engine selection", () => {
    expect(isEngineSelectionVisible({ actorRole: "default" })).toBe(false);
    expect(
      resolveChatEngineSelection({
        requestedEngine: CHAT_ENGINES.MASTRA,
        actorRole: "default",
        flags: { enableMastraChatEngine: false },
      })
    ).toEqual({ engine: CHAT_ENGINES.AIBITAT, reason: "rollback_default" });
  });

  test("verified administrators can select the engine for a new session only", () => {
    expect(isEngineSelectionVisible({ actorRole: "admin" })).toBe(true);
    expect(
      resolveChatEngineSelection({
        requestedEngine: CHAT_ENGINES.MASTRA,
        actorRole: "admin",
        flags: { enableMastraChatEngine: false },
      })
    ).toEqual({ engine: CHAT_ENGINES.MASTRA, reason: "admin_override" });
    expect(
      resolveChatEngineSelection({
        pinnedEngine: CHAT_ENGINES.AIBITAT,
        requestedEngine: CHAT_ENGINES.MASTRA,
        actorRole: "admin",
        flags: { enableMastraChatEngine: true },
      })
    ).toEqual({ engine: CHAT_ENGINES.AIBITAT, reason: "session_pinned" });
  });

  test("fails closed on an invalid persisted engine", () => {
    expect(() =>
      resolveChatEngineSelection({ pinnedEngine: "octopus" })
    ).toThrow("Unsupported persisted ChatAgentEngine");
  });
});
