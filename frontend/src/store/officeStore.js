import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";

enableMapSet();

const defaultState = {
  actors: new Map(),
  actorPhases: new Map(),
  actorPhaseTokens: new Map(),
  links: [],
  layout: null,
  selectedActorId: null,
  connectionStatus: "disconnected",
  reconnectAttempt: 0,
  connectVersion: 0,
};

function bumpActorPhaseToken(state, actorId) {
  const nextToken = (state.actorPhaseTokens.get(actorId) || 0) + 1;
  state.actorPhaseTokens.set(actorId, nextToken);
  return nextToken;
}

export const useOfficeStore = create(
  immer((set, get) => ({
    ...defaultState,

    reset: () =>
      set((state) => {
        state.actors = new Map();
        state.actorPhases = new Map();
        state.actorPhaseTokens = new Map();
        state.links = [];
        state.layout = null;
        state.selectedActorId = null;
        state.connectionStatus = "disconnected";
        state.reconnectAttempt = 0;
        state.connectVersion = 0;
      }),

    setConnectionStatus: (status) =>
      set((state) => {
        state.connectionStatus = status;
        if (status === "connected") state.reconnectAttempt = 0;
      }),

    applySnapshot: ({ actors = [], links = [], layout = null }) =>
      set((state) => {
        state.actors = new Map();
        state.actorPhases = new Map();
        state.actorPhaseTokens = new Map();
        for (const actor of actors) {
          state.actors.set(actor.id, actor);
          state.actorPhases.set(actor.id, "seated");
          state.actorPhaseTokens.set(actor.id, 1);
        }
        state.links = links;
        state.layout = layout;
        state.connectionStatus = "connected";
        state.reconnectAttempt = 0;
      }),

    updateActor: (actorId, patch) =>
      set((state) => {
        const actor = state.actors.get(actorId);
        if (actor) Object.assign(actor, patch);
      }),

    addActor: (actor) =>
      set((state) => {
        state.actors.set(actor.id, actor);
        state.actorPhases.set(actor.id, "entering");
        bumpActorPhaseToken(state, actor.id);
      }),

    removeActor: (actorId) =>
      set((state) => {
        state.actors.delete(actorId);
        state.actorPhases.delete(actorId);
        state.actorPhaseTokens.delete(actorId);
        if (state.selectedActorId === actorId) {
          state.selectedActorId = null;
        }
      }),

    setActorPhase: (actorId, phase) =>
      set((state) => {
        state.actorPhases.set(actorId, phase);
      }),

    beginRemoveActor: (actorId) =>
      set((state) => {
        state.actorPhases.set(actorId, "leaving");
        bumpActorPhaseToken(state, actorId);
      }),

    finalizeRemoveActor: (actorId, token) =>
      set((state) => {
        const currentToken = state.actorPhaseTokens.get(actorId);
        if (token !== undefined && token !== currentToken) return;

        state.actors.delete(actorId);
        state.actorPhases.delete(actorId);
        state.actorPhaseTokens.delete(actorId);
        if (state.selectedActorId === actorId) {
          state.selectedActorId = null;
        }
      }),

    getActorPhaseToken: (actorId) => get().actorPhaseTokens.get(actorId),

    setReconnectAttempt: (n) =>
      set((state) => {
        state.reconnectAttempt = n;
      }),

    retryConnection: () =>
      set((state) => {
        state.reconnectAttempt = 0;
        state.connectionStatus = "connecting";
        state.connectVersion += 1;
      }),

    updateLinks: (links) =>
      set((state) => {
        state.links = links || [];
      }),

    selectActor: (actorId) =>
      set((state) => {
        state.selectedActorId = actorId;
      }),
  }))
);
