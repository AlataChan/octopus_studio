const { ActorRegistry } = require("./actorRegistry");
const { officeEventEmitter } = require("./officeEventEmitter");

const COALESCE_MS = 100;
const METRICS_INTERVAL_MS = 30_000;
const STALE_CHECK_INTERVAL_MS = 60_000;
const METRICS_BATCH_SIZE = 5;

class OfficeProjection {
  constructor(dataSources) {
    this.dataSources = dataSources;
    this.registry = new ActorRegistry();
    this.layout = null;
    this._links = [];
    this._coalesceTimers = new Map();
    this._metricsTimer = null;
    this._staleTimer = null;
  }

  async bootstrap() {
    this.layout = this.dataSources.getLayout();
    await this.refreshAssistants({ emitEvents: false });

    this._metricsTimer = setInterval(() => {
      void this._syncMetrics();
    }, METRICS_INTERVAL_MS);
    this._staleTimer = setInterval(() => {
      this.registry.checkStale();
    }, STALE_CHECK_INTERVAL_MS);
    await this._syncMetrics();
  }

  async refreshAssistants({ emitEvents = true } = {}) {
    const [assistants, channelAccounts] = await Promise.all([
      this.dataSources.getAssistants(),
      this.dataSources.getChannelAccounts(),
    ]);

    const channelMap = new Map();
    for (const channelAccount of channelAccounts) {
      channelMap.set(channelAccount.workspaceSlug, channelAccount.channels);
    }

    const nextActors = assistants.map((assistant) => ({
      id: assistant.id,
      name: assistant.name,
      title: assistant.title || null,
      avatar: assistant.avatar,
      workspaceSlug: assistant.workspaceSlug,
      activeChannels: channelMap.get(assistant.workspaceSlug) || [],
    }));

    const nextActorIds = new Set(nextActors.map((actor) => actor.id));
    for (const actor of this.registry.getAllActors()) {
      if (!nextActorIds.has(actor.id)) {
        if (emitEvents) {
          this.handleActorOffline(actor.id);
        } else {
          this.registry.removeActor(actor.id);
        }
      }
    }

    for (const actorData of nextActors) {
      const existingActor = this.registry.getActor(actorData.id);
      if (!existingActor) {
        if (emitEvents) {
          this.handleActorOnline(actorData);
        } else {
          this.registry.registerActor(actorData);
        }
        continue;
      }

      const patch = {};
      if (existingActor.name !== actorData.name) patch.name = actorData.name;
      if (existingActor.title !== actorData.title)
        patch.title = actorData.title;
      if (existingActor.avatar !== actorData.avatar)
        patch.avatar = actorData.avatar;
      if (existingActor.workspaceSlug !== actorData.workspaceSlug) {
        patch.workspaceSlug = actorData.workspaceSlug;
      }
      if (
        JSON.stringify(existingActor.activeChannels || []) !==
        JSON.stringify(actorData.activeChannels || [])
      ) {
        patch.activeChannels = actorData.activeChannels;
      }

      if (Object.keys(patch).length === 0) continue;
      this.registry.updateActor(actorData.id, patch);
      if (emitEvents) {
        officeEventEmitter.emit("office.actor.updated", {
          actorId: actorData.id,
          workspaceSlug: patch.workspaceSlug || existingActor.workspaceSlug,
          patch,
        });
      }
    }
  }

  shutdown() {
    if (this._metricsTimer) clearInterval(this._metricsTimer);
    if (this._staleTimer) clearInterval(this._staleTimer);
    for (const timer of this._coalesceTimers.values()) {
      clearTimeout(timer);
    }
    this._coalesceTimers.clear();
  }

  getSnapshot({ maxActors = 200 } = {}) {
    return {
      actors: this.registry.getSnapshot({ maxActors }),
      links: this._links,
      layout: this.layout,
    };
  }

  handleInvocationStart(actorId, sessionId) {
    this.registry.addSession(actorId, sessionId, { status: "thinking" });
    this._scheduleEmit(actorId);
  }

  handleToolCall(actorId, sessionId, toolName) {
    this.registry.updateSession(actorId, sessionId, {
      status: "tool_calling",
      currentTool: toolName,
    });
    this._scheduleEmit(actorId);
  }

  handleSpeaking(actorId, sessionId, text) {
    const speechBubble =
      typeof text === "string" && text.length > 100
        ? `${text.slice(0, 100)}...`
        : text || null;
    this.registry.updateSession(actorId, sessionId, {
      status: "speaking",
      speechBubble,
    });
    this._scheduleEmit(actorId);
  }

  handleInvocationEnd(actorId, sessionId) {
    this.registry.removeSession(actorId, sessionId);
    this._scheduleEmit(actorId);
  }

  handleInvocationError(actorId, sessionId) {
    this.registry.updateSession(actorId, sessionId, { status: "error" });
    this._emitNow(actorId);
  }

  handleActorOnline(actorData) {
    const actor = this.registry.registerActor(actorData);
    officeEventEmitter.emit("office.actor.online", { actor });
  }

  handleActorOffline(actorId) {
    const actor = this.registry.getActor(actorId);
    const workspaceSlug = actor?.workspaceSlug || null;
    this.registry.removeActor(actorId);
    officeEventEmitter.emit("office.actor.offline", { actorId, workspaceSlug });
  }

  _emitNow(actorId) {
    if (this._coalesceTimers.has(actorId)) {
      clearTimeout(this._coalesceTimers.get(actorId));
      this._coalesceTimers.delete(actorId);
    }
    this._emitActorUpdate(actorId);
  }

  _scheduleEmit(actorId) {
    if (this._coalesceTimers.has(actorId)) {
      clearTimeout(this._coalesceTimers.get(actorId));
    }
    this._coalesceTimers.set(
      actorId,
      setTimeout(() => {
        this._coalesceTimers.delete(actorId);
        this._emitActorUpdate(actorId);
      }, COALESCE_MS)
    );
  }

  _emitActorUpdate(actorId) {
    const actor = this.registry.getActor(actorId);
    if (!actor) return;
    officeEventEmitter.emit("office.actor.updated", {
      actorId,
      workspaceSlug: actor.workspaceSlug,
      patch: {
        status: actor.status,
        currentTool: actor.currentTool,
        speechBubble: actor.speechBubble,
        lastSeenAt: actor.lastSeenAt,
        stale: actor.stale,
      },
    });
  }

  async _syncMetrics() {
    try {
      const { Workspace } = require("../../models/workspace");
      const {
        WorkspaceAgentInvocation,
      } = require("../../models/workspaceAgentInvocation");
      const { PerformanceStatsService } = require("../performanceStats");

      const workspaces = await Workspace.where();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const links = [];

      for (const workspace of workspaces) {
        try {
          const collaborationStats =
            await WorkspaceAgentInvocation.getCollaborationStats({
              workspaceId: workspace.id,
              startDate,
            });
          for (const collaboration of collaborationStats.collaborations || []) {
            links.push({
              id: `assistant:${collaboration.assistant1}-assistant:${collaboration.assistant2}`,
              source: String(collaboration.assistant1),
              target: String(collaboration.assistant2),
              type: "co_session",
              threadSlug: null,
              strength: Math.min((collaboration.sharedThreads || 1) / 10, 1),
              lastActiveAt: collaboration.lastCoOccurrence || Date.now(),
            });
          }
        } catch {}

        const workspaceActors = this.registry
          .getAllActors()
          .filter((actor) => actor.workspaceSlug === workspace.slug);

        for (
          let offset = 0;
          offset < workspaceActors.length;
          offset += METRICS_BATCH_SIZE
        ) {
          const batch = workspaceActors.slice(
            offset,
            offset + METRICS_BATCH_SIZE
          );
          await Promise.all(
            batch.map(async (actor) => {
              try {
                const assistantStats =
                  await PerformanceStatsService.getAssistantStats({
                    assistantId: actor.id,
                    period: "7d",
                  });
                const summary = assistantStats?.summary || {};
                const liveActor = this.registry.getActor(actor.id);
                if (liveActor) {
                  liveActor.metrics = {
                    totalInvocations: summary.total || 0,
                    successRate: summary.successRate || 0,
                    avgResponseTimeMs: summary.avgResponseTimeMs || 0,
                  };
                }
              } catch {}
            })
          );
        }
      }

      this._links = links;
      officeEventEmitter.emit("office.link.updated", { links });

      officeEventEmitter.emit("office.metrics", {
        actors: this.registry.getAllActors().map((actor) => ({
          actorId: actor.id,
          workspaceSlug: actor.workspaceSlug,
          metrics: actor.metrics,
        })),
      });
    } catch (error) {
      console.error("[OfficeProjection] _syncMetrics failed:", error.message);
    }
  }
}

module.exports = {
  COALESCE_MS,
  METRICS_INTERVAL_MS,
  STALE_CHECK_INTERVAL_MS,
  OfficeProjection,
};
