"use strict";

const { createVideoSummaryCache } = require("../../models/videoSummaryCache");

function makePrismaCacheData() {
  let rows = [];
  let nextId = 1;

  const matches = (row, where = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && Array.isArray(value.in)) {
        return value.in.includes(row[key]);
      }
      return row[key] === value;
    });

  return {
    rows: () => rows,
    cache_data: {
      findFirst: jest.fn(
        async ({ where }) => rows.find((row) => matches(row, where)) || null
      ),
      deleteMany: jest.fn(async ({ where }) => {
        const before = rows.length;
        rows = rows.filter((row) => !matches(row, where));
        return { count: before - rows.length };
      }),
      create: jest.fn(async ({ data }) => {
        const row = {
          id: nextId++,
          createdAt: new Date(),
          lastUpdatedAt: new Date(),
          ...data,
        };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error("missing row");
        Object.assign(row, data);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy }) => {
        const result = rows.filter((row) => matches(row, where));
        if (orderBy?.lastUpdatedAt === "desc") {
          result.sort(
            (a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime()
          );
        }
        return result;
      }),
    },
  };
}

describe("VideoSummaryCache", () => {
  const summary = {
    transcript: "persistent transcript",
    sceneTimeline: [{ tStart: 0, tEnd: 1, description: "Opening frame" }],
    keyObservations: ["A title card appears"],
    meta: { provider: "moonshot", sourceRef: "ms://file_123" },
  };

  test("persists summaries across cache instances", async () => {
    const prisma = makePrismaCacheData();
    const first = createVideoSummaryCache({
      prismaClient: prisma,
      maxEntries: 10,
    });
    const second = createVideoSummaryCache({
      prismaClient: prisma,
      maxEntries: 10,
    });

    await first.set("video-sha", summary);

    await expect(second.get("video-sha")).resolves.toEqual(summary);
  });

  test("evicts least recently used summaries over the configured limit", async () => {
    const prisma = makePrismaCacheData();
    const cache = createVideoSummaryCache({
      prismaClient: prisma,
      maxEntries: 2,
    });

    await cache.set("one", { ...summary, transcript: "one" });
    await cache.set("two", { ...summary, transcript: "two" });
    await cache.get("one");
    await cache.set("three", { ...summary, transcript: "three" });

    await expect(cache.get("one")).resolves.toMatchObject({
      transcript: "one",
    });
    await expect(cache.get("two")).resolves.toBeNull();
    await expect(cache.get("three")).resolves.toMatchObject({
      transcript: "three",
    });
  });
});
