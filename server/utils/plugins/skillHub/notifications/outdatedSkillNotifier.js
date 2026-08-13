const { Notification } = require("../../../../models/notification");
const { Workspace } = require("../../../../models/workspace");
const { SkillInstallations } = require("../../../../models/skillInstallations");
const { SkillCatalog } = require("../../../../models/skillCatalog");
const { safeJsonParse } = require("../../../http");

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function isWithinCooldown(lastNotifiedAt, now, cooldownMs) {
  const last = toDate(lastNotifiedAt);
  if (!last) return false;
  return now.getTime() - last.getTime() < cooldownMs;
}

async function notifyOutdatedSkill({
  skillId,
  source,
  skill = {},
  update = {},
  now = new Date(),
  cooldownMs = 24 * 60 * 60 * 1000,
  rolesToNotify = ["admin", "manager"],
  notificationModel = Notification,
  workspaceModel = Workspace,
  skillInstallationsModel = SkillInstallations,
  skillCatalogModel = SkillCatalog,
} = {}) {
  if (!skillId || !source) return { notified: false, notifiedAt: null };

  const existing = await skillCatalogModel.get({ skillId, source });
  const existingMetadata = safeJsonParse(existing?.metadataJson, {}) || {};
  const lastNotifiedAt = existingMetadata?.outdatedNotifiedAt || null;

  if (isWithinCooldown(lastNotifiedAt, now, cooldownMs)) {
    return { notified: false, notifiedAt: null, lastNotifiedAt };
  }

  const workspaceIds =
    await skillInstallationsModel.listWorkspaceIdsForSkill(skillId);
  if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
    return { notified: false, notifiedAt: null, lastNotifiedAt };
  }

  const title = `Skill 有更新：${skill?.name || skillId}`;
  const contentLines = [
    `SkillId: ${skillId}`,
    `当前版本指纹: ${update?.currentHash || "-"}`,
    `远程版本指纹: ${update?.remoteHash || "-"}`,
    "请在 Skill Hub 中查看升级预览并执行升级。",
  ];
  const content = contentLines.join("\n");

  let notified = false;
  for (const workspaceId of workspaceIds) {
    const users = (await workspaceModel.workspaceUsers(workspaceId)) || [];
    const recipients = users
      .filter((u) =>
        rolesToNotify.includes(String(u?.role || "").toLowerCase())
      )
      .map((u) => Number(u.userId))
      .filter(Number.isFinite);

    if (recipients.length === 0) continue;

    const result = await notificationModel.createMany(recipients, {
      type: notificationModel?.TYPES?.WARNING || "warning",
      title,
      content,
      metadata: {
        skillId,
        workspaceId,
        status: update?.status || "outdated",
        currentHash: update?.currentHash || null,
        remoteHash: update?.remoteHash || null,
      },
    });

    if ((result?.count || 0) > 0) notified = true;
  }

  return {
    notified,
    notifiedAt: notified ? now.toISOString() : null,
    lastNotifiedAt,
  };
}

module.exports = {
  notifyOutdatedSkill,
};
