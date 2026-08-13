const fs = require("fs");
const path = require("path");
function filterActorsByPermission(actors, user) {
  if (!user || user.role === "admin") return actors;
  return actors.filter((actor) =>
    user.workspaceSlugs.includes(actor.workspaceSlug)
  );
}

function redactForRole(actor, role) {
  if (!actor) return actor;
  if (role === "admin" || role === "manager") return { ...actor };

  const redacted = { ...actor };
  if (typeof redacted.speechBubble === "string" && redacted.speechBubble) {
    redacted.speechBubble =
      redacted.speechBubble.length > 50
        ? `${redacted.speechBubble.slice(0, 50)}...`
        : redacted.speechBubble;
  }
  return redacted;
}

function filterLinksByPermission(links, visibleActorIds) {
  if (!links || !visibleActorIds) return [];
  return links.filter(
    (link) =>
      visibleActorIds.has(link.source) && visibleActorIds.has(link.target)
  );
}

function filterMetricsByPermission(metricActors, user) {
  if (!metricActors) return [];
  const visibleActors =
    user?.role === "admin"
      ? metricActors
      : metricActors.filter(
          (actor) =>
            !actor.workspaceSlug ||
            user?.workspaceSlugs?.includes(actor.workspaceSlug)
        );
  return visibleActors.map(({ workspaceSlug, ...actor }) => actor);
}

function resolveOfficeUserInfo({
  user = null,
  multiUserMode = true,
  workspaceSlugs = [],
} = {}) {
  if (!multiUserMode && !user) {
    return { role: "admin", workspaceSlugs: [] };
  }

  if (!user) return null;
  return {
    role: user.role || "default",
    workspaceSlugs,
  };
}

function officeEndpoints(app, officeProjection) {
  if (!app) return;
  const { validatedRequest } = require("../utils/middleware/validatedRequest");

  app.get("/office/events", [validatedRequest], async (request, response) => {
    const user = request.user || response.locals?.user || null;
    const prisma = require("../utils/prisma");
    const multiUserMode = response.locals?.multiUserMode !== false;
    let workspaceSlugs = [];

    if (user && multiUserMode && user.role !== "admin") {
      try {
        const memberships = await prisma.workspace_users.findMany({
          where: { user_id: user.id },
          include: { workspace: { select: { slug: true } } },
        });
        workspaceSlugs = memberships
          .map((membership) => membership.workspace?.slug)
          .filter(Boolean);
      } catch {
        workspaceSlugs = [];
      }
    }

    const userInfo = resolveOfficeUserInfo({
      user,
      multiUserMode,
      workspaceSlugs,
    });
    if (!userInfo) {
      return response.status(401).json({ error: "Unauthorized" });
    }
    const userRole = userInfo.role;

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    const sendEvent = (eventName, data) => {
      response.write(`event: ${eventName}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    if (officeProjection) {
      const snapshot = officeProjection.getSnapshot();
      const visibleActors = filterActorsByPermission(
        snapshot.actors,
        userInfo
      ).map((actor) => redactForRole(actor, userRole));
      const visibleActorIds = new Set(visibleActors.map((actor) => actor.id));
      sendEvent("office.snapshot", {
        actors: visibleActors,
        links: filterLinksByPermission(snapshot.links, visibleActorIds),
        layout: snapshot.layout,
      });
    }

    const {
      officeEventEmitter,
    } = require("../utils/office/officeEventEmitter");
    const handler = (eventName, eventData) => {
      try {
        let payload = eventData;

        if (
          eventName === "office.actor.updated" ||
          eventName === "office.actor.online"
        ) {
          const workspaceSlug =
            payload?.actor?.workspaceSlug ||
            payload?.workspaceSlug ||
            officeProjection?.registry?.getActor(payload?.actorId)
              ?.workspaceSlug;
          if (
            workspaceSlug &&
            userRole !== "admin" &&
            !workspaceSlugs.includes(workspaceSlug)
          ) {
            return;
          }

          if (payload.actor) {
            payload = {
              ...payload,
              actor: redactForRole(payload.actor, userRole),
            };
          } else if (payload.patch) {
            payload = {
              ...payload,
              patch: redactForRole(payload.patch, userRole),
            };
          }
        }

        if (eventName === "office.actor.offline") {
          if (
            payload?.workspaceSlug &&
            userRole !== "admin" &&
            !workspaceSlugs.includes(payload.workspaceSlug)
          ) {
            return;
          }
        }

        if (eventName === "office.link.updated" && payload?.links) {
          const visibleActors = filterActorsByPermission(
            officeProjection?.registry?.getAllActors?.() || [],
            userInfo
          );
          const visibleActorIds = new Set(
            visibleActors.map((actor) => actor.id)
          );
          payload = {
            ...payload,
            links: filterLinksByPermission(payload.links, visibleActorIds),
          };
        }

        if (eventName === "office.metrics" && payload?.actors) {
          payload = {
            ...payload,
            actors: filterMetricsByPermission(payload.actors, userInfo),
          };
        }

        sendEvent(eventName, payload);
      } catch {}
    };

    officeEventEmitter.subscribe(handler);

    const heartbeat = setInterval(() => {
      try {
        sendEvent("ping", { timestamp: Date.now() });
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    request.on("close", () => {
      clearInterval(heartbeat);
      officeEventEmitter.unsubscribe(handler);
    });
  });

  app.get("/office/layout", [validatedRequest], (_request, response) => {
    try {
      const configPath = path.resolve(
        __dirname,
        "../config/office-layout.json"
      );
      const raw = fs.readFileSync(configPath, "utf-8");
      return response.status(200).json(JSON.parse(raw));
    } catch {
      return response
        .status(500)
        .json({ error: "Failed to load layout config" });
    }
  });
}

module.exports = {
  filterActorsByPermission,
  redactForRole,
  filterLinksByPermission,
  filterMetricsByPermission,
  resolveOfficeUserInfo,
  officeEndpoints,
};
