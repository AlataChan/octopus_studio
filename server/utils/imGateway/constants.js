const CHANNEL_PROVIDERS = Object.freeze(["feishu", "wecom"]);

const SESSION_SCOPES = Object.freeze({
  PER_CHANNEL_PEER: "per-channel-peer",
  PER_CHANNEL_SENDER: "per-channel-sender",
  PER_CHANNEL_ACCOUNT: "per-channel-account",
});

const COMMAND_POLICIES = Object.freeze({
  DENY_ALL: "deny_all",
  ALLOWLIST: "allowlist",
  INHERIT_WORKSPACE: "inherit_workspace",
});

const ERROR_TYPES = Object.freeze({
  NO_ROUTE: "NO_ROUTE",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  COMMAND_BLOCKED: "COMMAND_BLOCKED",
  AGENT_TIMEOUT: "AGENT_TIMEOUT",
  AGENT_ERROR: "AGENT_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  MESSAGE_TOO_LONG: "MESSAGE_TOO_LONG",
});

const DEFAULT_SECURITY_POLICY = Object.freeze({
  requireMention: false,
  commandPolicy: COMMAND_POLICIES.DENY_ALL,
  allowedCommands: [],
  maxMessageLength: 4000,
  permissionMode: "default",
});

const DEFAULT_QUEUE_CONFIG = Object.freeze({
  concurrency: Number(process.env.IM_GATEWAY_QUEUE_CONCURRENCY || 5),
  retryAttempts: Number(process.env.IM_GATEWAY_RETRY_ATTEMPTS || 3),
  retryBackoffMs: Number(process.env.IM_GATEWAY_RETRY_BACKOFF_MS || 1000),
});

module.exports = {
  CHANNEL_PROVIDERS,
  SESSION_SCOPES,
  COMMAND_POLICIES,
  ERROR_TYPES,
  DEFAULT_SECURITY_POLICY,
  DEFAULT_QUEUE_CONFIG,
};
