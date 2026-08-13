function checkCommandPolicy(message, binding) {
  const text = (message.textContent || "").trim();
  if (!text.startsWith("/")) return { blocked: false };

  const cmd = text.split(/\s/)[0];
  const security = binding.security || {};

  switch (security.commandPolicy) {
    case "deny_all":
      return { blocked: true, reason: "COMMAND_BLOCKED" };
    case "allowlist": {
      const allowed = security.allowedCommands || [];
      if (!allowed.includes(cmd)) return { blocked: true, reason: "COMMAND_BLOCKED" };
      return { blocked: false };
    }
    case "inherit_workspace":
    default:
      return { blocked: false };
  }
}

function checkMessageLength(message, binding) {
  const maxLen = binding.security?.maxMessageLength || 4000;
  if ((message.textContent || "").length > maxLen) {
    return { blocked: true, reason: "MESSAGE_TOO_LONG" };
  }
  return { blocked: false };
}

module.exports = { checkCommandPolicy, checkMessageLength };

