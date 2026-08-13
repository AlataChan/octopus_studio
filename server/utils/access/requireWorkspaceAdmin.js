const prisma = require("../prisma");

class WorkspaceAdminRequiredError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = "WorkspaceAdminRequiredError";
    this.status = status;
  }
}

async function requireWorkspaceAdmin({ workspaceId, user, multiUserMode }) {
  if (multiUserMode === false) return { ok: true };

  if (!user?.id) {
    return { ok: false, status: 401, error: "Unauthenticated" };
  }

  if (user.role === "admin") return { ok: true };

  // Current workspace_users has no per-workspace role column. In this build,
  // system managers are treated as workspace admins only for workspaces they
  // are explicitly attached to.
  if (user.role === "manager") {
    const membership = await prisma.workspace_users.findFirst({
      where: { workspace_id: Number(workspaceId), user_id: Number(user.id) },
      select: { id: true },
    });
    if (membership) return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    error: "Forbidden: workspace admin required",
  };
}

module.exports = {
  WorkspaceAdminRequiredError,
  requireWorkspaceAdmin,
};
