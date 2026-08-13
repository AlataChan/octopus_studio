import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ConnectionLine,
  DOTS_PER_LINK,
  getConnectionLineMotionKeys,
  shouldEnableLinkFlow,
  shouldRenderMessageDots,
} from "@/components/Office/Floor2D/ConnectionLine";
import FloorPlan from "@/components/Office/Floor2D/FloorPlan";
import OfficeView from "@/components/Office/OfficeView";
import OfficeMetricsBar, {
  getAnimatedNumberStartValue,
} from "@/components/Office/Panels/OfficeMetricsBar";
import { useOfficeStore } from "@/store/officeStore";
import { deriveAgentTargets } from "@/utils/office/deriveAgentTargets";
import { openFloorLayout } from "@/utils/office/openFloorLayout";

function syncServerSnapshot() {
  Object.assign(useOfficeStore.getInitialState(), useOfficeStore.getState());
}

function resetInitialSnapshot() {
  const initialState = useOfficeStore.getInitialState();
  initialState.actors = new Map();
  initialState.actorPhases = new Map();
  initialState.actorPhaseTokens = new Map();
  initialState.links = [];
  initialState.layout = null;
  initialState.selectedActorId = null;
  initialState.connectionStatus = "disconnected";
  initialState.reconnectAttempt = 0;
}

describe("office phase 3 motion contracts", () => {
  beforeEach(() => {
    useOfficeStore.getState().reset();
    resetInitialSnapshot();
  });

  afterEach(() => {
    resetInitialSnapshot();
  });

  it("renders connection lines as normalized draw-on paths with flow metadata", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <ConnectionLine
          x1={10}
          y1={20}
          x2={110}
          y2={120}
          strength={0.8}
          allowFlow
        />
      </svg>
    );

    expect(markup).toContain('class="office-connection-line-motion"');
    expect(markup).toContain('pathLength="1"');
    expect(markup).toContain('stroke-dashoffset="1"');
    expect(markup).toContain('data-flow-enabled="true"');
    expect(markup.match(/class="office-connection-message-dot"/g)).toHaveLength(
      DOTS_PER_LINK
    );
  });

  it("marks weak connection lines as static so they do not start flow loops", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <ConnectionLine
          x1={10}
          y1={20}
          x2={110}
          y2={120}
          strength={0.2}
          allowFlow
        />
      </svg>
    );

    expect(markup).toContain('data-flow-enabled="false"');
    expect(markup).not.toContain("office-connection-message-dot");
  });

  it("gates message dots off for reduced motion and mobile floors", () => {
    expect(
      shouldRenderMessageDots({
        flowEnabled: true,
        reduceMotion: false,
        isMobile: false,
      })
    ).toBe(true);
    expect(
      shouldRenderMessageDots({
        flowEnabled: true,
        reduceMotion: true,
        isMobile: false,
      })
    ).toBe(false);
    expect(
      shouldRenderMessageDots({
        flowEnabled: true,
        reduceMotion: false,
        isMobile: true,
      })
    ).toBe(false);
  });

  it("gates all link flow off for mobile floors", () => {
    expect(
      shouldEnableLinkFlow({
        reduceMotion: false,
        isMobile: false,
        isVisible: true,
        allowFlow: true,
        strength: 0.8,
      })
    ).toBe(true);
    expect(
      shouldEnableLinkFlow({
        reduceMotion: false,
        isMobile: true,
        isVisible: true,
        allowFlow: true,
        strength: 0.8,
      })
    ).toBe(false);
  });

  it("renders office metric values through animated counter targets", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [
        { id: "a1", name: "Online", status: "idle" },
        { id: "a2", name: "Busy", status: "thinking" },
      ],
      links: [],
      layout: { canvas: { width: 400, height: 280 }, zones: [] },
    });
    syncServerSnapshot();

    const markup = renderToStaticMarkup(<OfficeMetricsBar />);

    expect(markup).toContain('class="office-count-motion"');
    expect(markup).toContain('data-office-count-value="2"');
    expect(markup).toContain('data-office-count-label="Online"');
    expect(markup).toContain('data-office-count-label="Busy"');
  });

  it("adds a focus animation wrapper for selected avatar dimming", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [
        { id: "a1", name: "Selected Bot", status: "idle" },
        { id: "a2", name: "Dimmed Bot", status: "idle" },
      ],
      links: [],
      layout: {
        canvas: { width: 500, height: 320 },
        zones: [
          {
            id: "zone-default",
            type: "workspace",
            label: "Workspace",
            gridSize: [2, 1],
            position: { x: 20, y: 40 },
            size: { w: 320, h: 180 },
          },
        ],
      },
    });
    useOfficeStore.getState().selectActor("a1");
    syncServerSnapshot();

    const markup = renderToStaticMarkup(<FloorPlan />);

    expect(markup).toContain('class="office-avatar-focus"');
    expect(markup).toContain('data-selection-state="selected"');
    expect(markup).toContain('data-selection-state="dimmed"');
  });

  it("keeps snapshot stagger targets separate from avatar status motion targets", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [
        { id: "a1", name: "Thinking Bot", status: "thinking" },
        { id: "a2", name: "Speaking Bot", status: "speaking" },
      ],
      links: [],
      layout: {
        canvas: { width: 500, height: 320 },
        zones: [
          {
            id: "zone-default",
            type: "workspace",
            label: "Workspace",
            gridSize: [2, 1],
            position: { x: 20, y: 40 },
            size: { w: 320, h: 180 },
          },
        ],
      },
    });
    syncServerSnapshot();

    const markup = renderToStaticMarkup(<FloorPlan />);

    expect(markup).toContain('class="office-avatar-snapshot"');
    expect(markup).toContain('class="office-avatar-motion"');
    expect(markup).toContain(
      'class="office-avatar-snapshot"><g class="office-avatar-motion"'
    );
  });

  it("keeps connection draw-on identity stable for strength-only updates", () => {
    const weak = getConnectionLineMotionKeys({
      x1: 10,
      y1: 20,
      x2: 110,
      y2: 120,
      strength: 0.2,
    });
    const strong = getConnectionLineMotionKeys({
      x1: 10,
      y1: 20,
      x2: 110,
      y2: 120,
      strength: 0.9,
    });
    const moved = getConnectionLineMotionKeys({
      x1: 12,
      y1: 20,
      x2: 110,
      y2: 120,
      strength: 0.9,
    });

    expect(strong.drawKey).toBe(weak.drawKey);
    expect(strong.flowKey).not.toBe(weak.flowKey);
    expect(moved.drawKey).not.toBe(strong.drawKey);
  });

  it("continues metric counter tweens from the rendered value", () => {
    expect(getAnimatedNumberStartValue("17", 4)).toBe(17);
    expect(getAnimatedNumberStartValue(" 8 ", 4)).toBe(8);
    expect(getAnimatedNumberStartValue("not-a-number", 4)).toBe(4);
  });

  it("renders the office as a single 2D floor without view toggles", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [{ id: "a1", name: "Floor Bot", status: "idle" }],
      links: [],
      layout: {
        canvas: { width: 500, height: 320 },
        zones: [
          {
            id: "zone-default",
            type: "workspace",
            label: "Workspace",
            gridSize: [1, 1],
            position: { x: 20, y: 40 },
            size: { w: 180, h: 140 },
          },
        ],
      },
    });
    syncServerSnapshot();

    const markup = renderToStaticMarkup(<OfficeView />);

    expect(markup).toContain('data-office-floor-motion-root="true"');
    expect(markup).not.toContain(">2D<");
    expect(markup).not.toContain(">3D<");
    expect(markup).not.toContain("3D view unavailable");
  });

  it("renders an open floor with home pads instead of zones or desks", () => {
    useOfficeStore.getState().applySnapshot({
      actors: [
        { id: "a1", name: "Open Bot", status: "idle" },
        { id: "a2", name: "Anchor Bot", status: "idle" },
      ],
      links: [],
      layout: {
        canvas: { width: 500, height: 320 },
        zones: [
          {
            id: "zone-default",
            type: "workspace",
            label: "Workspace",
            gridSize: [2, 1],
            position: { x: 20, y: 40 },
            size: { w: 320, h: 180 },
          },
        ],
        furniture: [
          { type: "coffee-machine", position: { x: 70, y: 260 } },
        ],
      },
    });
    syncServerSnapshot();

    const markup = renderToStaticMarkup(<FloorPlan />);

    expect(markup).toContain('data-office-home-pad="true"');
    expect(markup).not.toContain("WORKSPACE");
    expect(markup).not.toContain("coffee-machine");
  });

  it("passes collaboration targets to linked avatars while home pads remain anchored", () => {
    const canvas = { width: 500, height: 320 };
    const links = [
      { id: "link-a1-a2", source: "a1", target: "a2", strength: 0.8 },
    ];
    useOfficeStore.getState().applySnapshot({
      actors: [
        { id: "a1", name: "Walk Bot", status: "idle" },
        { id: "a2", name: "Meet Bot", status: "idle" },
      ],
      links,
      layout: {
        canvas,
        zones: [],
      },
    });
    syncServerSnapshot();

    const { anchors } = openFloorLayout(["a1", "a2"], new Map(), canvas);
    const targets = deriveAgentTargets(["a1", "a2"], links, anchors, canvas);
    const targetA = targets.get("a1");
    const anchorA = anchors.get("a1");
    const markup = renderToStaticMarkup(<FloorPlan />);

    expect(markup).toContain('data-office-home-pad="true"');
    expect(markup).toContain(`translate(${anchorA.x},${anchorA.y})`);
    expect(markup).toContain('data-collaborating="true"');
    expect(markup).toContain(`data-target-x="${targetA.targetX}"`);
    expect(markup).toContain(`data-target-y="${targetA.targetY}"`);
    expect(targetA.targetX).not.toBe(anchorA.x);
  });
});
