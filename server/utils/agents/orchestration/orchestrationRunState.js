"use strict";

const COMPLETE_STATUSES = new Set(["done", "skipped"]);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeRecord(record = {}) {
  const metadata = record.metadata && typeof record.metadata === "object"
    ? record.metadata
    : record;
  return {
    stateVersion: Number.isInteger(record.stateVersion)
      ? record.stateVersion
      : 0,
    metadata: clone(metadata || {}),
  };
}

function deriveCursor(stepStates = []) {
  if (!Array.isArray(stepStates) || stepStates.length === 0) return 0;
  const byIndex = new Map();
  for (const state of stepStates) {
    if (state && Number.isInteger(state.index)) byIndex.set(state.index, state);
  }
  for (let index = 0; index < stepStates.length; index++) {
    const state = byIndex.get(index) || stepStates[index];
    if (!COMPLETE_STATUSES.has(state?.status)) return index;
  }
  return stepStates.length;
}

function createInitialStepStates(steps = [], { planRevision = 1 } = {}) {
  return (steps || []).map((step, index) => ({
    index,
    planRevision,
    status: "pending",
    attemptId: null,
    leaseUntil: null,
    resultRef: null,
    confirmationId: null,
    attempts: 0,
    readOnly: step?.readOnly === true,
  }));
}

function withDerivedCursor(metadata) {
  const next = { ...(metadata || {}) };
  next.cursor = deriveCursor(next.stepStates || []);
  return next;
}

async function commitWithRebase({
  runStore,
  runId,
  mutate,
  maxRetries = 5,
}) {
  if (!runStore?.get || !runStore?.casUpdate) {
    throw new Error("runStore with get and casUpdate is required");
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const record = normalizeRecord(await runStore.get(runId));
    const next = withDerivedCursor(await mutate(record.metadata, record));
    const result = await runStore.casUpdate(
      runId,
      record.stateVersion,
      next
    );
    if (result?.ok) return { ok: true, stateVersion: result.stateVersion };
  }
  return { ok: false, conflict: true };
}

async function claimStep({
  runStore,
  runId,
  index,
  attemptId,
  leaseMs,
  now,
  maxRetries = 5,
}) {
  const currentNow = typeof now === "function" ? now() : now;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const record = normalizeRecord(await runStore.get(runId));
    const states = Array.isArray(record.metadata.stepStates)
      ? clone(record.metadata.stepStates)
      : [];
    const state = states[index];
    if (!state) return { ok: false, reason: "missing_step" };
    if (state.status === "running" && state.attemptId === attemptId) {
      return { ok: true, alreadyClaimed: true };
    }
    if (state.status !== "pending") {
      return { ok: false, reason: "not_pending", status: state.status };
    }

    states[index] = {
      ...state,
      status: "running",
      attemptId,
      leaseUntil: currentNow + leaseMs,
      attempts: Number(state.attempts || 0) + 1,
    };
    const next = withDerivedCursor({ ...record.metadata, stepStates: states });
    const result = await runStore.casUpdate(
      runId,
      record.stateVersion,
      next
    );
    if (result?.ok) return { ok: true, stateVersion: result.stateVersion };
  }
  return { ok: false, conflict: true };
}

function reconcileStale(stepStates = [], now) {
  return (stepStates || []).map((state) => {
    if (
      state?.status !== "running" ||
      !Number.isFinite(Number(state.leaseUntil)) ||
      Number(state.leaseUntil) > now
    ) {
      return { ...state };
    }
    if (state.readOnly === true) {
      return {
        ...state,
        status: "pending",
        attemptId: null,
        leaseUntil: null,
      };
    }
    return {
      ...state,
      status: "needs_reconciliation",
      attemptId: null,
      leaseUntil: null,
    };
  });
}

function sameStep(a, b) {
  return (
    a &&
    b &&
    String(a.assistantId) === String(b.assistantId) &&
    String(a.subtask) === String(b.subtask) &&
    String(a.group || "") === String(b.group || "") &&
    String(a.reviewerAssistantId || "") === String(b.reviewerAssistantId || "")
  );
}

function rebuildOnEdit(oldMetadata = {}, newPlan = []) {
  const oldPlan = Array.isArray(oldMetadata.plan) ? oldMetadata.plan : [];
  const oldStates = Array.isArray(oldMetadata.stepStates)
    ? oldMetadata.stepStates
    : [];
  const nextRevision = Number(oldMetadata.planRevision || 1) + 1;
  const nextStates = [];
  let preserve = true;

  for (let index = 0; index < newPlan.length; index++) {
    const oldState = oldStates[index];
    if (
      preserve &&
      oldState &&
      COMPLETE_STATUSES.has(oldState.status) &&
      sameStep(oldPlan[index], newPlan[index])
    ) {
      nextStates.push({ ...clone(oldState), index });
      continue;
    }
    preserve = false;
    nextStates.push({
      index,
      planRevision: nextRevision,
      status: "pending",
      attemptId: null,
      leaseUntil: null,
      resultRef: null,
      confirmationId: null,
      attempts: 0,
      readOnly: newPlan[index]?.readOnly === true,
    });
  }

  return withDerivedCursor({
    ...oldMetadata,
    plan: clone(newPlan),
    planRevision: nextRevision,
    previousStepStates: clone(oldStates),
    stepStates: nextStates,
  });
}

function isSwarmOrchestrationEnabled(env = process.env) {
  const team = String(env.TEAM_ORCHESTRATION_ENABLED || "").toLowerCase() === "true";
  const swarm =
    String(env.SWARM_ORCHESTRATION_ENABLED || "").toLowerCase() === "true" ||
    String(env.swarm_orchestration_enabled || "").toLowerCase() === "true";
  return team && swarm;
}

module.exports = {
  COMPLETE_STATUSES,
  normalizeRecord,
  deriveCursor,
  createInitialStepStates,
  withDerivedCursor,
  commitWithRebase,
  claimStep,
  reconcileStale,
  rebuildOnEdit,
  isSwarmOrchestrationEnabled,
};
