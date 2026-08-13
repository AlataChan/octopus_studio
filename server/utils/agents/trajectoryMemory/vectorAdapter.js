"use strict";

const prisma = require("../../prisma");
const { getVectorDbClass } = require("../../helpers");
const { namespaceFromTrajectoryRow } = require("./scope");

let warnedFallback = false;

function provider() {
  return getVectorDbClass();
}

function isLanceProvider(VectorDb = provider()) {
  return VectorDb?.name === "LanceDb";
}

function warnFallbackOnce() {
  if (warnedFallback) return;
  warnedFallback = true;
  console.warn(
    "[TrajectoryMemory] Non-Lance vector DB detected; using Prisma keyword fallback."
  );
}

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

async function upsert(namespace, doc = {}) {
  const VectorDb = provider();
  if (!isLanceProvider(VectorDb)) {
    warnFallbackOnce();
    return false;
  }

  const id = String(doc.id || "");
  if (!id || !Array.isArray(doc.vector)) return false;

  const { client } = await VectorDb.connect();
  if (await VectorDb.namespaceExists(client, namespace)) {
    await deleteByIds(namespace, [id], { VectorDb, client });
  }

  await VectorDb.updateOrCreateCollection(
    client,
    [
      {
        id,
        vector: doc.vector,
        text: doc.scopeKey || id,
        scopeKey: doc.scopeKey || "",
        planShapeJson: doc.planShapeJson || "",
        createdAt: doc.createdAt
          ? new Date(doc.createdAt).toISOString()
          : new Date().toISOString(),
      },
    ],
    namespace
  );
  return true;
}

async function query(namespace, vector, topK = 3, options = {}) {
  const VectorDb = provider();
  if (!isLanceProvider(VectorDb)) {
    warnFallbackOnce();
    return prismaKeywordFallback({ topK, ...options });
  }

  const { client } = await VectorDb.connect();
  if (!(await VectorDb.namespaceExists(client, namespace))) return [];
  const table = await client.openTable(namespace);
  const rows = await table
    .vectorSearch(vector)
    .distanceType("cosine")
    .limit(Math.max(topK * 3, topK))
    .toArray();

  return rows
    .filter((row) => !options.scopeKey || row.scopeKey === options.scopeKey)
    .slice(0, topK)
    .map(({ vector: _vector, _distance: _distance, text: _text, ...row }) => row);
}

async function deleteByIds(namespace, ids = [], injected = {}) {
  const cleanIds = (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || ""))
    .filter(Boolean);
  if (cleanIds.length === 0) return false;

  const VectorDb = injected.VectorDb || provider();
  if (!isLanceProvider(VectorDb)) return false;
  const { client } = injected.client ? injected : await VectorDb.connect();
  if (!(await VectorDb.namespaceExists(client, namespace))) return false;

  const table = await client.openTable(namespace);
  const idList = cleanIds.map((id) => `'${escapeSqlString(id)}'`).join(",");
  await table.delete(`id IN (${idList})`);
  return true;
}

async function dropNamespace(namespace) {
  const VectorDb = provider();
  if (!isLanceProvider(VectorDb)) return false;
  const { client } = await VectorDb.connect();
  if (!(await VectorDb.namespaceExists(client, namespace))) return false;
  await VectorDb.deleteVectorsInNamespace(client, namespace);
  return true;
}

async function dropTrajectoryNamespaces(namespaces = []) {
  const unique = [...new Set((namespaces || []).filter(Boolean))];
  for (const namespace of unique) {
    try {
      await dropNamespace(namespace);
    } catch (error) {
      console.warn(
        `[TrajectoryMemory] Failed to drop namespace ${namespace}:`,
        error.message
      );
    }
  }
  return true;
}

function namespacesFromRows(rows = []) {
  return [
    ...new Set(
      rows
        .map((row) => namespaceFromTrajectoryRow(row))
        .filter((namespace) => typeof namespace === "string" && namespace.length)
    ),
  ];
}

async function listTrajectoryNamespacesForWorkspace(workspaceId) {
  const rows = await prisma.agent_trajectories.findMany({
    where: { workspaceId: Number(workspaceId) },
    select: { workspaceId: true, userId: true },
  });
  return namespacesFromRows(rows);
}

async function listTrajectoryNamespacesForUser(userId) {
  const rows = await prisma.agent_trajectories.findMany({
    where: { userId: Number(userId) },
    select: { workspaceId: true, userId: true },
  });
  return namespacesFromRows(rows);
}

async function dropTrajectoryNamespacesForWorkspace(workspaceId) {
  const namespaces = await listTrajectoryNamespacesForWorkspace(workspaceId);
  await dropTrajectoryNamespaces(namespaces);
  return true;
}

async function dropTrajectoryNamespacesForUser(userId) {
  const namespaces = await listTrajectoryNamespacesForUser(userId);
  await dropTrajectoryNamespaces(namespaces);
  return true;
}

function keywordTokens(input = "") {
  return [
    ...new Set(
      String(input)
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .slice(0, 6)
    ),
  ];
}

async function prismaKeywordFallback({ scopeKey, canonicalGoal, since, topK = 3 }) {
  const tokens = keywordTokens(canonicalGoal);
  return prisma.agent_trajectories.findMany({
    where: {
      scopeKey,
      ...(since ? { createdAt: { gte: since } } : {}),
      ...(tokens.length
        ? {
            OR: tokens.map((token) => ({
              goal: { contains: token },
            })),
          }
        : {}),
    },
    orderBy: [{ successScore: "desc" }, { createdAt: "desc" }],
    take: topK,
  });
}

module.exports = {
  isLanceProvider,
  upsert,
  query,
  deleteByIds,
  dropNamespace,
  dropTrajectoryNamespaces,
  listTrajectoryNamespacesForWorkspace,
  listTrajectoryNamespacesForUser,
  dropTrajectoryNamespacesForWorkspace,
  dropTrajectoryNamespacesForUser,
  prismaKeywordFallback,
};
