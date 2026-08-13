const crypto = require("crypto");

function normalizeEvolution(existingEvolution) {
  if (!existingEvolution || typeof existingEvolution !== "object") {
    return { version: 1, entries: [] };
  }

  if (Array.isArray(existingEvolution.entries)) {
    return {
      version: existingEvolution.version || 1,
      entries: existingEvolution.entries,
    };
  }

  // Backward/alternate: allow plain array as evolution content.
  if (Array.isArray(existingEvolution)) {
    return { version: 1, entries: existingEvolution };
  }

  return { version: existingEvolution.version || 1, entries: [] };
}

function stableEntryId(entry) {
  const title = String(entry?.title || "").trim();
  const content = String(entry?.content || "").trim();
  const base = `${title}\n${content}`;
  return crypto
    .createHash("sha256")
    .update(base, "utf8")
    .digest("hex")
    .slice(0, 12);
}

/**
 * Merge a new evolution entry into an evolution object.
 * @param {Object|Array|null} existingEvolution
 * @param {Object} newEntry
 * @returns {{version: number, entries: Object[]}}
 */
function mergeEvolution(existingEvolution, newEntry) {
  const normalized = normalizeEvolution(existingEvolution);
  const entry = { ...(newEntry || {}) };

  entry.title = String(entry.title || "").trim();
  entry.content = String(entry.content || "").trim();
  if (!entry.title && !entry.content) return normalized;

  entry.createdAt = entry.createdAt || new Date().toISOString();
  entry.id = entry.id || stableEntryId(entry);

  const exists = normalized.entries.some((e) => {
    if (!e) return false;
    const sameId = e.id && e.id === entry.id;
    const samePayload =
      String(e.title || "").trim() === entry.title &&
      String(e.content || "").trim() === entry.content;
    return sameId || samePayload;
  });

  if (exists) return normalized;

  return {
    ...normalized,
    entries: [...normalized.entries, entry],
  };
}

module.exports = { mergeEvolution };
