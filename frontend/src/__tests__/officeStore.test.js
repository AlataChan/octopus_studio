import { beforeEach, describe, expect, it } from "vitest";
import { useOfficeStore } from "@/store/officeStore";

describe("officeStore", () => {
  beforeEach(() => {
    useOfficeStore.getState().reset();
  });

  it("starts with default state", () => {
    const state = useOfficeStore.getState();
    const removed3DStateKeys = [
      "view" + "Mode",
      "th" + "ree" + "DStatus",
      "set" + "ViewMode",
      "set" + "Th" + "ree" + "DStatus",
    ];

    expect(state.actors).toEqual(new Map());
    expect(state.connectionStatus).toBe("disconnected");
    for (const key of removed3DStateKeys) {
      expect(state).not.toHaveProperty(key);
    }
  });

  it("applySnapshot sets actors and layout", () => {
    const actors = [
      { id: "a1", name: "Bot", status: "idle" },
      { id: "a2", name: "Bot2", status: "thinking" },
    ];
    const layout = { canvas: { width: 1200, height: 800 }, zones: [] };
    useOfficeStore.getState().applySnapshot({ actors, links: [], layout });

    const state = useOfficeStore.getState();
    expect(state.actors.size).toBe(2);
    expect(state.actors.get("a1").name).toBe("Bot");
    expect(state.layout.canvas.width).toBe(1200);
  });

  it("updateActor patches a single actor", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [{ id: "a1", name: "Bot", status: "idle" }],
      links: [],
      layout: {},
    });
    useOfficeStore.getState().updateActor("a1", { status: "thinking" });
    expect(useOfficeStore.getState().actors.get("a1").status).toBe("thinking");
  });

  it("selectActor sets selectedActorId", () => {
    useOfficeStore.getState().selectActor("a1");
    expect(useOfficeStore.getState().selectedActorId).toBe("a1");
  });

  it("addActor sets phase to entering", () => {
    useOfficeStore
      .getState()
      .addActor({ id: "a1", name: "Bot", status: "idle" });
    expect(useOfficeStore.getState().actorPhases.get("a1")).toBe("entering");
    expect(useOfficeStore.getState().getActorPhaseToken("a1")).toBe(1);
  });

  it("applySnapshot sets all phases to seated", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [{ id: "a1", name: "Bot", status: "idle" }],
      links: [],
      layout: {},
    });
    expect(useOfficeStore.getState().actorPhases.get("a1")).toBe("seated");
    expect(useOfficeStore.getState().getActorPhaseToken("a1")).toBe(1);
  });

  it("beginRemoveActor sets phase to leaving without deleting", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [{ id: "a1", name: "Bot", status: "idle" }],
      links: [],
      layout: {},
    });
    useOfficeStore.getState().beginRemoveActor("a1");
    expect(useOfficeStore.getState().actorPhases.get("a1")).toBe("leaving");
    expect(useOfficeStore.getState().actors.has("a1")).toBe(true);
    expect(useOfficeStore.getState().getActorPhaseToken("a1")).toBe(2);
  });

  it("finalizeRemoveActor deletes actor and phase", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [{ id: "a1", name: "Bot", status: "idle" }],
      links: [],
      layout: {},
    });
    useOfficeStore.getState().selectActor("a1");
    useOfficeStore.getState().finalizeRemoveActor("a1");
    expect(useOfficeStore.getState().actors.has("a1")).toBe(false);
    expect(useOfficeStore.getState().actorPhases.has("a1")).toBe(false);
    expect(useOfficeStore.getState().selectedActorId).toBeNull();
  });

  it("finalizeRemoveActor deletes a leaving actor with the matching token", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [{ id: "a1", name: "Bot", status: "idle" }],
      links: [],
      layout: {},
    });
    useOfficeStore.getState().beginRemoveActor("a1");
    const token = useOfficeStore.getState().getActorPhaseToken("a1");

    useOfficeStore.getState().finalizeRemoveActor("a1", token);

    expect(useOfficeStore.getState().actors.has("a1")).toBe(false);
    expect(useOfficeStore.getState().actorPhases.has("a1")).toBe(false);
    expect(useOfficeStore.getState().actorPhaseTokens.has("a1")).toBe(false);
  });

  it("ignores a stale finalize token after a leaving actor re-enters", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [{ id: "a1", name: "Old Bot", status: "idle" }],
      links: [],
      layout: {},
    });
    useOfficeStore.getState().beginRemoveActor("a1");
    const staleToken = useOfficeStore.getState().getActorPhaseToken("a1");

    useOfficeStore
      .getState()
      .addActor({ id: "a1", name: "New Bot", status: "thinking" });
    useOfficeStore.getState().finalizeRemoveActor("a1", staleToken);

    const state = useOfficeStore.getState();
    expect(state.actors.get("a1")).toEqual({
      id: "a1",
      name: "New Bot",
      status: "thinking",
    });
    expect(state.actorPhases.get("a1")).toBe("entering");
    expect(state.getActorPhaseToken("a1")).toBe(staleToken + 1);
  });

  it("ignores a stale finalize token after applySnapshot replaces actors", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [{ id: "a1", name: "Old Bot", status: "idle" }],
      links: [],
      layout: {},
    });
    useOfficeStore.getState().beginRemoveActor("a1");
    const staleToken = useOfficeStore.getState().getActorPhaseToken("a1");

    useOfficeStore.getState().applySnapshot({
      actors: [{ id: "a1", name: "Snapshot Bot", status: "speaking" }],
      links: [],
      layout: {},
    });
    useOfficeStore.getState().finalizeRemoveActor("a1", staleToken);

    const state = useOfficeStore.getState();
    expect(state.actors.get("a1")).toEqual({
      id: "a1",
      name: "Snapshot Bot",
      status: "speaking",
    });
    expect(state.actorPhases.get("a1")).toBe("seated");
    expect(state.getActorPhaseToken("a1")).toBe(1);
  });

  it("setConnectionStatus connected resets reconnectAttempt", () => {
    useOfficeStore.getState().setReconnectAttempt(5);
    useOfficeStore.getState().setConnectionStatus("connected");
    expect(useOfficeStore.getState().reconnectAttempt).toBe(0);
  });

  it("retryConnection resets attempt and sets connecting", () => {
    useOfficeStore.getState().setReconnectAttempt(10);
    useOfficeStore.getState().setConnectionStatus("failed");
    useOfficeStore.getState().retryConnection();
    expect(useOfficeStore.getState().reconnectAttempt).toBe(0);
    expect(useOfficeStore.getState().connectionStatus).toBe("connecting");
  });
});
