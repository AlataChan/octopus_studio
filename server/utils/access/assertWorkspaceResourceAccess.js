const prisma = require("../prisma");

class WorkspaceAccessError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = "WorkspaceAccessError";
    this.status = status;
  }
}

async function assertWorkspaceResourceAccess({
  workspaceId,
  user,
  multiUserMode,
}) {
  if (multiUserMode === false) return { ok: true };

  if (!user?.id) {
    return { ok: false, status: 401, error: "Unauthenticated" };
  }

  if (user.role === "admin") return { ok: true };

  const membership = await prisma.workspace_users.findFirst({
    where: { workspace_id: Number(workspaceId), user_id: Number(user.id) },
    select: { id: true },
  });

  if (membership) return { ok: true };

  return {
    ok: false,
    status: 403,
    error: "Forbidden: not a workspace member",
  };
}

module.exports = {
  WorkspaceAccessError,
  assertWorkspaceResourceAccess,
};
