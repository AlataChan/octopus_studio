"use strict";

const {
  deriveCursor,
  normalizeRecord,
} = require("./orchestrationRunState");

const KEY_RE = /^[A-Za-z0-9:_-]{1,64}$/;
const LIMITS = Object.freeze({
  PER_KEY_BYTES: 8 * 1024,
  TOTAL_BYTES: 64 * 1024,
});
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isForbiddenKey(key) {
  return (
    RESERVED_KEYS.has(key) ||
    Object.prototype.hasOwnProperty.call(Object.prototype, key)
  );
}

function sanitizeEntries(rawObj) {
  const out = Object.create(null);
  if (!rawObj || typeof rawObj !== "object" || Array.isArray(rawObj)) {
    return out;
  }

  let total = 0;
  for (const key of Object.keys(rawObj)) {
    if (!KEY_RE.test(key) || isForbiddenKey(key)) continue;
    const value = rawObj[key];
    if (typeof value !== "string") continue;
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes > LIMITS.PER_KEY_BYTES) continue;
    if (total + bytes > LIMITS.TOTAL_BYTES) continue;
    total += bytes;
    out[key] = value;
  }
  return out;
}

function toPlainObject(nullProtoObj) {
  return Object.assign({}, nullProtoObj || {});
}

function snapshotContext(runMetadata) {
  return sanitizeEntries(runMetadata?.sharedContext || {});
}

function mergeDeltas(snapshot, deltas = []) {
  const merged = sanitizeEntries(snapshot || {});
  const sorted = [...(deltas || [])].sort((a, b) => {
    const ai = Number.isFinite(Number(a?.index)) ? Number(a.index) : 0;
    const bi = Number.isFinite(Number(b?.index)) ? Number(b.index) : 0;
    return ai - bi;
  });

  for (const item of sorted) {
    const delta = sanitizeEntries(item?.delta || item || {});
    for (const key of Object.keys(delta)) merged[key] = delta[key];
  }
  return merged;
}

function applyStepUpdates(stepStates = [], stepUpdates = []) {
  const next = stepStates.map((state) => ({ ...state }));
  for (const update of stepUpdates || []) {
    if (!Number.isInteger(update?.index) || !next[update.index]) continue;
    next[update.index] = {
      ...next[update.index],
      ...(update.patch || {}),
    };
  }
  return next;
}

async function commitStep({
  runStore,
  runId,
  expectedStateVersion = null,
  stepUpdates = [],
  contextDeltas = [],
  costDelta = 0,
  reviewCountDelta = 0,
  maxRetries = 5,
}) {
  if (!runStore?.get || !runStore?.casUpdate) {
    throw new Error("runStore with get and casUpdate is required");
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const record = normalizeRecord(await runStore.get(runId));
    if (
      attempt === 0 &&
      expectedStateVersion !== null &&
      expectedStateVersion !== record.stateVersion
    ) {
      return { ok: false, conflict: true };
    }

    const stepStates = applyStepUpdates(
      record.metadata.stepStates || [],
      stepUpdates
    );
    const sharedContext = toPlainObject(
      mergeDeltas(snapshotContext(record.metadata), contextDeltas)
    );
    const next = {
      ...record.metadata,
      stepStates,
      sharedContext,
      cumulativeCost:
        Number(record.metadata.cumulativeCost || 0) + Number(costDelta || 0),
      reviewCount:
        Number(record.metadata.reviewCount || 0) +
        Number(reviewCountDelta || 0),
    };
    next.cursor = deriveCursor(stepStates);

    const result = await runStore.casUpdate(runId, record.stateVersion, next);
    if (result?.ok) return { ok: true, stateVersion: result.stateVersion };
    expectedStateVersion = null;
  }

  return { ok: false, conflict: true };
}

module.exports = {
  KEY_RE,
  LIMITS,
  sanitizeEntries,
  snapshotContext,
  mergeDeltas,
  commitStep,
  toPlainObject,
};
