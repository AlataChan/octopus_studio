const { KbClient } = require("./KbClient");
const { isOctopusKbMemoryEnabled } = require("./settings");
const { scrubSensitiveText } = require("./scrub");

function safePathSegment(value, fallback = "item") {
  const cleaned = String(value ?? fallback)
    .trim()
    .replace(/[:/\\\s]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
  return cleaned || fallback;
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .flat()
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );
}

function isRedactedOnly(value) {
  return /^\[(REDACTED_EMAIL|REDACTED_SECRET)\]$/.test(String(value || "").trim());
}

function scrubRelatedEntities(values = [], scrub = scrubSensitiveText) {
  return uniqueStrings(values)
    .map((value) => scrub(value).trim())
    .filter((value) => value && !isRedactedOnly(value));
}

function summaryText(anchored = {}) {
  return (
    anchored.summary_text ||
    anchored.summary ||
    anchored.session_intent ||
    "Consolidated conversation memory"
  );
}

function formatSection(title, values) {
  const list = uniqueStrings(values);
  if (!list.length) return "";
  return `\n## ${title}\n${list.map((item) => `- ${item}`).join("\n")}\n`;
}

function buildMemoryBody({ anchored = {}, summaryUpdatedAt }) {
  return [
    "# Consolidated Memory",
    "",
    `Created: ${summaryUpdatedAt}`,
    "",
    "## Summary",
    summaryText(anchored),
    anchored.session_intent ? `\n## Session Intent\n${anchored.session_intent}\n` : "",
    formatSection("Key Decisions", anchored.key_decisions),
    formatSection("Pending Tasks", anchored.pending_tasks),
    formatSection("Artifacts", anchored.artifacts),
  ]
    .filter(Boolean)
    .join("\n");
}

async function writeConsolidatedMemory({
  slug,
  threadId,
  anchored,
  summaryUpdatedAt,
  kbClient = new KbClient(),
  scrub = scrubSensitiveText,
  env = process.env,
  SystemSettingsModel,
} = {}) {
  try {
    if (!slug || !threadId || !anchored) return null;
    const enabled = await isOctopusKbMemoryEnabled({
      env,
      SystemSettingsModel,
    });
    if (!enabled) return null;

    if (kbClient.healthcheck && !(await kbClient.healthcheck(slug))) return null;

    const created = summaryUpdatedAt || new Date().toISOString();
    const safeSlug = safePathSegment(slug, "workspace");
    const safeThreadId = safePathSegment(threadId, "thread");
    const safeCreated = safePathSegment(created, "summary");
    const path = `wiki/memory/${safeSlug}/${safeThreadId}/${safeCreated}.md`;
    const relatedEntities = scrubRelatedEntities([
      anchored.related_entities,
      anchored.main_topics,
    ], scrub);
    const scrubbedSummary = scrub(summaryText(anchored));
    const body = scrub(buildMemoryBody({ anchored, summaryUpdatedAt: created }));
    const page = {
      path,
      type: "note",
      role: "note",
      layer: "wiki",
      frontmatter: {
        title: `Memory ${safeSlug}/${safeThreadId}`,
        lang: "en",
        kind: "summary",
        created,
        summary: scrubbedSummary,
        related_entities: relatedEntities,
      },
      body,
    };

    const result = await kbClient.writePage(slug, page);
    if (!result) return null;
    return { ...result, path, page };
  } catch (error) {
    console.warn("[octopus-kb] memory write skipped:", error.message);
    return null;
  }
}

module.exports = {
  buildMemoryBody,
  safePathSegment,
  scrubRelatedEntities,
  writeConsolidatedMemory,
};
