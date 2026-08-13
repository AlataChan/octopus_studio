"use strict";

const prisma = require("../../prisma");
const { SystemSettings } = require("../../../models/systemSettings");
const { EventLogs } = require("../../../models/eventLogs");
const { workspaceIdFromScopeKey } = require("./scope");

async function isTrajectoryMemoryEnabled() {
  const setting = await SystemSettings.get({ label: "trajectory_memory_enabled" });
  return setting?.value === "true";
}

async function isWorkspaceTrajectoryMemoryDisabled({ workspaceId, scopeKey }) {
  const wid = workspaceId ? Number(workspaceId) : workspaceIdFromScopeKey(scopeKey);
  if (!Number.isInteger(wid) || wid <= 0) return true;

  const workspace = await prisma.workspaces.findUnique({
    where: { id: wid },
    select: { id: true, trajectoryMemoryDisabled: true },
  });
  return workspace?.trajectoryMemoryDisabled === true;
}

async function logTrajectoryMemoryWarn(event, metadata = {}, userId = null) {
  try {
    await EventLogs.logEvent(event, metadata, userId);
  } catch (error) {
    console.warn("[TrajectoryMemory] warn telemetry skipped:", error.message);
  }
}

module.exports = {
  isTrajectoryMemoryEnabled,
  isWorkspaceTrajectoryMemoryDisabled,
  logTrajectoryMemoryWarn,
};
