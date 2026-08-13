class SystemAdminRequiredError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = "SystemAdminRequiredError";
    this.status = status;
  }
}

async function requireSystemAdmin({ user, multiUserMode }) {
  if (multiUserMode === false) return { ok: true };

  if (!user?.id) {
    return { ok: false, status: 401, error: "Unauthenticated" };
  }

  if (user.role === "admin") return { ok: true };

  return {
    ok: false,
    status: 403,
    error: "Forbidden: system admin required",
  };
}

module.exports = {
  SystemAdminRequiredError,
  requireSystemAdmin,
};
