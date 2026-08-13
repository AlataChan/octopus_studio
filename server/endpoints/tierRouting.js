const crypto = require("crypto");
const prisma = require("../utils/prisma");
const { reqBody, userFromSession } = require("../utils/http");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  validateTierMap,
  TIER_ROUTING_ENABLED_LABEL,
  TIER_MAP_LABEL,
} = require("../utils/AiProviders/providerRouter/tierRouter");
const { getLLMProvider } = require("../utils/helpers");
const { EventLogs } = require("../models/eventLogs");

const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1_000;
const MODEL_VALIDATION_TIMEOUT_MS = 5_000;
const PREFLIGHT_TIMEOUT_MS = 20_000;

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((sorted, key) => {
      sorted[key] = sortValue(value[key]);
      return sorted;
    }, {});
}

function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function hashTierMap(map) {
  return sha256(canonicalJson(map));
}

function hashSnapshot({ affectedWorkspaceIds, optedOutWorkspaceIds }) {
  return sha256(
    canonicalJson({
      affectedWorkspaceIds: [...affectedWorkspaceIds].sort((a, b) => a - b),
      optedOutWorkspaceIds: [...optedOutWorkspaceIds].sort((a, b) => a - b),
    })
  );
}

function requestedTierMap(body) {
  return body?.tierMap ?? body?.model_tier_map ?? body?.modelTierMap ?? null;
}

function adminIdentity(user) {
  const id = Number(user?.id ?? 0);
  return Number.isFinite(id) ? id : 0;
}

async function currentSnapshot() {
  const [affected, optedOut] = await Promise.all([
    prisma.workspaces.findMany({
      where: { disableTierRouting: false },
      select: { id: true, chatProvider: true, chatModel: true },
    }),
    prisma.workspaces.findMany({
      where: { disableTierRouting: true },
      select: { id: true },
    }),
  ]);

  const affectedWorkspaceIds = affected
    .map((workspace) => Number(workspace.id))
    .sort((a, b) => a - b);
  const optedOutWorkspaceIds = optedOut
    .map((workspace) => Number(workspace.id))
    .sort((a, b) => a - b);

  return {
    affected,
    optedOut,
    affectedWorkspaceIds,
    optedOutWorkspaceIds,
    snapshotHash: hashSnapshot({
      affectedWorkspaceIds,
      optedOutWorkspaceIds,
    }),
  };
}

function tierRoutes(tierMap) {
  const routes = [];
  for (const [tier, route] of Object.entries(tierMap)) {
    routes.push({ tier, ...route });
  }
  return routes;
}

function withTimeout(operation, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([Promise.resolve(operation), timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function preflightRoute(route) {
  try {
    const connector = getLLMProvider({
      provider: route.provider,
      model: route.model,
    });
    if (typeof connector?.isValidChatCompletionModel === "function") {
      const valid = await withTimeout(
        connector.isValidChatCompletionModel(route.model),
        MODEL_VALIDATION_TIMEOUT_MS,
        `model validation timed out after ${MODEL_VALIDATION_TIMEOUT_MS}ms`
      );
      if (valid === false) {
        throw new Error("model is not valid for chat completion");
      }
    }
    return { ...route, ok: true };
  } catch (error) {
    return { ...route, ok: false, error: error.message };
  }
}

async function preflightTierMap(tierMap) {
  const routes = tierRoutes(tierMap);
  let diagnostics;
  try {
    diagnostics = await withTimeout(
      Promise.all(routes.map(preflightRoute)),
      PREFLIGHT_TIMEOUT_MS,
      `preflight timed out after ${PREFLIGHT_TIMEOUT_MS}ms`
    );
  } catch (error) {
    diagnostics = routes.map((route) => ({
      ...route,
      ok: false,
      error: error.message,
    }));
  }

  return {
    ok: diagnostics.every((diagnostic) => diagnostic.ok),
    diagnostics,
  };
}

async function writeAudit(tx, event, metadata, userId) {
  if (tx?.event_logs?.create) {
    await tx.event_logs.create({
      data: {
        event,
        metadata: JSON.stringify(metadata || {}),
        userId: userId ? Number(userId) : null,
        occurredAt: new Date(),
      },
    });
    return;
  }

  await EventLogs.logEvent(event, metadata, userId);
}

async function upsertSetting(tx, label, value) {
  await tx.system_settings.upsert({
    where: { label },
    update: { value: value === null ? null : String(value) },
    create: { label, value: value === null ? null : String(value) },
  });
}

function errorResponse(response, status, error, extra = {}) {
  return response.status(status).json({ success: false, error, ...extra });
}

function tierRoutingEndpoints(app) {
  if (!app) return;

  app.post(
    "/admin/tier-routing/preview",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const body = reqBody(request) || request.body || {};
        const tierMapInput = requestedTierMap(body);
        const validation = validateTierMap(tierMapInput, { mode: "chat" });
        if (!validation.ok) {
          return errorResponse(response, 400, "invalid tier map", {
            errors: validation.errors,
          });
        }

        const snapshot = await currentSnapshot();
        const adminUserId = adminIdentity(user);
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + PREVIEW_TOKEN_TTL_MS);
        const tierMapHash = hashTierMap(validation.map);
        const created = await prisma.tier_routing_preview_tokens.create({
          data: {
            token,
            adminUserId,
            tierMapHash,
            snapshotHash: snapshot.snapshotHash,
            expiresAt,
            consumedAt: null,
          },
        });

        return response.status(200).json({
          success: true,
          tierMap: validation.map,
          affectedWorkspaceIds: snapshot.affectedWorkspaceIds,
          optedOutWorkspaceIds: snapshot.optedOutWorkspaceIds,
          tierMapHash,
          snapshotHash: snapshot.snapshotHash,
          previewToken: created.token,
          expiresAt: created.expiresAt,
        });
      } catch (error) {
        console.error(error);
        return response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/tier-routing/enable",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const body = reqBody(request) || request.body || {};
        const { previewToken } = body;
        if (!previewToken) {
          return errorResponse(response, 400, "previewToken is required");
        }

        const validation = validateTierMap(requestedTierMap(body), {
          mode: "chat",
        });
        if (!validation.ok) {
          return errorResponse(response, 400, "invalid tier map", {
            errors: validation.errors,
          });
        }

        const tokenRow = await prisma.tier_routing_preview_tokens.findUnique({
          where: { token: previewToken },
        });
        if (!tokenRow) return errorResponse(response, 404, "preview token not found");
        if (tokenRow.consumedAt) {
          return errorResponse(response, 409, "preview token already consumed");
        }
        if (Number(tokenRow.adminUserId) !== adminIdentity(user)) {
          return errorResponse(
            response,
            400,
            "preview token was issued to a different requesting admin"
          );
        }
        if (new Date(tokenRow.expiresAt).getTime() <= Date.now()) {
          return errorResponse(response, 400, "preview token expired");
        }
        if (tokenRow.tierMapHash !== hashTierMap(validation.map)) {
          return errorResponse(response, 400, "tier map changed after preview");
        }

        const snapshot = await currentSnapshot();
        if (tokenRow.snapshotHash !== snapshot.snapshotHash) {
          return errorResponse(response, 409, "workspace snapshot changed");
        }

        const preflight = await preflightTierMap(validation.map);
        if (!preflight.ok) {
          return errorResponse(response, 400, "preflight failed", {
            diagnostics: preflight.diagnostics,
          });
        }

        try {
          await prisma.$transaction(async (tx) => {
            const consumed = await tx.tier_routing_preview_tokens.updateMany({
              where: { token: previewToken, consumedAt: null },
              data: { consumedAt: new Date() },
            });
            if (consumed.count !== 1) {
              const error = new Error("preview token already consumed");
              error.code = "TOKEN_CONSUMED";
              throw error;
            }

            await upsertSetting(tx, TIER_MAP_LABEL, canonicalJson(validation.map));
            await upsertSetting(tx, TIER_ROUTING_ENABLED_LABEL, "true");
            await writeAudit(
              tx,
              "tier_routing_enabled",
              {
                tierMap: validation.map,
                affectedWorkspaceIds: snapshot.affectedWorkspaceIds,
                optedOutWorkspaceIds: snapshot.optedOutWorkspaceIds,
              },
              user?.id
            );
          });
        } catch (error) {
          if (error.code === "TOKEN_CONSUMED") {
            return errorResponse(response, 409, "preview token already consumed");
          }
          throw error;
        }

        return response.status(200).json({
          success: true,
          diagnostics: preflight.diagnostics,
        });
      } catch (error) {
        console.error(error);
        return response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/tier-routing/disable",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        await prisma.$transaction(async (tx) => {
          await upsertSetting(tx, TIER_ROUTING_ENABLED_LABEL, "false");
          await writeAudit(tx, "tier_routing_disabled", {}, user?.id);
        });
        return response.status(200).json({ success: true });
      } catch (error) {
        console.error(error);
        return response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/tier-routing/bulk-optout",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const workspaceIds = [
          ...new Set(
            ((reqBody(request) || request.body || {}).workspaceIds || [])
              .map((id) => Number(id))
              .filter((id) => Number.isInteger(id) && id > 0)
          ),
        ];

        const existing = await prisma.workspaces.findMany({
          where: { id: { in: workspaceIds } },
          select: { id: true },
        });
        const existingIds = new Set(existing.map((workspace) => Number(workspace.id)));
        const missingWorkspaceIds = workspaceIds.filter((id) => !existingIds.has(id));
        if (missingWorkspaceIds.length) {
          return errorResponse(response, 400, "workspace ids not found", {
            missingWorkspaceIds,
          });
        }

        await prisma.$transaction(async (tx) => {
          const updated = await tx.workspaces.updateMany({
            where: { id: { in: workspaceIds } },
            data: { disableTierRouting: true },
          });
          if (updated.count !== workspaceIds.length) {
            const error = new Error("bulk opt-out update count mismatch");
            error.code = "BULK_OPTOUT_COUNT_MISMATCH";
            throw error;
          }
          await writeAudit(
            tx,
            "workspace_tier_routing_bulk_optout",
            { workspaceIds },
            user?.id
          );
        });

        return response.status(200).json({
          success: true,
          workspaceIds,
        });
      } catch (error) {
        if (error.code === "BULK_OPTOUT_COUNT_MISMATCH") {
          return errorResponse(response, 409, error.message);
        }
        console.error(error);
        return response.sendStatus(500).end();
      }
    }
  );
}

module.exports = {
  tierRoutingEndpoints,
  canonicalJson,
  hashTierMap,
  hashSnapshot,
};
