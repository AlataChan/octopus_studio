const {
  assertWorkspaceResourceAccess,
} = require("../access/assertWorkspaceResourceAccess");
const {
  requireWorkspaceAdmin,
} = require("../access/requireWorkspaceAdmin");

const FDE_ACTIONS = Object.freeze({
  IMPORT: "import",
  LIST: "list",
  DETAIL: "detail",
  REQUEST_REVIEW: "request-review",
  APPROVE: "approve",
  REJECT: "reject",
  PUBLISH: "publish",
  CREATE_SESSION: "create-session",
  CREATE_TURN: "create-turn",
  GET_IR: "get-ir",
  GET_DIFF: "get-diff",
  COMPILE_IMPORT: "compile-import",
  CREATE_RUN: "create-run",
  RUN_DETAIL: "run-detail",
  RUN_EVENTS: "run-events",
  RUN_ARTIFACTS: "run-artifacts",
  CANCEL_RUN: "cancel-run",
  RESUME_RUN: "resume-run",
});

const ELEVATED_ACTIONS = new Set([
  FDE_ACTIONS.APPROVE,
  FDE_ACTIONS.REJECT,
  FDE_ACTIONS.PUBLISH,
  FDE_ACTIONS.CREATE_RUN,
  FDE_ACTIONS.CANCEL_RUN,
  FDE_ACTIONS.RESUME_RUN,
]);
const KNOWN_ACTIONS = new Set(Object.values(FDE_ACTIONS));

async function authorizeFdeAction({
  action,
  workspaceId,
  user,
  multiUserMode,
}) {
  if (!KNOWN_ACTIONS.has(action)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const input = { workspaceId, user, multiUserMode };
  if (ELEVATED_ACTIONS.has(action)) return requireWorkspaceAdmin(input);
  return assertWorkspaceResourceAccess(input);
}

module.exports = { FDE_ACTIONS, authorizeFdeAction };
