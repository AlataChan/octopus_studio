const { compactHistory } = require("./aibitat/contextCompaction");
const { withSpan } = require("../observability/otel");

function isEnabled(env) {
  return String(env.CONTEXT_COMPACTION_ENABLED || "").toLowerCase() === "true";
}

function sourceWindowLimit(env, defaultLimit) {
  if (!isEnabled(env)) return defaultLimit;
  const raw = Number(env.CONTEXT_COMPACTION_SOURCE_WINDOW);
  const win = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
  return Math.max(defaultLimit, Math.min(500, win));
}

function posInt(raw, fallback) {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

function resolveCompactionConfig(env) {
  return {
    budgetTokens: posInt(env.CONTEXT_COMPACTION_BUDGET_TOKENS, 8000),
    keepRecentTurns: posInt(env.CONTEXT_COMPACTION_KEEP_RECENT_TURNS, 4),
  };
}

async function applyHistoryCompaction(history, env = process.env) {
  if (!isEnabled(env)) return history;
  if (!Array.isArray(history) || history.length === 0) return history;
  const { budgetTokens, keepRecentTurns } = resolveCompactionConfig(env);
  const result = compactHistory(history, { budgetTokens, keepRecentTurns });
  return withSpan(
    "context.compaction",
    {
      "compaction.triggered": result.compacted,
      "compaction.tokens_before": result.tokensBefore,
      "compaction.tokens_after": result.tokensAfter,
      "compaction.messages_before": history.length,
      "compaction.messages_after": result.messages.length,
    },
    async () => result.messages
  );
}

module.exports = {
  applyHistoryCompaction,
  resolveCompactionConfig,
  sourceWindowLimit,
};
