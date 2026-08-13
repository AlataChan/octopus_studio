import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FloorPlan from "@/components/Office/Floor2D/FloorPlan";
import {
  ActorAvatar,
  getAvatarEdgeTarget,
  getAvatarDriftConfig,
  shouldRunAvatarDrift,
} from "@/components/Office/Floor2D/ActorAvatar";
import { useOfficeStore } from "@/store/officeStore";

describe("office avatar motion scaffolding", () => {
  function resetInitialSnapshot() {
    const initialState = useOfficeStore.getInitialState();
    initialState.actors = new Map();
    initialState.actorPhases = new Map();
    initialState.actorPhaseTokens = new Map();
    initialState.links = [];
    initialState.layout = null;
    initialState.selectedActorId = null;
  }

  beforeEach(() => {
    useOfficeStore.getState().reset();
    resetInitialSnapshot();
  });

  afterEach(() => {
    resetInitialSnapshot();
  });

  it("marks the outer group as the GSAP-owned position node", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <ActorAvatar
          x={120}
          y={80}
          actor={{ id: "a1", name: "Motion Bot", status: "idle" }}
        />
      </svg>
    );

    expect(markup).toContain('data-office-avatar-position="true"');
    expect(markup).toContain('data-target-x="120"');
    expect(markup).toContain('data-target-y="80"');
    expect(markup).not.toContain('transform="translate(120,80)"');
    expect(markup).toContain('class="office-avatar-motion"');
  });

  it("marks real speech content as a collaboration bubble while collaborating", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <ActorAvatar
          x={120}
          y={80}
          collaborating
          actor={{
            id: "a1",
            name: "Motion Bot",
            status: "idle",
            speechBubble: "Checking the order path",
          }}
        />
      </svg>
    );

    expect(markup).toContain('class="office-avatar-speech-bubble"');
    expect(markup).toContain('data-office-collaboration-bubble="true"');
    expect(markup).toContain("Checking the order path");
  });

  it("computes leaving edge targets from the current world position", () => {
    const rightEdge = getAvatarEdgeTarget(420, 160, {
      width: 500,
      height: 320,
    });
    const topEdge = getAvatarEdgeTarget(250, 20, {
      width: 500,
      height: 320,
    });

    expect(rightEdge).toEqual({ x: 572, y: 160 });
    expect(topEdge).toEqual({ x: 250, y: -72 });
  });

  it("builds deterministic drift parameters and halves amplitude on mobile", () => {
    const desktop = getAvatarDriftConfig("agent-alpha", false);
    const repeat = getAvatarDriftConfig("agent-alpha", false);
    const mobile = getAvatarDriftConfig("agent-alpha", true);

    expect(repeat).toEqual(desktop);
    expect(desktop.amplitudeX).toBe(6);
    expect(desktop.amplitudeY).toBe(6);
    expect(mobile.amplitudeX).toBe(3);
    expect(mobile.amplitudeY).toBe(3);
    expect(desktop.periodX).toBeGreaterThanOrEqual(6);
    expect(desktop.periodX).toBeLessThanOrEqual(9);
    expect(desktop.periodY).toBeGreaterThanOrEqual(6);
    expect(desktop.periodY).toBeLessThanOrEqual(9);
    expect(desktop.periodX).not.toBe(desktop.periodY);
  });

  it("only starts drift for positioned seated avatars with motion enabled", () => {
    expect(
      shouldRunAvatarDrift({
        phase: "seated",
        reduceMotion: false,
        hasPositioned: true,
        collaborating: false,
      })
    ).toBe(true);
    expect(
      shouldRunAvatarDrift({
        phase: "seated",
        reduceMotion: true,
        hasPositioned: true,
        collaborating: false,
      })
    ).toBe(false);
    expect(
      shouldRunAvatarDrift({
        phase: "entering",
        reduceMotion: false,
        hasPositioned: true,
        collaborating: false,
      })
    ).toBe(false);
    expect(
      shouldRunAvatarDrift({
        phase: "seated",
        reduceMotion: false,
        hasPositioned: false,
        collaborating: false,
      })
    ).toBe(false);
    expect(
      shouldRunAvatarDrift({
        phase: "seated",
        reduceMotion: false,
        hasPositioned: true,
        collaborating: true,
      })
    ).toBe(false);
  });

  it("marks the floor svg as the scoped root for first snapshot stagger", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [{ id: "a1", name: "Motion Bot", status: "idle" }],
      links: [],
      layout: {
        canvas: { width: 400, height: 280 },
        zones: [
          {
            id: "zone-default",
            type: "workspace",
            label: "Workspace",
            gridSize: [2, 1],
            position: { x: 20, y: 40 },
            size: { w: 260, h: 160 },
          },
        ],
      },
    });
    Object.assign(useOfficeStore.getInitialState(), useOfficeStore.getState());

    const markup = renderToStaticMarkup(<FloorPlan />);

    expect(markup).toContain('data-office-floor-motion-root="true"');
    expect(markup).toContain('class="office-avatar-motion"');
  });
});
