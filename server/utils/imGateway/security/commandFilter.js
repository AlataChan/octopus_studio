const {
  COMMAND_POLICIES,
  DEFAULT_SECURITY_POLICY,
  ERROR_TYPES,
} = require("../constants");

function extractSlashCommand(text = "") {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("/")) return null;
  const command = trimmed.split(/\s+/)[0];
  return command.toLowerCase();
}

function normalizeAllowedCommands(input = []) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean)
    .map((item) => (item.startsWith("/") ? item : `/${item}`));
}

function evaluateCommandPolicy({ textContent, security = {} }) {
  const merged = {
    ...DEFAULT_SECURITY_POLICY,
    ...(security || {}),
  };

  const command = extractSlashCommand(textContent);
  if (!command) {
    return { allowed: true, command: null };
  }

  const policy = String(merged.commandPolicy || COMMAND_POLICIES.DENY_ALL);
  const allowedCommands = normalizeAllowedCommands(merged.allowedCommands);

  if (policy === COMMAND_POLICIES.INHERIT_WORKSPACE) {
    return { allowed: true, command };
  }

  if (policy === COMMAND_POLICIES.DENY_ALL) {
    return {
      allowed: false,
      command,
      errorType: ERROR_TYPES.COMMAND_BLOCKED,
      reason: "COMMAND_POLICY_DENY_ALL",
    };
  }

  if (policy === COMMAND_POLICIES.ALLOWLIST) {
    const allowed =
      allowedCommands.includes(command) || allowedCommands.includes("/*");
    if (!allowed) {
      return {
        allowed: false,
        command,
        errorType: ERROR_TYPES.COMMAND_BLOCKED,
        reason: "COMMAND_NOT_IN_ALLOWLIST",
      };
    }
  }

  return { allowed: true, command };
}

module.exports = {
  extractSlashCommand,
  evaluateCommandPolicy,
};
