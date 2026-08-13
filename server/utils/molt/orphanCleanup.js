const { EventLogs } = require("../../models/eventLogs");
const { WorkspaceMoltAgent } = require("../../models/workspaceMoltAgent");
const { getMoltBroker } = require("./broker");
const { MoltHealthMonitor } = require("./healthMonitor");

function monitorIsAvailable(monitor) {
  if (!monitor) return false;
  if (typeof monitor.isAvailable === "function") return monitor.isAvailable();
  return monitor.isAvailable === true;
}

function readAgentId(agent) {
  return String(agent?.id || agent?.agentId || agent?.slug || "").trim();
}

function agentIdSet(agents = []) {
  return new Set(agents.map(readAgentId).filter(Boolean));
}

function metadataIsOrphaned(row = {}) {
  try {
    const metadata =
      typeof row.metadata === "string"
        ? JSON.parse(row.metadata)
        : row.metadata;
    return metadata?.moltStatus === "orphaned";
  } catch {
    return false;
  }
}

function auditMetadata(row, extra = {}) {
  return {
    workspace_id: row.workspace_id,
    molt_agent_id: row.molt_agent_id,
    attachment_id: row.id,
    occurred_at: new Date().toISOString(),
    ...extra,
  };
}

async function audit(eventLogs, event, row, extra = {}) {
  try {
    await eventLogs.logEvent(event, auditMetadata(row, extra), null);
  } catch (error) {
    console.warn(`[MoltOrphanCleanup] audit ${event} failed:`, error.message);
  }
}

async function reconcileAttachedAgents({
  broker = getMoltBroker(),
  monitor = MoltHealthMonitor.getInstance(),
  model = WorkspaceMoltAgent,
  eventLogs = EventLogs,
  logger = console,
} = {}) {
  if (!monitorIsAvailable(monitor)) {
    return {
      orphaned: 0,
      reattached: 0,
      alive: 0,
      skipped: true,
      reason: "MOLT_OFFLINE",
    };
  }

  let result;
  try {
    result = await broker.listAgents();
  } catch (error) {
    logger.warn?.("[MoltOrphanCleanup] listAgents failed:", error.message);
    return {
      orphaned: 0,
      reattached: 0,
      alive: 0,
      skipped: true,
      reason: "MOLT_LIST_FAILED",
    };
  }

  if (!result?.success) {
    logger.warn?.(
      "[MoltOrphanCleanup] listAgents skipped:",
      result?.error || result?.code || "unknown error"
    );
    return {
      orphaned: 0,
      reattached: 0,
      alive: 0,
      skipped: true,
      reason: "MOLT_LIST_FAILED",
    };
  }

  const remoteIds = agentIdSet(result.agents);
  const rows = await model.all({ includeSoftDeleted: false });
  const stats = { orphaned: 0, reattached: 0, alive: 0 };

  for (const row of rows) {
    const existsInMolt = remoteIds.has(String(row.molt_agent_id));
    const rowIsOrphaned =
      typeof model.isOrphaned === "function"
        ? model.isOrphaned(row)
        : metadataIsOrphaned(row);

    if (!existsInMolt) {
      if (row.enabled !== false || !rowIsOrphaned) {
        await model.markOrphaned({
          workspaceId: row.workspace_id,
          moltAgentId: row.molt_agent_id,
        });
        await audit(eventLogs, "molt.agent_orphaned", row);
        stats.orphaned += 1;
      }
      continue;
    }

    if (row.enabled === false && rowIsOrphaned) {
      await model.markReattached({
        workspaceId: row.workspace_id,
        moltAgentId: row.molt_agent_id,
      });
      await audit(eventLogs, "molt.agent_reattached", row);
      stats.reattached += 1;
      continue;
    }

    stats.alive += 1;
  }

  return stats;
}

async function softDeleteStaleAttachments({
  ageDays = Number(process.env.MOLT_ORPHAN_SOFT_DELETE_DAYS || 30),
  model = WorkspaceMoltAgent,
  eventLogs = EventLogs,
} = {}) {
  const rows = await model.listOrphanedOlderThan({ ageDays });
  let deleted = 0;

  for (const row of rows) {
    const updated = await model.softDelete({ id: row.id });
    if (!updated) continue;
    await audit(eventLogs, "molt.attachment_soft_deleted", row, {
      age_days: Number(ageDays) || 30,
    });
    deleted += 1;
  }

  return { deleted };
}

module.exports = {
  reconcileAttachedAgents,
  softDeleteStaleAttachments,
};
