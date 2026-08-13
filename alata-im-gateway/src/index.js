require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const pino = require("pino");

const { initDatabase, getDbPath } = require("./db/init");
const { FeishuAdapter } = require("./adapters/FeishuAdapter");
const { FeishuLongConnAdapter } = require("./adapters/FeishuLongConnAdapter");
const { WeComAdapter } = require("./adapters/WeComAdapter");
const { AlataClient } = require("./client/AlataClient");
const { SessionManager } = require("./session/SessionManager");
const { BindingMatcher } = require("./router/BindingMatcher");
const { loadBindings } = require("./router/bindings");
const { createMessageQueue } = require("./queue/MessageQueue");
const {
  checkCommandPolicy,
  checkMessageLength,
} = require("./security/commandFilter");
const { parseApprovalCommand } = require("./security/approvalCommands");
const { checkRateLimit } = require("./security/rateLimiter");
const { AuditLogger } = require("./audit/AuditLogger");
const { createAdminRouter } = require("./admin/routes");
const {
  getGatewayConfigMode,
  loadManagedAccounts,
  loadManagedSnapshot,
  saveManagedSnapshot,
} = require("./runtime/configStore");

function createLogger(env = process.env) {
  return pino({
    name: "gateway",
    level: env.LOG_LEVEL || "info",
    redact: {
      paths: [
        "*.appSecret",
        "*.secret",
        "*.encryptKey",
        "*.encrypt_key",
        "*.token",
        "*.verificationToken",
        "*.verification_token",
        "*.signingSecret",
        "*.corpSecret",
      ],
      censor: "[REDACTED]",
    },
    ...(env.NODE_ENV !== "production"
      ? { transport: { target: "pino-pretty" } }
      : {}),
  });
}

function isDesktopRuntime(env = process.env) {
  return String(env.ANYTHING_LLM_RUNTIME || "").toLowerCase() === "desktop";
}

function isPlaceholderSecret(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    normalized.includes("change-me") ||
    normalized.includes("changeme") ||
    normalized.startsWith("your-") ||
    normalized.includes("example") ||
    normalized.includes("placeholder")
  );
}

function assertProductionAdminSecret(env = process.env) {
  if (env.NODE_ENV !== "production" || isDesktopRuntime(env)) return;

  const secret = String(env.ADMIN_SECRET || "").trim();
  const hint = "Generate one with: openssl rand -hex 32";
  if (!secret) {
    throw new Error(`ADMIN_SECRET is required in production. ${hint}`);
  }

  if (isPlaceholderSecret(secret)) {
    throw new Error(
      `ADMIN_SECRET must be a real secret in production; placeholder values are rejected. ${hint}`
    );
  }
}

function resolveGatewayHost(env = process.env) {
  const configuredHost = env.GATEWAY_HOST;
  if (configuredHost && configuredHost.trim()) {
    return configuredHost.trim();
  }

  if (isDesktopRuntime(env)) {
    return "127.0.0.1";
  }

  return undefined;
}

function formatListenAddress(host, port) {
  return `${host || "default"}:${port}`;
}

function createAlataClient(env = process.env) {
  return new AlataClient({
    baseUrl: env.ALATA_BASE_URL || "http://localhost:3001",
    apiKey: env.ALATA_API_KEY || "",
    internalSecret: env.ALATA_INTERNAL_SECRET || "",
  });
}

function checkGatewayDataPermissions(env, logger) {
  if (env.NODE_ENV !== "production") return;

  try {
    const dbPath = getDbPath(env);
    const dataDir = path.dirname(dbPath);
    const targets = [dataDir, dbPath].filter((target) => fs.existsSync(target));
    if (targets.some((target) => (fs.statSync(target).mode & 0o077) !== 0)) {
      logger.warn("gateway data files are world/group readable; chmod 0600 recommended");
    }
  } catch {
    // Permission checks are best-effort and must not block startup.
  }
}

function createAdaptersFromEnv(env, logger) {
  const adapters = {};

  if (env.FEISHU_APP_ID) {
    const deliveryMode = String(env.FEISHU_DELIVERY_MODE || "webhook").toLowerCase();
    const secrets = {
      appId: env.FEISHU_APP_ID,
      appSecret: env.FEISHU_APP_SECRET,
      verificationToken: env.FEISHU_VERIFICATION_TOKEN,
      signingSecret: env.FEISHU_SIGNING_SECRET,
      encryptKey: env.FEISHU_ENCRYPT_KEY,
    };

    if (deliveryMode === "longconn") {
      if (!secrets.appSecret) {
        throw new Error("Missing FEISHU_APP_SECRET for Feishu long-connection mode");
      }
      adapters.feishu = new FeishuLongConnAdapter({
        accountId: env.FEISHU_APP_ID,
        secrets,
        options: {
          logLevel: env.FEISHU_LONGCONN_LOG_LEVEL || "info",
          autoReconnect: env.FEISHU_LONGCONN_AUTO_RECONNECT !== "false",
          readyTimeoutMs: parseInt(env.FEISHU_LONGCONN_READY_TIMEOUT_MS || "15000", 10),
        },
      });
      logger.info("Feishu adapter initialized (long-connection mode)");
    } else {
      adapters.feishu = new FeishuAdapter({
        accountId: env.FEISHU_APP_ID,
        secrets,
      });
      logger.info("Feishu adapter initialized");
    }
  }

  if (env.WECOM_CORP_ID) {
    adapters.wecom = new WeComAdapter({
      accountId: env.WECOM_CORP_ID,
      secrets: {
        corpId: env.WECOM_CORP_ID,
        agentId: env.WECOM_AGENT_ID,
        corpSecret: env.WECOM_SECRET,
        token: env.WECOM_TOKEN,
        encodingAesKey: env.WECOM_ENCODING_AES_KEY,
      },
    });
    logger.info("WeCom adapter initialized");
  }

  return adapters;
}

function createAdaptersFromManagedSnapshot(env, logger) {
  const adapters = {};
  const accounts = loadManagedAccounts(env);

  for (const account of accounts) {
    const provider = String(account?.provider || "").toLowerCase();
    if (!provider || adapters[provider]) continue;

    if (provider === "feishu") {
      const deliveryMode = String(account?.secrets?.deliveryMode || "webhook").toLowerCase();
      const secrets = {
        appId: account?.secrets?.appId || account.accountId,
        appSecret: account?.secrets?.appSecret,
        verificationToken: account?.secrets?.verificationToken,
        signingSecret: account?.secrets?.signingSecret,
        encryptKey: account?.secrets?.encryptKey,
      };

      if (deliveryMode === "longconn") {
        if (!secrets.appSecret) {
          throw new Error("Missing Feishu appSecret for managed long-connection mode");
        }
        adapters.feishu = new FeishuLongConnAdapter({
          accountId: account.accountId,
          secrets,
          options: {
            logLevel: account?.secrets?.longConn?.logLevel || "info",
            autoReconnect: account?.secrets?.longConn?.autoReconnect !== false,
          },
        });
        logger.info({ accountId: account.accountId }, "Managed Feishu adapter initialized (long-connection mode)");
      } else {
        adapters.feishu = new FeishuAdapter({
          accountId: account.accountId,
          secrets,
        });
        logger.info({ accountId: account.accountId }, "Managed Feishu adapter initialized");
      }
      continue;
    }

    if (provider === "wecom") {
      adapters.wecom = new WeComAdapter({
        accountId: account.accountId,
        secrets: {
          corpId: account?.secrets?.corpId || account.accountId,
          agentId: account?.secrets?.agentId,
          corpSecret:
            account?.secrets?.corpSecret || account?.secrets?.secret,
          token: account?.secrets?.token,
          encodingAesKey:
            account?.secrets?.encodingAesKey ||
            account?.secrets?.encodingAESKey,
        },
      });
      logger.info({ accountId: account.accountId }, "Managed WeCom adapter initialized");
    }
  }

  return adapters;
}

async function refreshManagedSnapshot({ env, alataClient, logger }) {
  const mode = getGatewayConfigMode(env);
  if (mode !== "managed") return null;

  const runtimeId = env.ALATA_GATEWAY_RUNTIME_ID || null;
  const runtimeToken = env.ALATA_GATEWAY_RUNTIME_TOKEN || null;
  const cached = loadManagedSnapshot(env);

  if (!runtimeId || !runtimeToken) {
    return cached;
  }

  try {
    const response = await alataClient.fetchRuntimeConfig({
      runtimeId,
      runtimeToken,
      etag: cached?.etag || env.ALATA_GATEWAY_RUNTIME_ETAG || null,
    });

    if (response?.notModified) return cached;
    if (response?.config) {
      return saveManagedSnapshot(response, env);
    }
  } catch (error) {
    logger.warn(
      { error: error?.message || String(error) },
      "Failed to refresh managed config snapshot"
    );
    if (cached) return cached;
  }

  return cached;
}

async function processMessage({
  message,
  binding,
  adapters,
  alataClient,
  sessionManager,
  logger,
}) {
  const t0 = Date.now();
  const adapter = adapters[message.provider];
  if (!adapter) {
    logger.warn({ provider: message.provider }, "No adapter configured");
    return;
  }

  const peer = {
    provider: message.provider,
    accountId: message.accountId,
    peerType: message.peerType,
    peerId: message.peerId,
    senderId: message.senderId,
  };

  try {
    const approvalCmd = parseApprovalCommand(message.textContent);
    const cmdCheck = checkCommandPolicy(message, binding);
    if (cmdCheck.blocked) {
      await adapter.sendErrorFeedback(peer, cmdCheck.reason);
      AuditLogger.record({
        provider: message.provider,
        eventId: message.eventId,
        direction: "inbound",
        bindingId: binding.id,
        peerId: message.peerId,
        senderId: message.senderId,
        workspaceSlug: binding.route.workspaceSlug,
        threadSlug: null,
        status: "filtered",
        errorType: cmdCheck.reason,
        latencyMs: Date.now() - t0,
      });
      return;
    }

    const lenCheck = checkMessageLength(message, binding);
    if (lenCheck.blocked) {
      await adapter.sendErrorFeedback(peer, lenCheck.reason);
      AuditLogger.record({
        provider: message.provider,
        eventId: message.eventId,
        direction: "inbound",
        bindingId: binding.id,
        peerId: message.peerId,
        senderId: message.senderId,
        workspaceSlug: binding.route.workspaceSlug,
        threadSlug: null,
        status: "filtered",
        errorType: lenCheck.reason,
        latencyMs: Date.now() - t0,
      });
      return;
    }

    if (approvalCmd) {
      if (approvalCmd.error === "INVALID_ID") {
        await adapter.sendTextReply(
          peer,
          `用法：${approvalCmd.cmd} <id> [原因]\n例如：${approvalCmd.cmd} 123 同意`
        );
        return;
      }

      if (approvalCmd.action === "approve") {
        await alataClient.approveConfirmation(
          approvalCmd.confirmationId,
          approvalCmd.reason || ""
        );
        await adapter.sendTextReply(
          peer,
          `✅ 已批准审批 ${approvalCmd.confirmationId}${approvalCmd.reason ? `（原因：${approvalCmd.reason}）` : ""}`
        );
      } else {
        await alataClient.rejectConfirmation(
          approvalCmd.confirmationId,
          approvalCmd.reason || ""
        );
        await adapter.sendTextReply(
          peer,
          `⛔ 已拒绝审批 ${approvalCmd.confirmationId}${approvalCmd.reason ? `（原因：${approvalCmd.reason}）` : ""}`
        );
      }

      AuditLogger.record({
        provider: message.provider,
        eventId: message.eventId,
        direction: "inbound",
        bindingId: binding.id,
        peerId: message.peerId,
        senderId: message.senderId,
        workspaceSlug: binding.route.workspaceSlug,
        threadSlug: null,
        status: "ok",
        errorType: null,
        latencyMs: Date.now() - t0,
      });
      return;
    }

    const threadSlug = await sessionManager.getOrCreateThread(
      message,
      binding,
      alataClient
    );

    let runId = null;
    try {
      const created = await alataClient.createRun({
        threadId: threadSlug,
        workspaceSlug: binding.route.workspaceSlug,
        triggerType: "im",
        triggerId: message.eventId,
        initialInput: message.textContent,
      });
      runId = created?.runId || null;
    } catch (err) {
      logger.warn({ err }, "Failed to create run (non-fatal)");
    }

    const response = await alataClient.streamChatFull(
      binding.route.workspaceSlug,
      threadSlug,
      message.textContent
    );

    if (!response.textResponse) throw new Error("Empty response from Alata");

    await adapter.sendTextReply(peer, response.textResponse);

    try {
      await alataClient.reportImReply({
        runId,
        threadId: threadSlug,
        text: response.textResponse,
      });
    } catch (err) {
      logger.warn({ err }, "Failed to report IM reply (non-fatal)");
    }

    AuditLogger.record({
      provider: message.provider,
      eventId: message.eventId,
      direction: "inbound",
      bindingId: binding.id,
      peerId: message.peerId,
      senderId: message.senderId,
      workspaceSlug: binding.route.workspaceSlug,
      threadSlug,
      status: "ok",
      errorType: null,
      latencyMs: Date.now() - t0,
    });
  } catch (error) {
    logger.error({ err: error, messageId: message.messageId }, "Message processing failed");
    await adapter.sendErrorFeedback(peer, "AGENT_ERROR").catch(() => {});
    AuditLogger.record({
      provider: message.provider,
      eventId: message.eventId,
      direction: "inbound",
      bindingId: binding.id,
      peerId: message.peerId,
      senderId: message.senderId,
      workspaceSlug: binding.route.workspaceSlug,
      threadSlug: null,
      status: "error",
      errorType: error.message,
      latencyMs: Date.now() - t0,
    });
  }
}

async function createApp({ env = process.env, logger = createLogger(env) } = {}) {
  assertProductionAdminSecret(env);
  initDatabase({ env });
  checkGatewayDataPermissions(env, logger);

  const alataClient = createAlataClient(env);
  const mode = getGatewayConfigMode(env);
  const sessionManager = new SessionManager();

  const runtimeSnapshot = await refreshManagedSnapshot({
    env,
    alataClient,
    logger,
  });

  const adapters =
    mode === "managed"
      ? createAdaptersFromManagedSnapshot(env, logger)
      : createAdaptersFromEnv(env, logger);

  const queue = createMessageQueue({
    concurrency: parseInt(env.GATEWAY_QUEUE_CONCURRENCY || "20", 10),
    handler: (payload) =>
      processMessage({
        ...payload,
        adapters,
        alataClient,
        sessionManager,
        logger,
      }),
  });

  function handleInboundMessage(message) {
    const adapter = adapters[message.provider];
    if (!adapter) {
      logger.warn({ provider: message.provider }, "No adapter configured");
      return;
    }

    const rate = checkRateLimit(message);
    if (rate.limited) {
      const peer = {
        provider: message.provider,
        accountId: message.accountId,
        peerType: message.peerType,
        peerId: message.peerId,
        senderId: message.senderId,
      };
      adapter
        .sendErrorFeedback(peer, "RATE_LIMITED")
        .catch((error) => logger.error({ err: error }, "rate-limit feedback failed"));
      return;
    }

    const bindings = loadBindings({ env, mode }).filter((b) => b.channel === message.provider);
    const binding = new BindingMatcher(bindings).match(message);
    if (!binding) {
      logger.warn(
        { provider: message.provider, peerId: message.peerId },
        "No binding found for inbound message"
      );
      return;
    }

    queue.push(message, binding).catch((error) => logger.error({ err: error }, "queue push failed"));
  }

  const startables = Object.values(adapters).filter((adapter) => typeof adapter.start === "function");
  for (const adapter of startables) {
    await adapter
      .start({ onMessage: handleInboundMessage, logger })
      .catch((error) =>
        logger.error({ err: error, accountId: adapter.accountId }, "Adapter start failed")
      );
  }

  const app = express();
  let healthLastErrorWarningLogged = false;

  app.use(
    express.text({
      type: ["text/*", "application/xml", "application/*+xml"],
      verify(req, _res, buf) {
        req.rawBody = buf.toString();
      },
    })
  );

  app.use(
    express.json({
      verify(req, _res, buf) {
        req.rawBody = buf.toString();
      },
    })
  );
  app.use(express.urlencoded({ extended: false }));

  app.post("/webhook/feishu", async (req, res) => {
    const adapter = adapters.feishu;
    if (!adapter) return res.status(404).json({ error: "Feishu not configured" });

    if (!adapter.verifyWebhook(req)) {
      logger.warn("Feishu webhook verification failed");
      return res.status(200).end();
    }

    const message = adapter.parseEvent(req.body);
    if (message?.type === "challenge") {
      return res.json({ challenge: message.challenge });
    }
    if (!message) return res.status(200).end();

    if (adapter.isDuplicate(message.eventId)) return res.status(200).end();
    adapter.markSeen(message.eventId);

    res.status(200).end();
    handleInboundMessage(message);
  });

  app.get("/webhook/wecom", async (req, res) => {
    const adapter = adapters.wecom;
    if (!adapter) return res.status(404).end();

    const { echostr } = req.query || {};
    if (echostr && adapter.verifyWebhook(req)) {
      const decrypted = adapter._aesDecrypt(echostr);
      if (decrypted) return res.send(decrypted);
    }
    return res.status(200).end();
  });

  app.post("/webhook/wecom", async (req, res) => {
    const adapter = adapters.wecom;
    if (!adapter) return res.status(404).end();

    if (!adapter.verifyWebhook(req)) {
      logger.warn("WeCom webhook verification failed");
      return res.status(200).end();
    }

    const message = await adapter.parseEvent(req.body);
    if (!message) return res.status(200).end();

    if (adapter.isDuplicate(message.eventId)) return res.status(200).end();
    adapter.markSeen(message.eventId);

    res.status(200).end();
    handleInboundMessage(message);
  });

  app.use("/admin", createAdminRouter({ env }));

  app.get("/health", async (_req, res) => {
    const alataOk = await alataClient.healthCheck();
    const adapterStatus = Object.values(adapters).map((adapter) =>
      typeof adapter.getStatus === "function"
        ? adapter.getStatus()
        : { provider: adapter.provider, mode: "webhook" }
    );
    if (
      env.NODE_ENV === "production" &&
      !healthLastErrorWarningLogged &&
      adapterStatus.some((status) => status.lastError)
    ) {
      healthLastErrorWarningLogged = true;
      logger.warn("Adapter lastError is exposed in /health without redaction");
    }
    res.json({
      status: alataOk ? "ok" : "degraded",
      mode,
      adapters: Object.keys(adapters),
      queueDepth: queue.depth,
      alataConnected: alataOk,
      snapshotRevision: runtimeSnapshot?.revision || null,
      adapterStatus,
    });
  });

  return { app, adapters, mode, queue, alataClient, runtimeSnapshot, startables, handleInboundMessage };
}

async function shutdownAdapters(adapters, server, logger) {
  if (server?.close) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      // server.close() only stops accepting NEW connections; it then waits for
      // every existing connection to end. Idle HTTP keep-alive sockets (the
      // desktop server holds these) won't close until their keep-alive timeout,
      // so close() would hang ~5s on quit until the parent SIGKILLs us. Destroy
      // lingering sockets immediately so close() resolves in milliseconds.
      server.closeAllConnections?.();
    });
  }

  const startables = Object.values(adapters || {}).filter((adapter) => typeof adapter.stop === "function");
  for (const adapter of startables) {
    await adapter
      .stop()
      .catch((error) =>
        logger?.error?.({ err: error, accountId: adapter.accountId }, "Adapter stop failed")
      );
  }
}

async function start({ env = process.env, logger = createLogger(env) } = {}) {
  const { app, adapters } = await createApp({ env, logger });
  const port = parseInt(env.GATEWAY_PORT || "3100", 10);
  const host = resolveGatewayHost(env);

  return new Promise((resolve) => {
    const onListening = () => {
      logger.info(
        `alata-im-gateway listening on ${formatListenAddress(host, port)}`
      );
      resolve(server);
    };
    const server = host
      ? app.listen(port, host, onListening)
      : app.listen(port, onListening);
    let isShuttingDown = false;
    const shutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      logger.info({ signal }, "shutting down...");
      process.off("SIGTERM", onSigterm);
      process.off("SIGINT", onSigint);
      // Hard cap on quit latency. Graceful cleanup (draining the HTTP server,
      // closing the Feishu long-conn WS) can hang on lingering sockets; when the
      // whole app is quitting we don't need a clean drain, just a prompt exit.
      // NOT unref'd, and we process.exit() explicitly after cleanup, so the
      // process always terminates within ~700ms instead of waiting for the
      // parent's SIGKILL (which was the 5s "hang on quit").
      const hardExit = setTimeout(() => {
        logger.warn("graceful shutdown slow, forcing exit");
        process.exit(process.exitCode ?? 0);
      }, 700);
      try {
        await shutdownAdapters(adapters, server, logger);
        process.exitCode = 0;
      } catch (error) {
        logger.error({ err: error }, "shutdown failed");
        process.exitCode = 1;
      } finally {
        clearTimeout(hardExit);
        process.exit(process.exitCode ?? 0);
      }
    };
    const onSigterm = () => shutdown("SIGTERM");
    const onSigint = () => shutdown("SIGINT");
    process.on("SIGTERM", onSigterm);
    process.on("SIGINT", onSigint);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  assertProductionAdminSecret,
  createApp,
  resolveGatewayHost,
  shutdownAdapters,
  start,
};
