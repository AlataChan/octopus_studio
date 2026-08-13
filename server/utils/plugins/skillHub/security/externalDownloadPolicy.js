class SkillHubPolicyError extends Error {
  constructor(message, { statusCode = 422, code = "SKILL_HUB_POLICY" } = {}) {
    super(message);
    this.name = "SkillHubPolicyError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function externalDownloadsEnabled() {
  return "SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED" in process.env;
}

function externalDownloadsAllowAll() {
  return process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED === "allow_all";
}

function assertExternalDownloadsEnabled({
  operation = "external operation",
} = {}) {
  if (externalDownloadsEnabled()) return;
  throw new SkillHubPolicyError(
    `Skill Hub external downloads are not enabled. The system administrator must enable this feature manually by setting SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED (or allow_all) before this instance can ${operation}.`,
    { code: "SKILL_HUB_EXTERNAL_DOWNLOADS_DISABLED", statusCode: 422 }
  );
}

function assertVerifiedOrAllowAll(
  item,
  { operation = "install this Skill" } = {}
) {
  if (externalDownloadsAllowAll()) return;
  if (item?.verified === true) return;
  throw new SkillHubPolicyError(
    `External Skill ${operation} is limited to verified items only. Set SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED=allow_all to allow unverified external Skills.`,
    { code: "SKILL_HUB_VERIFIED_ONLY", statusCode: 422 }
  );
}

function assertArbitraryGitHubUrlAllowed({ verified = false } = {}) {
  assertExternalDownloadsEnabled({ operation: "download external Skills" });

  if (externalDownloadsAllowAll()) return;
  if (verified === true) return;

  throw new SkillHubPolicyError(
    "Creating a Skill from an arbitrary GitHub URL requires SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED=allow_all (or a verified source).",
    { code: "SKILL_HUB_ALLOW_ALL_REQUIRED", statusCode: 422 }
  );
}

module.exports = {
  SkillHubPolicyError,
  externalDownloadsEnabled,
  externalDownloadsAllowAll,
  assertExternalDownloadsEnabled,
  assertVerifiedOrAllowAll,
  assertArbitraryGitHubUrlAllowed,
};
