const { reqBody } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { channelWebhookLimiter } = require("../middleware/rateLimiter");
const { imGatewayService } = require("../utils/imGateway");
const { runSecurityAudit } = require("../utils/imGateway/security/audit");
const { ChannelAccount } = require("../models/channelAccount");
const { ChannelBinding } = require("../models/channelBinding");
const { GatewayRuntime } = require("../models/gatewayRuntime");

function bearerToken(request) {
  const authHeader =
    typeof request?.header === "function"
      ? request.header("Authorization")
      : request?.headers?.authorization || request?.headers?.Authorization;
  if (!authHeader) return null;

  const [scheme, token] = String(authHeader).split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function configSnapshotRevision(accounts = [], bindings = []) {
  const timestamps = [...accounts, ...bindings]
    .map((item) => new Date(item?.updatedAt || item?.createdAt || 0).getTime())
    .filter((value) => Number.isFinite(value) && value > 0);

  if (timestamps.length === 0) return 1;
  return Math.max(...timestamps);
}

function imGatewayEndpoints(app) {
  if (!app) return;

  // WeCom URL verification uses GET with encrypted `echostr` in querystring.
  app.get(
    "/im-gateway/webhook/:provider/:accountId",
    [channelWebhookLimiter],
    async (request, response) => {
      try {
        const provider = String(request.params.provider || "").toLowerCase();
        const accountId = String(request.params.accountId || "");

        const verify = await imGatewayService.verifyWebhook({
          provider,
          accountId,
          request,
        });

        if (!verify.ok) {
          return response.status(200).send("success");
        }

        const result = await imGatewayService.acceptInbound({
          provider,
          accountId,
          rawEvent: { echostr: request.query?.echostr || null },
          query: request.query || {},
          request,
        });

        if (result.challenge) {
          return response.status(200).send(String(result.challenge));
        }

        return response.status(200).send("success");
      } catch (error) {
        console.error("[IMGateway] webhook GET endpoint error:", error);
        return response.status(200).send("success");
      }
    }
  );

  // Webhook endpoint: 必须快速返回，后续由异步队列处理
  app.post(
    "/im-gateway/webhook/:provider/:accountId",
    [channelWebhookLimiter],
    async (request, response) => {
      try {
        const provider = String(request.params.provider || "").toLowerCase();
        const accountId = String(request.params.accountId || "");

        const verify = await imGatewayService.verifyWebhook({
          provider,
          accountId,
          request,
        });

        if (!verify.ok) {
          // For provider webhooks, responding 200 prevents aggressive retries.
          return provider === "wecom"
            ? response.status(200).send("success")
            : response.status(200).json({ ok: true, ignored: true });
        }

        const result = await imGatewayService.acceptInbound({
          provider,
          accountId,
          rawEvent: request.body,
          query: request.query || {},
          request,
        });

        if (result.challenge) {
          return provider === "wecom"
            ? response.status(200).send(String(result.challenge))
            : response.status(200).json({ challenge: result.challenge });
        }

        return provider === "wecom"
          ? response.status(200).send("success")
          : response.status(200).json({
              ok: true,
              queued: result.queued === true,
            });
      } catch (error) {
        console.error("[IMGateway] webhook endpoint error:", error);
        return response.status(200).send("success");
      }
    }
  );

  // Accounts: Admin API
  app.get(
    "/im-gateway/accounts",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const provider = request.query.provider || null;
        const status = request.query.status || null;
        const accounts = await ChannelAccount.list({ provider, status });

        return response.status(200).json({
          success: true,
          accounts: accounts.map((account) => ChannelAccount.toPublic(account)),
        });
      } catch (error) {
        console.error("[IMGateway] list accounts error:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/im-gateway/accounts/upsert",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const {
          provider,
          accountId,
          secrets = {},
          status = "active",
          tokenExpiresAt = null,
        } = reqBody(request);

        if (!provider || !accountId) {
          return response.status(400).json({
            success: false,
            error: "provider and accountId are required",
          });
        }

        const account = await ChannelAccount.upsert({
          provider,
          accountId,
          secrets,
          status,
          tokenExpiresAt,
        });

        return response.status(200).json({
          success: true,
          account: ChannelAccount.toPublic(account),
        });
      } catch (error) {
        console.error("[IMGateway] upsert account error:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/im-gateway/accounts/:provider/:accountId",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const provider = String(request.params.provider || "").toLowerCase();
        const accountId = String(request.params.accountId || "");
        const account = await ChannelAccount.get({ provider, accountId });

        if (!account) {
          return response
            .status(404)
            .json({ success: false, error: "ACCOUNT_NOT_FOUND" });
        }

        return response.status(200).json({
          success: true,
          account: ChannelAccount.toPublic(account),
          secrets: ChannelAccount.parseSecrets(account),
        });
      } catch (error) {
        console.error("[IMGateway] get account error:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );

  // Bindings: Admin API
  app.get(
    "/im-gateway/bindings",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const provider = request.query.provider || null;
        const accountId = request.query.accountId || null;
        const enabled =
          request.query.enabled === undefined
            ? null
            : String(request.query.enabled) === "true";

        const bindings = await ChannelBinding.list({
          provider,
          accountId,
          enabled,
        });
        return response.status(200).json({ success: true, bindings });
      } catch (error) {
        console.error("[IMGateway] list bindings error:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/im-gateway/bindings/upsert",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const {
          id = null,
          provider,
          accountId,
          workspaceId,
          match = {},
          route = {},
          security = {},
          priority = 0,
          enabled = true,
        } = reqBody(request);

        if (!provider || !accountId || !workspaceId) {
          return response.status(400).json({
            success: false,
            error: "provider, accountId and workspaceId are required",
          });
        }

        const binding = await ChannelBinding.upsert({
          id,
          provider,
          accountId,
          workspaceId,
          match,
          route,
          security,
          priority,
          enabled,
        });

        return response.status(200).json({ success: true, binding });
      } catch (error) {
        console.error("[IMGateway] upsert binding error:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/im-gateway/health",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      return response.status(200).json({
        success: true,
        health: imGatewayService.getHealth(),
      });
    }
  );

  // Security audit (Phase 1 Gate)
  app.get(
    "/im-gateway/security-audit",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        const result = await runSecurityAudit();
        return response.status(200).json({ success: true, ...result });
      } catch (error) {
        console.error("[IMGateway] security audit error:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/im-gateway/runtimes",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        const runtimes = await GatewayRuntime.list();
        return response.status(200).json({ success: true, runtimes });
      } catch (error) {
        console.error("[IMGateway] list runtimes error:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/im-gateway/runtimes",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const {
          id = null,
          name,
          mode = "embedded",
          capabilities = {},
          metadata = {},
          authToken = null,
        } = reqBody(request);

        if (!name && !id) {
          return response
            .status(400)
            .json({ success: false, error: "name or id is required" });
        }

        const result = await GatewayRuntime.register({
          id,
          name,
          mode,
          capabilities,
          metadata,
          authToken,
        });

        return response.status(201).json({
          success: true,
          runtime: result.runtime,
          bootstrapToken: result.bootstrapToken,
        });
      } catch (error) {
        console.error("[IMGateway] create runtime error:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );

  app.post("/im-gateway/runtimes/:id/register", async (request, response) => {
    try {
      const runtimeId = String(request.params.id || "");
      const { bootstrapToken = null } = reqBody(request);

      if (!runtimeId || !bootstrapToken) {
        return response.status(400).json({
          success: false,
          error: "runtime id and bootstrapToken are required",
        });
      }

      const result = await GatewayRuntime.exchangeRegistration({
        runtimeId,
        bootstrapToken,
      });

      return response.status(200).json({
        success: true,
        runtime: result.runtime,
        accessToken: result.accessToken,
      });
    } catch (error) {
      const code = error?.message === "INVALID_RUNTIME_TOKEN" ? 401 : 500;
      return response
        .status(code)
        .json({ success: false, error: error.message });
    }
  });

  app.post("/im-gateway/runtimes/:id/heartbeat", async (request, response) => {
    try {
      const runtimeId = String(request.params.id || "");
      const accessToken = bearerToken(request);
      const { status = "healthy", metrics = {} } = reqBody(request);

      if (!runtimeId || !accessToken) {
        return response.status(400).json({
          success: false,
          error: "runtime id and bearer token are required",
        });
      }

      const runtime = await GatewayRuntime.markHeartbeat({
        runtimeId,
        accessToken,
        status,
        metrics,
      });

      return response.status(200).json({ success: true, runtime });
    } catch (error) {
      const code = error?.message === "INVALID_RUNTIME_TOKEN" ? 401 : 500;
      return response
        .status(code)
        .json({ success: false, error: error.message });
    }
  });

  app.get("/im-gateway/runtimes/:id/config", async (request, response) => {
    try {
      const runtimeId = String(request.params.id || "");
      const accessToken = bearerToken(request);
      const runtime = await GatewayRuntime.authorize({
        runtimeId,
        accessToken,
      });

      if (!runtime) {
        return response
          .status(401)
          .json({ success: false, error: "INVALID_RUNTIME_TOKEN" });
      }

      const accounts = await ChannelAccount.list({ status: "active" });
      const bindings = await ChannelBinding.list({ enabled: true });
      const revision = configSnapshotRevision(accounts, bindings);

      return response.status(200).json({
        success: true,
        snapshot: {
          runtimeId,
          revision,
          etag: `W/"gwcfg-${revision}"`,
          generatedAt: new Date().toISOString(),
          accounts: accounts.map((account) => ({
            provider: account.provider,
            accountId: account.accountId,
            secrets: ChannelAccount.parseSecrets(account),
          })),
          bindings: bindings.map((binding) => ({
            id: binding.id,
            provider: binding.provider,
            accountId: binding.accountId,
            workspaceId: binding.workspaceId,
            match: binding.match || {},
            route: binding.route || {},
            security: binding.security || {},
          })),
          policy: {
            approvalMode: "workspace",
            defaultRateLimit: {},
          },
        },
      });
    } catch (error) {
      console.error("[IMGateway] runtime config error:", error);
      return response
        .status(500)
        .json({ success: false, error: error.message });
    }
  });

  app.post(
    "/im-gateway/runtimes/:id/rotate-token",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const runtimeId = String(request.params.id || "");
        const result = await GatewayRuntime.rotateToken(runtimeId);
        if (!result) {
          return response
            .status(404)
            .json({ success: false, error: "Runtime not found" });
        }

        return response.status(200).json({
          success: true,
          runtime: result.runtime,
          bootstrapToken: result.bootstrapToken,
        });
      } catch (error) {
        console.error("[IMGateway] rotate runtime token error:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );

  // 管理员查看运行时配置快照（使用用户 token 鉴权，无需 runtime token）
  app.get(
    "/im-gateway/runtimes/:id/config-admin",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const runtimeId = String(request.params.id || "");
        const runtime = await GatewayRuntime.get(runtimeId);

        if (!runtime) {
          return response
            .status(404)
            .json({ success: false, error: "RUNTIME_NOT_FOUND" });
        }

        const accounts = await ChannelAccount.list({ status: "active" });
        const bindings = await ChannelBinding.list({ enabled: true });
        const revision = configSnapshotRevision(accounts, bindings);

        return response.status(200).json({
          success: true,
          snapshot: {
            runtimeId,
            revision,
            etag: `W/"gwcfg-${revision}"`,
            generatedAt: new Date().toISOString(),
            accounts: (accounts || []).map((a) => ({
              provider: a.provider,
              accountId: a.accountId,
            })),
            bindings: (bindings || []).map((b) => ({
              id: b.id,
              provider: b.provider,
              accountId: b.accountId,
              workspaceId: b.workspaceId,
              priority: b.priority,
              enabled: b.enabled,
            })),
          },
        });
      } catch (error) {
        console.error("[IMGateway] admin config snapshot error:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message });
      }
    }
  );
}

module.exports = {
  imGatewayEndpoints,
};
