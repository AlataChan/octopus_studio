"use strict";

const prisma = require("../../prisma");
const { NativeEmbedder } = require("../../EmbeddingEngines/native");
const vectorAdapter = require("./vectorAdapter");
const {
  isTrajectoryMemoryEnabled,
  isWorkspaceTrajectoryMemoryDisabled,
} = require("./settings");

const SAFE_ROLE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_GOAL_CHARS = 2000;
const MAX_TRAJECTORIES_PER_SCOPE = 500;

function safeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

function buildPlanShape({ validatedPlan = [], outcome, successScore, tokenCost }) {
  const plan = Array.isArray(validatedPlan) ? validatedPlan : [];
  const roles = plan
    .map((step) => step?.assistantId)
    .filter((assistantId) => typeof assistantId === "string")
    .filter((assistantId) => SAFE_ROLE_RE.test(assistantId));

  return {
    v: 1,
    steps: plan.length,
    roles,
    outcome,
    successScore,
    tokenCost: safeInt(tokenCost),
  };
}

function normalizeOutcome({ outcome, successScore }) {
  if (!["success", "partial"].includes(outcome)) return null;
  const score = Number(successScore);
  if (!Number.isFinite(score) || score < 0 || score > 1) return null;
  return { outcome, successScore: score };
}

function deriveTrajectoryOutcome({ stepResults = [], finalStatus }) {
  if (["cancelled", "rejected", "blocked", "suspended"].includes(finalStatus)) {
    return null;
  }

  const total = Array.isArray(stepResults) ? stepResults.length : 0;
  if (total === 0) return null;
  const okCount = stepResults.filter((step) => step?.ok === true).length;
  const failedCount = stepResults.filter((step) => step?.ok === false).length;

  if (finalStatus === "done" && failedCount === 0 && okCount === total) {
    return { outcome: "success", successScore: 1 };
  }

  if (okCount > 0 && (failedCount > 0 || finalStatus === "budget_exceeded")) {
    return {
      outcome: "partial",
      successScore: okCount / total,
    };
  }

  return null;
}

async function enforceScopeLimit({ scopeKey, namespace }) {
  const count = await prisma.agent_trajectories.count({ where: { scopeKey } });
  if (count <= MAX_TRAJECTORIES_PER_SCOPE) return;

  const excess = count - MAX_TRAJECTORIES_PER_SCOPE;
  const victims = await prisma.agent_trajectories.findMany({
    where: { scopeKey },
    select: { id: true },
    orderBy: [{ successScore: "asc" }, { createdAt: "asc" }],
    take: excess,
  });
  const ids = victims.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return;

  await prisma.agent_trajectories.deleteMany({
    where: { id: { in: ids } },
  });
  await vectorAdapter.deleteByIds(namespace, ids);
}

async function recordTrajectory({
  runId,
  workspaceId,
  userId,
  runMetadata,
  validatedPlan,
  outcome,
  successScore,
  tokenCost = 0,
  durationMs = 0,
  provider = null,
  model = null,
  tier = null,
}) {
  if (!(await isTrajectoryMemoryEnabled())) return { recorded: false };
  if (!runMetadata || runMetadata.trajectoryScope === null)
    return { recorded: false };

  const scopeKey = runMetadata.trajectoryScopeKey;
  const namespace = runMetadata.trajectoryNamespace;
  const canonicalGoal = String(runMetadata.canonicalGoal || "").slice(
    0,
    MAX_GOAL_CHARS
  );
  if (!scopeKey || !namespace || !canonicalGoal) return { recorded: false };

  if (
    await isWorkspaceTrajectoryMemoryDisabled({
      workspaceId,
      scopeKey,
    })
  ) {
    return { recorded: false };
  }

  const normalized = normalizeOutcome({ outcome, successScore });
  if (!normalized) return { recorded: false };

  const planShape = buildPlanShape({
    validatedPlan,
    outcome: normalized.outcome,
    successScore: normalized.successScore,
    tokenCost,
  });

  // Derive userId STRICTLY from the frozen scopeKey (never the live request userId),
  // so a row's userId can never disagree with its frozen scopeKey/namespace — which the
  // per-user purge/cleanup path (namespaceFromTrajectoryRow) depends on. System scope → null.
  const scopeUserMatch = String(scopeKey).match(/^ws:\d+:user:(\d+)$/);
  const frozenUserId = scopeUserMatch ? Number(scopeUserMatch[1]) : null;

  const created = await prisma.agent_trajectories.create({
    data: {
      runId: runId ?? null,
      workspaceId: Number(workspaceId),
      userId: frozenUserId == null ? null : Number(frozenUserId),
      scopeKey,
      goal: canonicalGoal,
      planShapeJson: JSON.stringify(planShape),
      outcome: normalized.outcome,
      successScore: normalized.successScore,
      tokenCost: safeInt(tokenCost),
      durationMs: safeInt(durationMs),
      provider: provider ?? null,
      model: model ?? null,
      tier: tier ?? null,
    },
  });

  const embedder = new NativeEmbedder();
  const vector = await embedder.embedTextInput(canonicalGoal);
  await vectorAdapter.upsert(namespace, {
    id: created.id,
    vector,
    scopeKey,
    planShapeJson: JSON.stringify(planShape),
    createdAt: created.createdAt,
  });

  await enforceScopeLimit({ scopeKey, namespace });
  return { recorded: true, id: created.id };
}

module.exports = {
  SAFE_ROLE_RE,
  MAX_TRAJECTORIES_PER_SCOPE,
  buildPlanShape,
  deriveTrajectoryOutcome,
  recordTrajectory,
};
