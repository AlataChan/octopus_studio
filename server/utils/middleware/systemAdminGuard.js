const { requireSystemAdmin } = require("../access/requireSystemAdmin");

async function systemAdminGuard(request, response, next) {
  let result;
  try {
    result = await requireSystemAdmin({
      user: response.locals?.user ?? request.user,
      multiUserMode: response.locals?.multiUserMode,
    });
  } catch (error) {
    console.error("[SystemAdminGuard] authorization check failed:", error);
    return response.status(500).json({
      success: false,
      error: "Internal error",
    });
  }

  if (!result.ok) {
    return response.status(result.status || 403).json({
      success: false,
      error: result.error || "Forbidden: system admin required",
    });
  }

  return next();
}

module.exports = {
  systemAdminGuard,
};
