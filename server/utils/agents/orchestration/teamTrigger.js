"use strict";

/**
 * teamTrigger.js — Team orchestration trigger detection + feature flag.
 *
 * Pure functions, no I/O — easy to unit-test.
 * Flag defaults OFF (env TEAM_ORCHESTRATION_ENABLED !== "true") so normal
 * chat is completely unaffected when the feature is disabled.
 */

const TEAM_HANDLES = ["@团队", "@team"];

/**
 * Returns true only when TEAM_ORCHESTRATION_ENABLED==="true" (case-insensitive).
 * Accepts env override for testing.
 */
function isTeamOrchestrationEnabled(env = process.env) {
  return String(env.TEAM_ORCHESTRATION_ENABLED || "").toLowerCase() === "true";
}

/**
 * Returns true when:
 *  1. Feature flag is ON, AND
 *  2. message contains a team handle (@团队 / @team), OR
 *     assistantId matches teamAssistantId (workspace-level team assistant).
 *
 * When flag is OFF this always returns false — zero-impact on normal chat.
 */
function isTeamTrigger({
  message,
  assistantId,
  teamAssistantId = null,
  env = process.env,
}) {
  if (!isTeamOrchestrationEnabled(env)) return false;
  const text = String(message || "");
  if (TEAM_HANDLES.some((h) => text.includes(h))) return true;
  if (
    teamAssistantId &&
    assistantId &&
    String(assistantId) === String(teamAssistantId)
  )
    return true;
  return false;
}

module.exports = { isTeamOrchestrationEnabled, isTeamTrigger, TEAM_HANDLES };
