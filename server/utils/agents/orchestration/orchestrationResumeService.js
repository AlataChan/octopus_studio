"use strict";

const {
  rebuildOnEdit,
  commitWithRebase,
  deriveCursor,
} = require("./orchestrationRunState");

/**
 * OrchestrationResumeService — reconstructs suspended team orchestration from
 * DB state and re-invokes TeamOrchestrationService.run({resumeState}).
 *
 * All dependencies are injectable for testing; production defaults are
 * assembled by buildDefaultResumeService() in workflowConfirmation.js.
 *
 * @param {{
 *   orchestrationService: { run: function },
 *   runStore: { get: function },
 *   getConfirmation: function,
 *   loadWorkspace: function,
 *   loadUser?: function,
 *   loadThread?: function,
 *   listEmployees: function,
 *   buildGenerateText: function,
 *   buildOnEvent: function,
 *   persistResult: function,
 * }} deps
 */
function validEditedSteps(steps, allowedIds) {
  return Array.isArray(steps)
    && steps.length > 0
    && steps.length <= 8
    && steps.every((step) =>
      step
      && typeof step.assistantId === "string"
      && allowedIds.has(step.assistantId)
      && typeof step.subtask === "string"
      && step.subtask.trim()
    );
}

async function clearResumeClaimIfOwned({ runStore, runId, claimId }) {
  if (!claimId || !runStore?.casUpdate) return;
  try {
    await commitWithRebase({
      runStore,
      runId,
      mutate: (metadata) => {
        if (metadata.resumeClaimId !== claimId) return metadata;
        const next = { ...metadata };
        delete next.resumeClaimId;
        delete next.resumeClaimedAt;
        return next;
      },
    });
  } catch (_) {}
}

function createOrchestrationResumeService(deps = {}) {
  return {
    async resume(confirmationId, opts = {}) {
      // 1. Load confirmation record
      const conf = await deps.getConfirmation(confirmationId);
      if (!conf) return { handled: false, reason: "confirmation_not_found" };

      // 2. Parse planDetails — gate on kind === "team_step"
      let pd = {};
      try {
        pd = typeof conf.planDetails === "string"
          ? JSON.parse(conf.planDetails)
          : (conf.planDetails || {});
      } catch (_) {}
      if (pd.kind !== "team_step") {
        return { handled: false, reason: "not_team_step" };
      }

      // 3. Load suspended run state from DB (pure DB reconstruction — no in-memory resolver)
      const orchestrationRunId = pd.orchestrationRunId;
      const state = await deps.runStore.get(orchestrationRunId);
      if (!state || !state.plan) {
        // Attempt to finalize if we know the runId, so the run isn't stranded
        if (orchestrationRunId && deps.runStore.finalize) {
          try { await deps.runStore.finalize(orchestrationRunId, "failed"); } catch (_) {}
        }
        return { handled: false, reason: "run_state_missing" };
      }

      // 4. Load workspace/user/thread/employees
      const workspace = await deps.loadWorkspace(conf.workspaceId);
      const user = deps.loadUser ? await deps.loadUser(conf.userId) : null;
      const thread = deps.loadThread ? await deps.loadThread(conf.threadId) : null;
      const employees = await deps.listEmployees(conf.workspaceId);
      const generateText = deps.buildGenerateText({ workspace });
      const onEvent = deps.buildOnEvent({ workspace, thread, runId: orchestrationRunId });
      const allowedIds = new Set(
        (employees || [])
          .map((employee) => employee?.assistantId)
          .filter((assistantId) => typeof assistantId === "string")
      );
      let planToUse = state.plan;

      if (
        opts.editedSteps
        && pd.stepId === "plan"
        && validEditedSteps(opts.editedSteps, allowedIds)
      ) {
        if (state.executionVersion === 2 && deps.runStore.casUpdate) {
          await commitWithRebase({
            runStore: deps.runStore,
            runId: orchestrationRunId,
            mutate: (metadata) => rebuildOnEdit(metadata, opts.editedSteps),
          });
        } else {
          await deps.runStore.update(orchestrationRunId, { plan: opts.editedSteps });
        }
        planToUse = opts.editedSteps;
      }

      let resumeClaimId = null;
      if (state.executionVersion === 2 && deps.runStore.casUpdate) {
        const claimId = `resume-${confirmationId}-${Date.now()}`;
        const claim = await commitWithRebase({
          runStore: deps.runStore,
          runId: orchestrationRunId,
          maxRetries: 1,
          mutate: (metadata) => {
            if (metadata.resumeClaimId) {
              const err = new Error("resume already claimed");
              err.code = "resume_claimed";
              throw err;
            }
            return {
              ...metadata,
              resumeClaimId: claimId,
              resumeClaimedAt: Date.now(),
            };
          },
        }).catch((error) => ({
          ok: false,
          reason: error?.code || "claim_failed",
        }));
        if (!claim.ok) {
          return { handled: false, reason: claim.reason || "resume_claim_conflict" };
        }
        resumeClaimId = claimId;
      }

      // 5. Re-invoke orchestration with resumeState (broker idempotency reads DB confirmation status)
      let result;
      try {
        result = await deps.orchestrationService.run({
          resumeState: {
            runId: orchestrationRunId,
            plan: planToUse,
            cursor: state.executionVersion === 2
              ? deriveCursor(state.stepStates || [])
              : state.cursor,
            accumulatedContext: state.accumulatedContext,
            executionVersion: state.executionVersion,
          },
          workspace,
          user,
          thread,
          employees,
          generateText,
          onEvent,
        });
      } catch (runError) {
        // Finalize the run as failed so it isn't stranded
        if (deps.runStore.finalize) {
          try { await deps.runStore.finalize(orchestrationRunId, "failed"); } catch (_) {}
        }
        await clearResumeClaimIfOwned({
          runStore: deps.runStore,
          runId: orchestrationRunId,
          claimId: resumeClaimId,
        });
        if (deps.buildOnEvent) {
          try {
            onEvent({ type: "error", error: runError?.message || String(runError), runId: orchestrationRunId });
          } catch (_) {}
        }
        console.error("[Team resume] orchestrationService.run threw:", runError);
        return { handled: false, error: runError?.message || String(runError) };
      }

      // 6. If still suspended (another approval needed in the resumed run)
      if (result?.status === "suspended") {
        await clearResumeClaimIfOwned({
          runStore: deps.runStore,
          runId: orchestrationRunId,
          claimId: resumeClaimId,
        });
        return { handled: true, suspended: true, confirmationId: result.confirmationId };
      }

      // 7. Completed — persist final result
      try {
        await deps.persistResult({ workspace, user, thread, result, runId: orchestrationRunId });
      } finally {
        await clearResumeClaimIfOwned({
          runStore: deps.runStore,
          runId: orchestrationRunId,
          claimId: resumeClaimId,
        });
      }
      return { handled: true, suspended: false, text: result?.text ?? null };
    },
  };
}

/**
 * Pure gate function: does this confirmation describe a team_step?
 * Extracted for unit testing without needing a full resume service.
 */
function shouldResumeTeam(confirmation) {
  if (!confirmation) return false;
  try {
    const pd = typeof confirmation.planDetails === "string"
      ? JSON.parse(confirmation.planDetails)
      : (confirmation.planDetails || {});
    return pd.kind === "team_step";
  } catch (_) {
    return false;
  }
}

module.exports = { createOrchestrationResumeService, shouldResumeTeam };
