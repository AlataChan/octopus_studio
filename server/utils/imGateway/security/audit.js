const { ChannelAccount } = require("../../../models/channelAccount");
const { ChannelBinding } = require("../../../models/channelBinding");
const { EncryptionManager } = require("../../EncryptionManager");
const { RATE_LIMIT_CONFIG } = require("../../../middleware/rateLimiter");

function countBySeverity(issues = []) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const issue of issues) {
    const sev = String(issue?.severity || "").toLowerCase();
    if (sev === "high") counts.high += 1;
    else if (sev === "medium") counts.medium += 1;
    else counts.low += 1;
  }
  return counts;
}

function pushIssue(issues, issue) {
  if (!issue) return;
  issues.push({
    id: issue.id || `${issue.code || "ISSUE"}:${Date.now()}:${Math.random()}`,
    severity: issue.severity || "medium",
    code: issue.code || "UNKNOWN",
    title: issue.title || "Security audit issue",
    detail: issue.detail || "",
    remediation: issue.remediation || "",
    provider: issue.provider || null,
    accountId: issue.accountId || null,
    bindingId: issue.bindingId || null,
    workspaceId: issue.workspaceId || null,
    metadata: issue.metadata || null,
  });
}

function hasAny(obj, keys = []) {
  if (!obj || typeof obj !== "object") return false;
  for (const key of keys) {
    if (obj[key]) return true;
  }
  return false;
}

function includesWildcard(list = []) {
  if (!Array.isArray(list)) return false;
  return list.includes("*") || list.includes("/*");
}

async function runSecurityAudit() {
  const issues = [];

  // 0) Encryption material
  if (process.env.NODE_ENV === "production") {
    if (!process.env.SIG_KEY || !process.env.SIG_SALT) {
      pushIssue(issues, {
        severity: "high",
        code: "ENCRYPTION_KEY_MISSING",
        title: "Encryption keys are not set in production",
        detail:
          "Missing SIG_KEY/SIG_SALT may cause secrets to rotate unexpectedly across restarts.",
        remediation:
          "Set SIG_KEY and SIG_SALT in the environment for stable encryption at rest.",
      });
    }
  }

  // 1) Channel accounts: webhook verification + credential presence
  const encryption = new EncryptionManager();
  const accounts = await ChannelAccount.list();
  for (const account of accounts) {
    const provider = String(account.provider || "").toLowerCase();
    const accountId = String(account.accountId || "");

    const decrypted = encryption.decrypt(account.encryptedSecrets);
    if (!decrypted) {
      pushIssue(issues, {
        severity: "high",
        code: "ACCOUNT_SECRETS_DECRYPT_FAILED",
        title: "Channel account secrets cannot be decrypted",
        detail: `provider=${provider}, accountId=${accountId}`,
        remediation:
          "Re-save the account secrets via admin API after ensuring SIG_KEY/SIG_SALT are stable.",
        provider,
        accountId,
      });
      continue;
    }

    let secrets = {};
    try {
      secrets = JSON.parse(decrypted);
    } catch {
      pushIssue(issues, {
        severity: "high",
        code: "ACCOUNT_SECRETS_INVALID_JSON",
        title: "Channel account secrets are not valid JSON",
        detail: `provider=${provider}, accountId=${accountId}`,
        remediation:
          "Re-save the account secrets via admin API using a JSON object payload.",
        provider,
        accountId,
      });
      secrets = {};
    }

    if (provider === "feishu") {
      if (!secrets.appId || !secrets.appSecret) {
        pushIssue(issues, {
          severity: "high",
          code: "FEISHU_APP_CREDENTIALS_MISSING",
          title: "Feishu app credentials missing",
          detail:
            "Feishu requires appId/appSecret for tenant access token refresh.",
          remediation:
            "Set secrets.appId and secrets.appSecret for this account.",
          provider,
          accountId,
        });
      }

      if (!hasAny(secrets, ["verificationToken", "signingSecret"])) {
        pushIssue(issues, {
          severity: "high",
          code: "FEISHU_WEBHOOK_VERIFICATION_MISSING",
          title: "Feishu webhook verification is not configured",
          detail:
            "Missing verificationToken/signingSecret means inbound events cannot be verified.",
          remediation:
            "Set secrets.verificationToken (recommended) or secrets.signingSecret (HMAC) for this account.",
          provider,
          accountId,
        });
      }

      if (!secrets.encryptKey) {
        pushIssue(issues, {
          severity: "low",
          code: "FEISHU_ENCRYPT_KEY_MISSING",
          title: "Feishu encryptKey not configured",
          detail:
            "If encrypted event callbacks are enabled in Feishu, encryptKey is required to decrypt payloads.",
          remediation:
            "If you enable encrypted callbacks, set secrets.encryptKey and ensure your parser supports it.",
          provider,
          accountId,
        });
      }
    }

    if (provider === "wecom") {
      const missing = [];
      if (!secrets.corpId) missing.push("corpId");
      if (!secrets.secret) missing.push("secret");
      if (!secrets.agentId) missing.push("agentId");
      if (!secrets.token) missing.push("token");
      if (!secrets.encodingAESKey) missing.push("encodingAESKey");

      if (missing.length > 0) {
        pushIssue(issues, {
          severity: "high",
          code: "WECOM_CREDENTIALS_MISSING",
          title: "WeCom credentials missing",
          detail: `Missing: ${missing.join(", ")}`,
          remediation:
            "Set WeCom secrets (corpId/secret/agentId/token/encodingAESKey) for this account.",
          provider,
          accountId,
        });
      }
    }
  }

  // 2) Bindings: route scope + open access + dangerous permissionMode
  const bindings = await ChannelBinding.list();
  for (const binding of bindings) {
    if (binding.enabled === false) continue;
    const provider = String(binding.provider || "").toLowerCase();

    const match = binding.match || {};
    const route = binding.route || {};
    const security = binding.security || {};
    const triggerType = String(match.triggerType || "message");

    const senderAllowlist = Array.isArray(match.senderAllowlist)
      ? match.senderAllowlist
      : [];

    if (triggerType === "menu_action") {
      if (!match.eventKey) {
        pushIssue(issues, {
          severity: "high",
          code: "MENU_BINDING_EVENT_KEY_MISSING",
          title: "Menu action binding is missing eventKey",
          detail:
            "A menu_action binding without eventKey cannot deterministically match a Feishu menu callback.",
          remediation:
            "Set a stable eventKey that matches the value configured in Feishu bot menu push-event actions.",
          provider,
          accountId: binding.accountId,
          bindingId: binding.id,
          workspaceId: binding.workspaceId,
        });
      }

      if (!route.assistantId && !route.agentId) {
        pushIssue(issues, {
          severity: "high",
          code: "MENU_BINDING_ROUTE_MISSING_ASSISTANT",
          title: "Menu action binding is missing assistant route",
          detail:
            "The binding defines a menu event but does not specify which assistant should handle it.",
          remediation: "Set route.assistantId for every menu_action binding.",
          provider,
          accountId: binding.accountId,
          bindingId: binding.id,
          workspaceId: binding.workspaceId,
        });
      }

      continue;
    }

    const isOpenPeer = !match.peerId || match.peerId === "*";
    const isOpenSender =
      senderAllowlist.length === 0 || includesWildcard(senderAllowlist);

    if (isOpenPeer && isOpenSender && security?.requireMention !== true) {
      pushIssue(issues, {
        severity: "high",
        code: "BINDING_OPEN_ACCESS",
        title: "Binding allows broad inbound access",
        detail:
          "peerId is wildcard and senderAllowlist is empty/wildcard while requireMention is false.",
        remediation:
          "Add senderAllowlist, enable requireMention for group chats, or narrow peerId to specific groups/users.",
        provider,
        accountId: binding.accountId,
        bindingId: binding.id,
        workspaceId: binding.workspaceId,
        metadata: { match, security },
      });
    }

    if (String(security.permissionMode || "default") === "bypass") {
      pushIssue(issues, {
        severity: "high",
        code: "BINDING_PERMISSION_BYPASS",
        title: "Binding uses permissionMode=bypass",
        detail:
          "bypass allows all tool calls without confirmation. This is unsafe for external channels.",
        remediation:
          "Use permissionMode=default or acceptEdits, and allow only necessary tools via assistant config.",
        provider,
        accountId: binding.accountId,
        bindingId: binding.id,
        workspaceId: binding.workspaceId,
      });
    }

    if (
      String(route.sessionScope || "per-channel-peer") === "per-channel-account"
    ) {
      pushIssue(issues, {
        severity: "medium",
        code: "SESSION_SCOPE_TOO_BROAD",
        title: "Session scope is too broad",
        detail:
          "per-channel-account shares one thread across the whole account and can cause cross-chat context leakage.",
        remediation:
          "Use per-channel-peer (default) or per-channel-sender if needed.",
        provider,
        accountId: binding.accountId,
        bindingId: binding.id,
        workspaceId: binding.workspaceId,
      });
    }

    if (String(security.commandPolicy || "deny_all") === "inherit_workspace") {
      pushIssue(issues, {
        severity: "medium",
        code: "COMMAND_POLICY_INHERIT_WORKSPACE",
        title: "commandPolicy inherits workspace policy",
        detail:
          "inherit_workspace may unintentionally allow commands that were not designed for external channels.",
        remediation:
          "Prefer deny_all or allowlist for external channels and explicitly list allowed commands.",
        provider,
        accountId: binding.accountId,
        bindingId: binding.id,
        workspaceId: binding.workspaceId,
      });
    }

    if (String(security.commandPolicy || "deny_all") === "allowlist") {
      const allowed = Array.isArray(security.allowedCommands)
        ? security.allowedCommands
        : [];
      if (includesWildcard(allowed)) {
        pushIssue(issues, {
          severity: "high",
          code: "COMMAND_ALLOWLIST_WILDCARD",
          title: "allowedCommands contains wildcard",
          detail:
            "Wildcard commands effectively disable command protection for external channels.",
          remediation:
            "Remove wildcard entries and explicitly list allowed slash commands.",
          provider,
          accountId: binding.accountId,
          bindingId: binding.id,
          workspaceId: binding.workspaceId,
        });
      }
    }
  }

  // 3) Rate limiting visibility (not a failure, but surfaced to ops)
  pushIssue(issues, {
    severity: "low",
    code: "RATE_LIMIT_CONFIG",
    title: "Rate limit configuration snapshot",
    detail: `channelWebhookLimiter windowMs=${RATE_LIMIT_CONFIG.CHANNEL_WEBHOOK_WINDOW_MS}, max=${RATE_LIMIT_CONFIG.CHANNEL_WEBHOOK_MAX}`,
    remediation:
      "Tune RATE_LIMIT_CHANNEL_WEBHOOK_* and IM_GATEWAY_* env vars based on real traffic.",
    metadata: {
      channelWebhook: {
        windowMs: RATE_LIMIT_CONFIG.CHANNEL_WEBHOOK_WINDOW_MS,
        max: RATE_LIMIT_CONFIG.CHANNEL_WEBHOOK_MAX,
      },
      peerWindowMs: Number(process.env.IM_GATEWAY_PEER_WINDOW_MS || 60_000),
      peerMax: Number(process.env.IM_GATEWAY_PEER_MAX || 20),
      accountConcurrencyMax: Number(
        process.env.IM_GATEWAY_ACCOUNT_CONCURRENCY_MAX || 10
      ),
    },
  });

  const summary = countBySeverity(issues);
  return {
    ok: summary.high === 0,
    summary,
    issues,
    auditedAt: new Date().toISOString(),
  };
}

module.exports = { runSecurityAudit };
