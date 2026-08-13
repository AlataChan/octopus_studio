const { withTimeout } = require("../graphBuilder/featureFlags");
const { KbClient } = require("./KbClient");
const { isPinned, scoreCandidate } = require("./memoryScore");

const DEFAULT_KB_BUDGET = 1500;
const DEFAULT_KB_TIMEOUT_MS = 1500;
const SOURCE_PRIORITY = Object.freeze({
  kb: 3,
  graph: 2,
  vector: 1,
});

function defaultTokenizer(text) {
  return Math.ceil(String(text || "").length / 4);
}

function sourcePath(source = {}) {
  return (
    source.path ||
    source.docpath ||
    source.filepath ||
    source.chunkSource ||
    source.url ||
    source.title ||
    null
  );
}

function normalizePath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .toLowerCase();
}

function entryKey(entry) {
  return normalizePath(entry.path || sourcePath(entry.source) || entry.title);
}

function asVectorEntries(contextTexts = [], sources = []) {
  return contextTexts
    .map((text, index) => {
      const source = sources[index] || null;
      if (source?.type === "graph") {
        return {
          kind: "graph",
          text,
          source,
          path: "graph-summary",
          order: index,
        };
      }
      return {
        kind: "vector",
        text,
        source,
        path: sourcePath(source || {}),
        order: index,
      };
    });
}

function asKbEntries(kbItems = []) {
  return kbItems
    .filter((item) => item?.text)
    .map((item, index) => ({
      kind: "kb",
      text: item.text,
      path: item.path || item.title || `kb:${index}`,
      title: item.title || item.path || `KB ${index + 1}`,
      reason: item.reason || "kb",
      memoryKind: item.kind || null,
      created: item.created || null,
      tokenEstimate: item.tokenEstimate,
      order: index,
    }));
}

function asGraphEntry(graphSummary, sources = []) {
  if (!graphSummary) return [];
  const existingIndex = sources.findIndex((source) => source?.type === "graph");
  return [
    {
      kind: "graph",
      text: graphSummary,
      source:
        existingIndex >= 0
          ? sources[existingIndex]
          : { title: "知识图谱", type: "graph" },
      path: "graph-summary",
      order: existingIndex >= 0 ? existingIndex : sources.length,
    },
  ];
}

function buildSource(entry) {
  if (entry.kind === "kb") {
    return {
      text: entry.text.slice(0, 1_000),
      title: entry.title,
      type: "kb",
      path: entry.path,
      reason: entry.reason,
      metadata: {
        source: "kb",
        tokenEstimate: entry.tokenEstimate || null,
        kind: entry.memoryKind || null,
        created: entry.created || null,
      },
    };
  }
  return entry.source || {
    text: String(entry.text || "").slice(0, 1_000),
    title: entry.kind === "graph" ? "知识图谱" : entry.path || "Context",
    type: entry.kind,
  };
}

function sortEntries(entries, { now = new Date(), halfLifeDays = 7 } = {}) {
  return [...entries].sort((a, b) => {
    const aPinned = isPinned(a.memoryKind);
    const bPinned = isPinned(b.memoryKind);
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    const aScore = scoreCandidate(
      {
        sourcePriority: SOURCE_PRIORITY[a.kind] || 1,
        kind: a.memoryKind,
        created: a.created,
      },
      { now, halfLifeDays }
    );
    const bScore = scoreCandidate(
      {
        sourcePriority: SOURCE_PRIORITY[b.kind] || 1,
        kind: b.memoryKind,
        created: b.created,
      },
      { now, halfLifeDays }
    );
    if (aScore !== bScore) {
      return bScore - aScore;
    }
    if (a.kind === "kb") return normalizePath(a.path).localeCompare(normalizePath(b.path));
    return a.order - b.order;
  });
}

function mergeKbEvidence({
  contextTexts = [],
  sources = [],
  graphSummary = null,
  kbItems = [],
  budget = DEFAULT_KB_BUDGET,
  tokenizer = defaultTokenizer,
  now = new Date(),
  halfLifeDays = 7,
} = {}) {
  if (!Array.isArray(kbItems) || kbItems.length === 0) {
    return {
      contextTexts,
      sources,
      metadata: {
        status: "empty_result",
        itemCount: 0,
        sourceCount: sources.length,
      },
    };
  }

  const deduped = new Map();
  const entries = sortEntries([
    ...asKbEntries(kbItems),
    ...asGraphEntry(graphSummary, sources),
    ...asVectorEntries(contextTexts, sources),
  ], { now, halfLifeDays });

  for (const entry of entries) {
    const key = entryKey(entry);
    if (!key) continue;
    if (!deduped.has(key)) deduped.set(key, entry);
  }

  const nextContextTexts = [];
  const nextSources = [];
  let usedTokens = 0;
  const rejections = [];

  for (const entry of deduped.values()) {
    const tokenCount = Number(entry.tokenEstimate) || tokenizer(entry.text);
    if (budget > 0 && usedTokens + tokenCount > budget) {
      rejections.push({
        path: entry.path || entryKey(entry),
        reason: "budget_exceeded",
        tokenEstimate: tokenCount,
      });
      continue;
    }
    nextContextTexts.push(entry.text);
    nextSources.push(buildSource(entry));
    usedTokens += tokenCount;
  }

  const metadata = {
    status: "merged",
    itemCount: kbItems.length,
    sourceCount: nextSources.length,
  };
  if (rejections.length) metadata.rejections = rejections;

  return {
    contextTexts: nextContextTexts,
    sources: nextSources,
    metadata,
  };
}

function recordOctopusKbRetrievalMetric(status, details = {}) {
  if (status === "disabled") return;
  const payload = {
    status,
    workspace: details.workspaceSlug || null,
    itemCount: details.itemCount || 0,
  };
  if (status === "merged") {
    console.info("[OctopusKB] retrieval_merged", payload);
  } else {
    console.warn(`[OctopusKB] retrieval_${status}`, payload);
  }
}

async function applyOctopusKbRetrieval({
  workspace,
  query,
  contextTexts = [],
  sources = [],
  graphSummary = null,
  budget = DEFAULT_KB_BUDGET,
  tokenizer = defaultTokenizer,
  timeoutMs = DEFAULT_KB_TIMEOUT_MS,
  kbClient = new KbClient(),
} = {}) {
  const fallback = (status, extra = {}) => {
    const metadata = {
      status,
      itemCount: 0,
      sourceCount: sources.length,
      ...extra,
    };
    recordOctopusKbRetrievalMetric(status, {
      workspaceSlug: workspace?.slug,
      itemCount: metadata.itemCount,
    });
    return { contextTexts, sources, metadata };
  };

  let enabled = false;
  try {
    enabled = await kbClient.enabled();
  } catch (error) {
    return fallback("error", { error: error.message });
  }
  if (!enabled) return fallback("disabled");

  if (typeof kbClient.isCircuitOpen === "function" && kbClient.isCircuitOpen()) {
    return fallback("circuit_open");
  }

  let kbItems;
  try {
    kbItems = await withTimeout(
      kbClient.retrieveBundle(workspace?.slug, query, budget),
      timeoutMs,
      "octopus-kb retrieveBundle"
    );
  } catch (error) {
    const status = /timed out/i.test(error.message) ? "timeout" : "error";
    return fallback(status, { error: error.message });
  }

  if (!Array.isArray(kbItems) || kbItems.length === 0) {
    return fallback("empty_result");
  }

  const result = mergeKbEvidence({
    contextTexts,
    sources,
    graphSummary,
    kbItems,
    budget,
    tokenizer,
  });
  recordOctopusKbRetrievalMetric(result.metadata.status, {
    workspaceSlug: workspace?.slug,
    itemCount: result.metadata.itemCount,
  });
  return result;
}

module.exports = {
  DEFAULT_KB_BUDGET,
  DEFAULT_KB_TIMEOUT_MS,
  applyOctopusKbRetrieval,
  mergeKbEvidence,
};
