const { estimateTokens } = require("./observationMasking");

function contentOf(m) {
  return typeof m.content === "string" ? m.content : JSON.stringify(m.content);
}

function totalTokens(messages) {
  return messages.reduce((sum, m) => sum + estimateTokens(contentOf(m)), 0);
}

function summarizeTurns(messages) {
  const points = [];
  for (let i = 0; i < messages.length; i += 2) {
    const u = messages[i];
    const a = messages[i + 1];
    if (u) points.push(`- 用户: ${contentOf(u).slice(0, 100)}`);
    if (a) points.push(`  助手: ${contentOf(a).slice(0, 150)}`);
  }
  return `[历史摘要]\n${points.join("\n")}`;
}

function capToTokens(text, maxTokens) {
  if (maxTokens <= 0) return "";
  let maxChars = maxTokens * 4;
  let out = text;
  while (estimateTokens(out) > maxTokens && out.length > 0) {
    maxChars = Math.max(1, Math.floor(maxChars * 0.8));
    out = text.slice(0, maxChars);
  }
  return out;
}

function compactHistory(
  messages,
  { budgetTokens, keepRecentTurns = 4, summaryBudgetRatio = 0.4 } = {}
) {
  const tokensBefore = totalTokens(messages);
  if (!budgetTokens || tokensBefore <= budgetTokens) {
    return {
      messages,
      compacted: false,
      tokensBefore,
      tokensAfter: tokensBefore,
    };
  }

  let k = Math.max(1, keepRecentTurns);
  while (k > 1) {
    const rt = totalTokens(messages.slice(-k * 2));
    if (rt <= budgetTokens * (1 - summaryBudgetRatio)) break;
    k -= 1;
  }
  const recent = messages.slice(-k * 2);
  const older = messages.slice(0, Math.max(0, messages.length - k * 2));
  const recentTokens = totalTokens(recent);

  if (recentTokens > budgetTokens) {
    const lastMsg = messages[messages.length - 1];
    const capped = {
      ...lastMsg,
      content: capToTokens(contentOf(lastMsg), budgetTokens),
      _compactionTruncated: true,
    };
    return {
      messages: [capped],
      compacted: true,
      tokensBefore,
      tokensAfter: totalTokens([capped]),
    };
  }

  const summaryTokenBudget = Math.max(0, budgetTokens - recentTokens);
  const summaryText = capToTokens(summarizeTurns(older), summaryTokenBudget);

  const summaryMessage = {
    from: "user",
    to: "workspace",
    content: summaryText || "[历史摘要]\n（早期对话已省略）",
    state: "success",
    _compactionSummary: true,
  };
  const compactedMessages =
    summaryText === "" ? recent : [summaryMessage, ...recent];

  return {
    messages: compactedMessages,
    compacted: true,
    tokensBefore,
    tokensAfter: totalTokens(compactedMessages),
  };
}

module.exports = { totalTokens, summarizeTurns, capToTokens, compactHistory };
