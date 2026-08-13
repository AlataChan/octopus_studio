const { ActorRegistry } = require("../../utils/office/actorRegistry");

describe("ActorRegistry", () => {
  let registry;

  beforeEach(() => {
    registry = new ActorRegistry();
  });

  it("starts empty", () => {
    expect(registry.getSnapshot()).toEqual([]);
  });

  it("registers an actor with idle status", () => {
    registry.registerActor({
      id: "a1",
      name: "Assistant Alpha",
      avatar: null,
      workspaceSlug: "marketing",
      activeChannels: [],
    });
    const snapshot = registry.getSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].id).toBe("a1");
    expect(snapshot[0].status).toBe("idle");
    expect(snapshot[0].sources.activeSessionIds).toEqual([]);
  });

  it("updates actor status", () => {
    registry.registerActor({ id: "a1", name: "A", workspaceSlug: "ws" });
    registry.updateActor("a1", { status: "thinking" });
    expect(registry.getActor("a1").status).toBe("thinking");
  });

  it("resolves merged status from multiple sessions", () => {
    registry.registerActor({ id: "a1", name: "A", workspaceSlug: "ws" });
    registry.addSession("a1", "sess-1", { status: "speaking" });
    registry.addSession("a1", "sess-2", { status: "tool_calling" });
    expect(registry.getActor("a1").status).toBe("tool_calling");
  });

  it("returns to idle when all sessions end", () => {
    registry.registerActor({ id: "a1", name: "A", workspaceSlug: "ws" });
    registry.addSession("a1", "sess-1", { status: "thinking" });
    registry.removeSession("a1", "sess-1");
    expect(registry.getActor("a1").status).toBe("idle");
  });

  it("removes actor", () => {
    registry.registerActor({ id: "a1", name: "A", workspaceSlug: "ws" });
    registry.removeActor("a1");
    expect(registry.getSnapshot()).toEqual([]);
  });

  it("marks stale actors", () => {
    registry.registerActor({ id: "a1", name: "A", workspaceSlug: "ws" });
    const actor = registry.getActor("a1");
    actor.lastSeenAt = Date.now() - 6 * 60 * 1000;
    registry.checkStale();
    expect(registry.getActor("a1").stale).toBe(true);
  });

  it("getSnapshot respects maxActors limit", () => {
    for (let i = 0; i < 5; i++) {
      registry.registerActor({
        id: `a${i}`,
        name: `A${i}`,
        workspaceSlug: "ws",
      });
    }
    const result = registry.getSnapshot({ maxActors: 3 });
    expect(result).toHaveLength(3);
  });
});
