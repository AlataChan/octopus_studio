"use strict";

function asPositiveInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function failClosed() {
  return { ok: false, reason: "scope_unresolvable" };
}

function resolveTrajectoryScope({ workspaceId, userId, multiUserMode }) {
  const wid = asPositiveInt(workspaceId);
  if (!wid) return failClosed();

  if (multiUserMode) {
    const uid = asPositiveInt(userId);
    if (!uid) return failClosed();
    return {
      ok: true,
      scopeKey: `ws:${wid}:user:${uid}`,
      namespace: `traj-ws-${wid}-u-${uid}`,
    };
  }

  return {
    ok: true,
    scopeKey: `ws:${wid}:system`,
    namespace: `traj-ws-${wid}-u-0`,
  };
}

function workspaceIdFromScopeKey(scopeKey) {
  const match = String(scopeKey || "").match(/^ws:(\d+):(system|user:\d+)$/);
  if (!match) return null;
  return asPositiveInt(match[1]);
}

function namespaceFromTrajectoryRow(row = {}) {
  const workspaceId = asPositiveInt(row.workspaceId);
  if (!workspaceId) return null;
  const userId = row.userId == null ? 0 : asPositiveInt(row.userId);
  if (userId === null) return null;
  return `traj-ws-${workspaceId}-u-${userId}`;
}

module.exports = {
  resolveTrajectoryScope,
  workspaceIdFromScopeKey,
  namespaceFromTrajectoryRow,
};
