"use strict";

describe("trajectory vector adapter", () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    delete process.env.VECTOR_DB;
  });

  test("non-lance upsert is a no-op and query falls back to Prisma keyword search with one warning", async () => {
    const mockFindMany = jest.fn().mockResolvedValue([
      {
        id: "traj_1",
        scopeKey: "ws:7:system",
        planShapeJson: "{}",
        createdAt: new Date("2026-07-12T00:00:00.000Z"),
      },
    ]);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    jest.doMock("../../../helpers", () => ({
      getVectorDbClass: () => ({ name: "OtherVectorDb" }),
    }));
    jest.doMock("../../../prisma", () => ({
      agent_trajectories: {
        findMany: (...args) => mockFindMany(...args),
      },
    }));

    const adapter = require("../vectorAdapter");

    await expect(
      adapter.upsert("traj-ws-7-u-0", {
        id: "traj_1",
        vector: [0.1],
        scopeKey: "ws:7:system",
      })
    ).resolves.toBe(false);
    const rows = await adapter.query("traj-ws-7-u-0", [0.1], 3, {
      scopeKey: "ws:7:system",
      canonicalGoal: "refund printer order",
      since: new Date("2026-06-12T00:00:00.000Z"),
    });
    await adapter.query("traj-ws-7-u-0", [0.1], 3, {
      scopeKey: "ws:7:system",
      canonicalGoal: "refund printer order",
      since: new Date("2026-06-12T00:00:00.000Z"),
    });

    expect(rows).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scopeKey: "ws:7:system",
          createdAt: { gte: new Date("2026-06-12T00:00:00.000Z") },
        }),
        take: 3,
      })
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test("lance path writes direct vectors, isolates namespaces, deletes ids, and drops namespaces", async () => {
    process.env.VECTOR_DB = "lancedb";
    const tables = new Map();

    function tableFor(namespace) {
      if (!tables.has(namespace)) {
        tables.set(namespace, []);
      }
      const rows = tables.get(namespace);
      return {
        add: jest.fn(async (newRows) => rows.push(...newRows)),
        vectorSearch: jest.fn(() => ({
          distanceType: jest.fn(() => ({
            limit: jest.fn(() => ({
              toArray: jest.fn(async () =>
                rows.map((row) => ({ ...row, _distance: 0.01 }))
              ),
            })),
          })),
        })),
        delete: jest.fn(async (expr) => {
          const ids = Array.from(expr.matchAll(/'([^']+)'/g)).map((m) => m[1]);
          for (const id of ids) {
            const idx = rows.findIndex((row) => row.id === id);
            if (idx >= 0) rows.splice(idx, 1);
          }
        }),
      };
    }

    const client = {
      tableNames: jest.fn(async () => Array.from(tables.keys())),
      openTable: jest.fn(async (namespace) => tableFor(namespace)),
      createTable: jest.fn(async (namespace, data) => {
        tables.set(namespace, [...data]);
        return tableFor(namespace);
      }),
      dropTable: jest.fn(async (namespace) => {
        tables.delete(namespace);
      }),
    };

    const LanceDb = {
      name: "LanceDb",
      connect: jest.fn(async () => ({ client })),
      namespaceExists: jest.fn(async (_client, namespace) =>
        tables.has(namespace)
      ),
      updateOrCreateCollection: jest.fn(async (_client, data, namespace) => {
        if (!tables.has(namespace)) tables.set(namespace, [...data]);
        else tables.get(namespace).push(...data);
        return true;
      }),
      deleteVectorsInNamespace: jest.fn(async (_client, namespace) => {
        tables.delete(namespace);
        return true;
      }),
    };

    jest.doMock("../../../helpers", () => ({
      getVectorDbClass: () => LanceDb,
    }));
    jest.doMock("../../../prisma", () => ({
      agent_trajectories: {
        findMany: jest.fn(),
      },
    }));

    const adapter = require("../vectorAdapter");

    await adapter.upsert("traj-ws-7-u-1", {
      id: "a_1",
      vector: [0.1],
      scopeKey: "ws:7:user:1",
      planShapeJson: "{}",
    });
    await adapter.upsert("traj-ws-7-u-2", {
      id: "b_1",
      vector: [0.2],
      scopeKey: "ws:7:user:2",
      planShapeJson: "{}",
    });

    const userTwoRows = await adapter.query("traj-ws-7-u-2", [0.2], 3, {
      scopeKey: "ws:7:user:2",
    });
    expect(userTwoRows.map((row) => row.id)).toEqual(["b_1"]);

    await adapter.deleteByIds("traj-ws-7-u-2", ["b_1"]);
    expect(await adapter.query("traj-ws-7-u-2", [0.2], 3, {
      scopeKey: "ws:7:user:2",
    })).toEqual([]);

    await adapter.dropNamespace("traj-ws-7-u-1");
    expect(tables.has("traj-ws-7-u-1")).toBe(false);
  });
});
