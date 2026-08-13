import { useEffect, useMemo, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useOfficeStore } from "@/store/officeStore";
import { deriveAgentTargets } from "@/utils/office/deriveAgentTargets";
import { openFloorLayout } from "@/utils/office/openFloorLayout";
import { ActorAvatar } from "./ActorAvatar";
import { ConnectionLine, MAX_FLOWING_LINKS } from "./ConnectionLine";
import { OFFICE_THEME } from "../theme";
import { useOfficeMotion } from "../motion/OfficeMotionProvider";

// The OfficeMotionProvider is supplied once at the OfficeView root so the header
// metrics/chips and the floor share a single matchMedia + gsap.defaults instance.
export default function FloorPlan() {
  return <FloorPlanContent />;
}

function actorPhaseSignature(actorPhases) {
  return Array.from(actorPhases.entries())
    .map(([actorId, phase]) => `${actorId}:${phase}`)
    .join("|");
}

function FloorPlanContent() {
  const actors = useOfficeStore((state) => state.actors);
  const actorPhases = useOfficeStore((state) => state.actorPhases);
  const links = useOfficeStore((state) => state.links);
  const layout = useOfficeStore((state) => state.layout);
  const selectedActorId = useOfficeStore((state) => state.selectedActorId);
  const selectActor = useOfficeStore((state) => state.selectActor);
  const svgRef = useRef(null);
  const hasSnapshotEntranceRef = useRef(false);
  const previousActorCountRef = useRef(0);
  const previousAnchorAssignmentRef = useRef(new Map());
  const { reduceMotion, tokens } = useOfficeMotion();
  const actorCount = actors.size;
  const phasesKey = actorPhaseSignature(actorPhases);
  const canvas = layout?.canvas;
  const canvasWidth = canvas?.width;
  const canvasHeight = canvas?.height;
  const actorIds = useMemo(() => Array.from(actors.keys()), [actors]);

  const openLayout = useMemo(() => {
    if (!canvas) return { anchors: new Map(), assignment: new Map() };

    const nextLayout = openFloorLayout(
      actorIds,
      previousAnchorAssignmentRef.current,
      canvas
    );
    return nextLayout;
  }, [actorIds, canvas, canvasWidth, canvasHeight]);

  useEffect(() => {
    previousAnchorAssignmentRef.current = openLayout.assignment;
  }, [openLayout.assignment]);

  const anchorMap = openLayout.anchors;
  const targetMap = useMemo(
    () => deriveAgentTargets(actorIds, links, anchorMap, canvas),
    [actorIds, links, anchorMap, canvas]
  );
  const visibleLinkCount = links.reduce((count, link) => {
    const sourceAnchor = anchorMap.get(link.source);
    const targetAnchor = anchorMap.get(link.target);
    return sourceAnchor && targetAnchor ? count + 1 : count;
  }, 0);
  const allowLinkFlow = visibleLinkCount <= MAX_FLOWING_LINKS;

  useGSAP(
    () => {
      const previousActorCount = previousActorCountRef.current;
      previousActorCountRef.current = actorCount;

      if (!actorCount || hasSnapshotEntranceRef.current) return undefined;
      if (previousActorCount !== 0) return undefined;

      const allActorsSeated = Array.from(actors.keys()).every(
        (actorId) => actorPhases.get(actorId) === "seated"
      );
      if (!allActorsSeated) return undefined;

      hasSnapshotEntranceRef.current = true;
      if (reduceMotion) return undefined;

      const targets = svgRef.current?.querySelectorAll(
        ".office-avatar-snapshot"
      );
      if (!targets?.length) return undefined;

      gsap.from(targets, {
        autoAlpha: 0,
        scale: 0.8,
        transformOrigin: "center center",
        duration: tokens.durations.base,
        ease: tokens.ease.pop,
        stagger: {
          each: tokens.stagger.entrance,
          from: "center",
        },
        overwrite: "auto",
      });
      return undefined;
    },
    {
      scope: svgRef,
      dependencies: [
        actorCount,
        phasesKey,
        reduceMotion,
        tokens.durations.base,
        tokens.ease.pop,
        tokens.stagger.entrance,
      ],
      revertOnUpdate: true,
    }
  );

  if (!layout?.canvas) return null;

  return (
    <div className="w-full h-full overflow-auto bg-theme-bg-primary">
      <svg
        ref={svgRef}
        data-office-floor-motion-root="true"
        viewBox={`0 0 ${layout.canvas.width} ${layout.canvas.height}`}
        className="w-full h-full min-h-[640px]"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient
            id="officeSurface"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor={OFFICE_THEME.floor.surfaceStops[0]} />
            <stop offset="42%" stopColor={OFFICE_THEME.floor.surfaceStops[1]} />
            <stop
              offset="100%"
              stopColor={OFFICE_THEME.floor.surfaceStops[2]}
            />
          </linearGradient>
          <radialGradient id="officeGlowA" cx="25%" cy="20%" r="70%">
            <stop offset="0%" stopColor={OFFICE_THEME.floor.glowA[0]} />
            <stop offset="65%" stopColor={OFFICE_THEME.floor.glowA[1]} />
            <stop offset="100%" stopColor={OFFICE_THEME.floor.glowA[2]} />
          </radialGradient>
          <radialGradient id="officeGlowB" cx="72%" cy="28%" r="60%">
            <stop offset="0%" stopColor={OFFICE_THEME.floor.glowB[0]} />
            <stop offset="65%" stopColor={OFFICE_THEME.floor.glowB[1]} />
            <stop offset="100%" stopColor={OFFICE_THEME.floor.glowB[2]} />
          </radialGradient>
          <pattern
            id="officeGrid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="var(--theme-border-subtle)" />
          </pattern>
          <filter id="neonGlow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="strongGlow">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect
          x={0}
          y={0}
          width={layout.canvas.width}
          height={layout.canvas.height}
          fill="url(#officeSurface)"
        />
        <rect
          x={0}
          y={0}
          width={layout.canvas.width}
          height={layout.canvas.height}
          fill="url(#officeGlowA)"
        />
        <rect
          x={0}
          y={0}
          width={layout.canvas.width}
          height={layout.canvas.height}
          fill="url(#officeGlowB)"
        />
        <rect
          x={0}
          y={0}
          width={layout.canvas.width}
          height={layout.canvas.height}
          fill="url(#officeGrid)"
          opacity={0.65}
        />
        <rect
          x={8}
          y={8}
          width={layout.canvas.width - 16}
          height={layout.canvas.height - 16}
          rx={18}
          fill="none"
          stroke={OFFICE_THEME.floor.frameStroke}
          strokeWidth={2.2}
        />

        {Array.from(anchorMap.entries()).map(([actorId, anchor]) => (
          <g
            key={`home-pad-${actorId}`}
            data-office-home-pad="true"
            transform={`translate(${anchor.x},${anchor.y})`}
            opacity={0.58}
          >
            <circle
              r={34}
              fill="none"
              stroke={OFFICE_THEME.surface.cyan}
              strokeWidth={1.2}
              strokeOpacity={0.18}
              strokeDasharray="5 8"
            />
            <circle
              r={18}
              fill={OFFICE_THEME.surface.cyan}
              fillOpacity={0.045}
            />
          </g>
        ))}

        {links.map((link) => {
          const sourceTarget = targetMap.get(link.source);
          const targetTarget = targetMap.get(link.target);
          if (!sourceTarget || !targetTarget) return null;
          return (
            <ConnectionLine
              key={link.id}
              x1={sourceTarget.targetX}
              y1={sourceTarget.targetY}
              x2={targetTarget.targetX}
              y2={targetTarget.targetY}
              strength={link.strength}
              allowFlow={allowLinkFlow}
            />
          );
        })}

        {Array.from(actors.values()).map((actor) => {
          const anchor = anchorMap.get(actor.id);
          const target = targetMap.get(actor.id);
          if (!anchor || !target) return null;
          return (
            <ActorAvatar
              key={actor.id}
              x={target.targetX}
              y={target.targetY}
              collaborating={target.collaborating}
              actor={actor}
              isSelected={selectedActorId === actor.id}
              onSelect={selectActor}
              canvas={layout.canvas}
            />
          );
        })}
      </svg>
    </div>
  );
}
