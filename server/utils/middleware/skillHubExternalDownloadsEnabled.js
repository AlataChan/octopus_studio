/**
 * Skill Hub external downloads gate.
 *
 * Similar to Community Hub: importing/downloading external Skills can lead to
 * supply-chain risk. This feature is disabled by default and must be enabled
 * explicitly by the system administrator.
 */
const { EventLogs } = require("../../models/eventLogs");

function skillHubExternalDownloadsEnabled(request, response, next) {
  if (!("SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED" in process.env)) {
    try {
      EventLogs.logEvent(
        "skill_hub_external_downloads_denied",
        {
          path: request?.path || request?.originalUrl || null,
          method: request?.method || null,
          reason: "SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED is unset",
        },
        response?.locals?.user?.id
      );
    } catch {
      // best-effort only
    }

    return response.status(422).json({
      error:
        "Skill Hub external downloads are not enabled. The system administrator must enable this feature manually by setting SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED (or allow_all) before this instance can download external Skills.",
    });
  }

  next();
}

module.exports = {
  skillHubExternalDownloadsEnabled,
};
