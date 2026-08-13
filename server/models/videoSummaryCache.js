"use strict";

const prisma = require("../utils/prisma");

const VIDEO_SUMMARY_CACHE_BELONGS_TO = "video_understanding";
const VIDEO_SUMMARY_CACHE_NAME_PREFIX = "video_summary:";
const DEFAULT_VIDEO_SUMMARY_CACHE_LIMIT = 100;
const DEFAULT_VIDEO_SUMMARY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let lastCacheTouchMs = 0;

function positiveIntegerFromEnv(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cacheNameForHash(sha256) {
  return `${VIDEO_SUMMARY_CACHE_NAME_PREFIX}${sha256}`;
}

function nextCacheTouchDate() {
  const next = Math.max(Date.now(), lastCacheTouchMs + 1);
  lastCacheTouchMs = next;
  return new Date(next);
}

function createVideoSummaryCache({
  prismaClient = prisma,
  maxEntries = positiveIntegerFromEnv(
    process.env.VIDEO_UNDERSTANDING_CACHE_LIMIT,
    DEFAULT_VIDEO_SUMMARY_CACHE_LIMIT
  ),
  ttlMs = positiveIntegerFromEnv(
    process.env.VIDEO_UNDERSTANDING_CACHE_TTL_MS,
    DEFAULT_VIDEO_SUMMARY_CACHE_TTL_MS
  ),
} = {}) {
  const table = prismaClient.cache_data;

  async function get(sha256) {
    const row = await table.findFirst({
      where: {
        name: cacheNameForHash(sha256),
        belongsTo: VIDEO_SUMMARY_CACHE_BELONGS_TO,
      },
    });
    if (!row) return null;

    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      await table.deleteMany({ where: { id: row.id } });
      return null;
    }

    try {
      const parsed = JSON.parse(row.data);
      if (typeof table.update === "function") {
        await table.update({
          where: { id: row.id },
          data: { lastUpdatedAt: nextCacheTouchDate() },
        });
      }
      return parsed;
    } catch {
      await table.deleteMany({ where: { id: row.id } });
      return null;
    }
  }

  async function set(sha256, summary) {
    const now = nextCacheTouchDate();
    await table.deleteMany({
      where: {
        name: cacheNameForHash(sha256),
        belongsTo: VIDEO_SUMMARY_CACHE_BELONGS_TO,
      },
    });
    await table.create({
      data: {
        name: cacheNameForHash(sha256),
        data: JSON.stringify(summary),
        belongsTo: VIDEO_SUMMARY_CACHE_BELONGS_TO,
        expiresAt: ttlMs > 0 ? new Date(now.getTime() + ttlMs) : null,
        createdAt: now,
        lastUpdatedAt: now,
      },
    });
    await prune();
  }

  async function prune() {
    const rows = await table.findMany({
      where: { belongsTo: VIDEO_SUMMARY_CACHE_BELONGS_TO },
      orderBy: { lastUpdatedAt: "desc" },
    });
    const now = Date.now();
    const expiredIds = [];
    const activeRows = [];

    for (const row of rows) {
      if (row.expiresAt && row.expiresAt.getTime() <= now) {
        expiredIds.push(row.id);
      } else {
        activeRows.push(row);
      }
    }

    const overLimitIds = activeRows.slice(maxEntries).map((row) => row.id);
    const idsToDelete = [...expiredIds, ...overLimitIds];
    if (!idsToDelete.length) return;

    await table.deleteMany({
      where: { id: { in: idsToDelete } },
    });
  }

  async function clear() {
    await table.deleteMany({
      where: { belongsTo: VIDEO_SUMMARY_CACHE_BELONGS_TO },
    });
  }

  return { get, set, prune, clear };
}

module.exports = {
  VIDEO_SUMMARY_CACHE_BELONGS_TO,
  createVideoSummaryCache,
};
