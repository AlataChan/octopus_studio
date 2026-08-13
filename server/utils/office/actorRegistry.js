const STATUS_PRIORITY = {
  error: 5,
  tool_calling: 4,
  speaking: 3,
  thinking: 2,
  idle: 1,
  offline: 0,
};

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

class ActorRegistry {
  constructor() {
    this.actors = new Map();
    this.sessions = new Map();
  }

  registerActor({
    id,
    name,
    title = null,
    avatar = null,
    workspaceSlug,
    activeChannels = [],
  }) {
    const actor = {
      id,
      name,
      title,
      avatar,
      workspaceSlug,
      zoneId: null,
      sources: {
        workspaceAssistantId: id,
        channelAgentIds: [],
        activeSessionIds: [],
      },
      status: "idle",
      currentTool: null,
      speechBubble: null,
      activeChannels,
      seat: null,
      movement: null,
      lastSeenAt: Date.now(),
      stale: false,
      metrics: {
        totalInvocations: 0,
        successRate: 0,
        avgResponseTimeMs: 0,
      },
    };
    this.actors.set(id, actor);
    this.sessions.set(id, new Map());
    return actor;
  }

  getActor(id) {
    return this.actors.get(id) || null;
  }

  updateActor(id, patch) {
    const actor = this.actors.get(id);
    if (!actor) return null;
    Object.assign(actor, patch);
    actor.lastSeenAt = Date.now();
    actor.stale = false;
    return actor;
  }

  addSession(actorId, sessionId, sessionState) {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    const actorSessions = this.sessions.get(actorId);
    actorSessions.set(sessionId, { ...sessionState });
    actor.sources.activeSessionIds = Array.from(actorSessions.keys());
    actor.lastSeenAt = Date.now();
    actor.stale = false;
    this._resolveStatus(actorId);
  }

  removeSession(actorId, sessionId) {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    const actorSessions = this.sessions.get(actorId);
    actorSessions?.delete(sessionId);
    actor.sources.activeSessionIds = Array.from(actorSessions?.keys() || []);
    this._resolveStatus(actorId);
  }

  updateSession(actorId, sessionId, patch) {
    const actorSessions = this.sessions.get(actorId);
    const session = actorSessions?.get(sessionId);
    if (!session) return;
    Object.assign(session, patch);
    const actor = this.actors.get(actorId);
    if (actor) {
      actor.lastSeenAt = Date.now();
      actor.stale = false;
    }
    this._resolveStatus(actorId);
  }

  _resolveStatus(actorId) {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    const actorSessions = this.sessions.get(actorId);
    if (!actorSessions || actorSessions.size === 0) {
      actor.status = "idle";
      actor.currentTool = null;
      actor.speechBubble = null;
      return;
    }

    let resolvedStatus = "idle";
    let resolvedTool = null;
    let resolvedBubble = null;
    let highestPriority = STATUS_PRIORITY.idle;

    for (const session of actorSessions.values()) {
      const priority = STATUS_PRIORITY[session.status] ?? 0;
      if (priority > highestPriority) {
        highestPriority = priority;
        resolvedStatus = session.status;
        resolvedTool = session.currentTool || null;
        resolvedBubble = session.speechBubble || null;
      }
    }

    actor.status = resolvedStatus;
    actor.currentTool = resolvedTool;
    actor.speechBubble = resolvedBubble;
  }

  removeActor(id) {
    this.actors.delete(id);
    this.sessions.delete(id);
  }

  checkStale() {
    const now = Date.now();
    for (const actor of this.actors.values()) {
      const actorSessions = this.sessions.get(actor.id);
      if (
        (!actorSessions || actorSessions.size === 0) &&
        now - actor.lastSeenAt > STALE_THRESHOLD_MS
      ) {
        actor.stale = true;
      }
    }
  }

  getSnapshot({ maxActors = 200 } = {}) {
    const actors = Array.from(this.actors.values());
    return actors.length <= maxActors ? actors : actors.slice(0, maxActors);
  }

  getAllActors() {
    return Array.from(this.actors.values());
  }

  get size() {
    return this.actors.size;
  }
}

module.exports = { ActorRegistry, STATUS_PRIORITY, STALE_THRESHOLD_MS };
