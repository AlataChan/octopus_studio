import { memo, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useOfficeStore } from "@/store/officeStore";
import { OFFICE_THEME } from "../theme";
import { useOfficeMotion } from "../motion/OfficeMotionProvider";
import {
  getActorAvatarPresentation,
  getActorVisualProfile,
} from "@/utils/office/actorVisualProfile";

const STATUS_LABELS = {
  thinking: "THINK",
  speaking: "LIVE",
  tool_calling: "TOOL",
  error: "ALERT",
};

const ANIMATED_STATUSES = new Set(["thinking", "speaking", "tool_calling"]);

function channelColor(channel) {
  return OFFICE_THEME.channels[channel] || OFFICE_THEME.channels.generic;
}

const EDGE_PADDING = 72;
const MOBILE_EDGE_PADDING = 48;
const DESKTOP_DRIFT_AMPLITUDE = 6;
const MOBILE_DRIFT_AMPLITUDE = 3;
const MIN_DRIFT_PERIOD = 6;
const MAX_DRIFT_PERIOD = 9;

export function getAvatarEdgeTarget(x, y, canvas, isMobile = false) {
  const width = Number.isFinite(canvas?.width) ? canvas.width : x * 2;
  const height = Number.isFinite(canvas?.height) ? canvas.height : y * 2;
  const padding = isMobile ? MOBILE_EDGE_PADDING : EDGE_PADDING;
  const distances = [
    { side: "left", value: x },
    { side: "right", value: width - x },
    { side: "top", value: y },
    { side: "bottom", value: height - y },
  ];
  const nearest = distances.reduce((best, item) =>
    item.value < best.value ? item : best
  );

  switch (nearest.side) {
    case "right":
      return { x: width + padding, y };
    case "top":
      return { x, y: -padding };
    case "bottom":
      return { x, y: height + padding };
    case "left":
    default:
      return { x: -padding, y };
  }
}

function killTimeline(timelineRef) {
  if (!timelineRef.current) return;
  timelineRef.current.kill();
  timelineRef.current = null;
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || "avatar");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashUnit(seed, salt) {
  const mixed = Math.imul(seed ^ Math.imul(salt + 1, 2246822519), 3266489917);
  return ((mixed >>> 0) % 10000) / 10000;
}

function roundTwo(value) {
  return Number(value.toFixed(2));
}

export function getAvatarDriftConfig(actorId, isMobile = false) {
  const seed = hashString(actorId);
  const amplitude = isMobile ? MOBILE_DRIFT_AMPLITUDE : DESKTOP_DRIFT_AMPLITUDE;
  const periodRange = MAX_DRIFT_PERIOD - MIN_DRIFT_PERIOD;
  const periodX = roundTwo(MIN_DRIFT_PERIOD + hashUnit(seed, 1) * periodRange);
  let periodY = roundTwo(MIN_DRIFT_PERIOD + hashUnit(seed, 2) * periodRange);

  if (Math.abs(periodX - periodY) < 0.15) {
    periodY = roundTwo(
      periodY > (MIN_DRIFT_PERIOD + MAX_DRIFT_PERIOD) / 2
        ? periodY - 0.37
        : periodY + 0.37
    );
  }

  return {
    amplitudeX: amplitude,
    amplitudeY: amplitude,
    periodX,
    periodY,
    delayX: roundTwo(hashUnit(seed, 3) * periodX),
    delayY: roundTwo(hashUnit(seed, 4) * periodY),
  };
}

export function shouldRunAvatarDrift({
  phase,
  reduceMotion,
  hasPositioned,
  collaborating,
}) {
  return (
    phase === "seated" &&
    !reduceMotion &&
    Boolean(hasPositioned) &&
    !collaborating
  );
}

function getAvatarWalkDuration(distance, tokens) {
  const baseWalk = tokens.durations.slow * 1.35;
  const distanceExtra = Math.min(tokens.durations.base, distance / 720);
  return baseWalk + distanceExtra;
}

function readGsapNumber(target, property, fallback) {
  const value = gsap.getProperty(target, property);
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readWorldPosition(target, fallback) {
  return {
    x: readGsapNumber(target, "x", fallback.x),
    y: readGsapNumber(target, "y", fallback.y),
  };
}

function addAxisDrift(
  timeline,
  target,
  property,
  center,
  amplitude,
  period,
  delay,
  onUpdate,
  position
) {
  const quarterPeriod = period / 4;
  const drift = gsap.timeline({ repeat: -1, delay });

  drift
    .to(target, {
      [property]: center + amplitude,
      duration: quarterPeriod,
      ease: "sine.inOut",
      onUpdate,
    })
    .to(target, {
      [property]: center,
      duration: quarterPeriod,
      ease: "sine.inOut",
      onUpdate,
    })
    .to(target, {
      [property]: center - amplitude,
      duration: quarterPeriod,
      ease: "sine.inOut",
      onUpdate,
    })
    .to(target, {
      [property]: center,
      duration: quarterPeriod,
      ease: "sine.inOut",
      onUpdate,
    });

  timeline.add(drift, position);
}

export const ActorAvatar = memo(function ActorAvatar({
  x,
  y,
  actor,
  isSelected,
  onSelect,
  canvas,
  collaborating = false,
}) {
  const outerRef = useRef(null);
  const focusRef = useRef(null);
  const innerRef = useRef(null);
  const bubbleRef = useRef(null);
  const statusTimelineRef = useRef(null);
  const worldPositionRef = useRef({ x, y });
  const wasCollaboratingRef = useRef(Boolean(collaborating));
  // Tracks whether the outer group has been placed at a world position yet.
  // First placement snaps (no animation); later anchor changes tween (reseat).
  const hasPositionedRef = useRef(false);
  const phase = useOfficeStore(
    (state) => state.actorPhases.get(actor.id) || "seated"
  );
  const selectedActorId = useOfficeStore((state) => state.selectedActorId);
  const getActorPhaseToken = useOfficeStore(
    (state) => state.getActorPhaseToken
  );
  const setActorPhase = useOfficeStore((state) => state.setActorPhase);
  const finalizeRemoveActor = useOfficeStore(
    (state) => state.finalizeRemoveActor
  );
  const { reduceMotion, isMobile, tokens } = useOfficeMotion();
  const profile = getActorVisualProfile(actor);
  const avatar = getActorAvatarPresentation(actor);
  const statusLabel = STATUS_LABELS[actor.status];
  const hasSpeechBubble = Boolean(actor.speechBubble);
  const isCollaborationBubble = Boolean(collaborating && hasSpeechBubble);
  const bubbleWidth = Math.min((actor.speechBubble?.length || 0) * 6 + 18, 158);
  const clipId = `actor-avatar-${String(actor.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const phaseDuration = reduceMotion ? 0.001 : tokens.durations.base;
  const exitDuration = reduceMotion ? 0.001 : tokens.durations.slow;
  const statusDuration = reduceMotion ? 0.001 : tokens.durations.slow;
  const settleDuration = reduceMotion ? 0 : tokens.durations.fast;
  const selectionState = isSelected
    ? "selected"
    : selectedActorId
      ? "dimmed"
      : "normal";

  useGSAP(
    () => {
      const focus = focusRef.current;
      if (!focus) return undefined;

      const selected = selectionState === "selected";
      const dimmed = selectionState === "dimmed";
      const vars = {
        y: selected ? -5 : 0,
        scale: selected ? 1.045 : 1,
        autoAlpha: dimmed ? 0.45 : 1,
      };

      gsap.killTweensOf(focus);
      gsap.set(focus, { transformOrigin: "center center" });

      if (reduceMotion) {
        gsap.set(focus, vars);
        return undefined;
      }

      gsap.to(focus, {
        ...vars,
        duration: tokens.durations.fast,
        ease: tokens.ease.out,
        overwrite: "auto",
      });
      return undefined;
    },
    {
      scope: focusRef,
      dependencies: [
        reduceMotion,
        selectionState,
        tokens.durations.fast,
        tokens.ease.out,
      ],
      revertOnUpdate: true,
    }
  );

  useGSAP(
    () => {
      const outer = outerRef.current;
      if (!outer) return undefined;

      gsap.killTweensOf(outer);
      gsap.set(outer, { transformOrigin: "center center" });

      if (phase === "entering") {
        killTimeline(statusTimelineRef);
        const edgeTarget = getAvatarEdgeTarget(x, y, canvas, isMobile);

        if (reduceMotion) {
          gsap.set(outer, { x, y });
          worldPositionRef.current = { x, y };
          hasPositionedRef.current = true;
          wasCollaboratingRef.current = Boolean(collaborating);
          setActorPhase(actor.id, "seated");
          return undefined;
        }

        worldPositionRef.current = edgeTarget;
        hasPositionedRef.current = true;
        wasCollaboratingRef.current = Boolean(collaborating);
        gsap.fromTo(
          outer,
          {
            x: edgeTarget.x,
            y: edgeTarget.y,
          },
          {
            x,
            y,
            duration: phaseDuration,
            ease: tokens.ease.pop,
            overwrite: "auto",
            onUpdate: () => {
              worldPositionRef.current = readWorldPosition(outer, edgeTarget);
            },
            onComplete: () => {
              worldPositionRef.current = { x, y };
              wasCollaboratingRef.current = Boolean(collaborating);
              setActorPhase(actor.id, "seated");
            },
          }
        );
        return undefined;
      }

      if (phase === "leaving") {
        killTimeline(statusTimelineRef);
        const token = getActorPhaseToken(actor.id);
        const finalize = () => finalizeRemoveActor(actor.id, token);
        const lastWorldPosition = worldPositionRef.current || { x, y };
        gsap.set(outer, lastWorldPosition);
        const currentX = readGsapNumber(outer, "x", lastWorldPosition.x);
        const currentY = readGsapNumber(outer, "y", lastWorldPosition.y);
        const edgeTarget = getAvatarEdgeTarget(
          currentX,
          currentY,
          canvas,
          isMobile
        );

        if (reduceMotion) {
          gsap.set(outer, edgeTarget);
          worldPositionRef.current = edgeTarget;
          finalize();
          return undefined;
        }

        const fallback = gsap.delayedCall(
          exitDuration + tokens.durations.fast,
          finalize
        );
        gsap.to(outer, {
          x: edgeTarget.x,
          y: edgeTarget.y,
          duration: exitDuration,
          ease: tokens.ease.in,
          overwrite: "auto",
          onUpdate: () => {
            worldPositionRef.current = readWorldPosition(
              outer,
              lastWorldPosition
            );
          },
          onComplete: () => {
            fallback.kill();
            worldPositionRef.current = edgeTarget;
            finalize();
          },
        });

        return () => fallback.kill();
      }

      // seated / home — snap into place on first positioning (e.g. snapshot load,
      // avoids flying in from the SVG origin); later anchor changes tween (reseat).
      if (hasPositionedRef.current) {
        gsap.set(outer, worldPositionRef.current || { x, y });
      }

      if (reduceMotion) {
        gsap.set(outer, { x, y });
        worldPositionRef.current = { x, y };
        hasPositionedRef.current = true;
        wasCollaboratingRef.current = Boolean(collaborating);
        return undefined;
      }

      const wasPositioned = hasPositionedRef.current;
      const wasCollaborating = wasCollaboratingRef.current;
      const updateWorldPosition = () => {
        worldPositionRef.current = readWorldPosition(outer, { x, y });
      };
      const timeline = gsap.timeline();

      if (!wasPositioned) {
        timeline.set(outer, { x, y });
        worldPositionRef.current = { x, y };
        hasPositionedRef.current = true;
        wasCollaboratingRef.current = Boolean(collaborating);
      } else {
        const currentPosition = worldPositionRef.current || { x, y };
        const distance = Math.hypot(
          currentPosition.x - x,
          currentPosition.y - y
        );
        const isWalkingTransition = Boolean(collaborating || wasCollaborating);
        timeline.to(outer, {
          x,
          y,
          duration: isWalkingTransition
            ? getAvatarWalkDuration(distance, tokens)
            : tokens.durations.fast,
          ease: isWalkingTransition ? tokens.ease.inOut : tokens.ease.out,
          overwrite: "auto",
          onUpdate: updateWorldPosition,
          onComplete: () => {
            worldPositionRef.current = { x, y };
            wasCollaboratingRef.current = Boolean(collaborating);
          },
        });
      }

      if (
        shouldRunAvatarDrift({
          phase,
          reduceMotion,
          hasPositioned: hasPositionedRef.current,
          collaborating,
        })
      ) {
        const drift = getAvatarDriftConfig(actor.id, isMobile);
        timeline.addLabel("avatarDrift");
        addAxisDrift(
          timeline,
          outer,
          "x",
          x,
          drift.amplitudeX,
          drift.periodX,
          drift.delayX,
          updateWorldPosition,
          "avatarDrift"
        );
        addAxisDrift(
          timeline,
          outer,
          "y",
          y,
          drift.amplitudeY,
          drift.periodY,
          drift.delayY,
          updateWorldPosition,
          "avatarDrift"
        );
      }

      return () => timeline.kill();
    },
    {
      scope: outerRef,
      dependencies: [
        actor.id,
        canvas?.height,
        canvas?.width,
        collaborating,
        exitDuration,
        finalizeRemoveActor,
        getActorPhaseToken,
        isMobile,
        phase,
        phaseDuration,
        reduceMotion,
        setActorPhase,
        tokens.durations.fast,
        tokens.durations.base,
        tokens.durations.slow,
        tokens.ease.inOut,
        tokens.ease.out,
        tokens.ease.in,
        tokens.ease.pop,
        x,
        y,
      ],
      revertOnUpdate: true,
    }
  );

  useGSAP(
    () => {
      const inner = innerRef.current;
      if (!inner) return undefined;

      gsap.killTweensOf(inner);
      gsap.set(inner, { transformOrigin: "center center" });

      if (phase === "entering") {
        killTimeline(statusTimelineRef);

        if (reduceMotion) {
          gsap.set(inner, { scale: 1, autoAlpha: 1 });
          return undefined;
        }

        gsap.fromTo(
          inner,
          {
            scale: 0.72,
            autoAlpha: 0,
          },
          {
            scale: 1,
            autoAlpha: 1,
            duration: phaseDuration,
            ease: tokens.ease.pop,
            overwrite: "auto",
          }
        );
        return undefined;
      }

      if (phase === "leaving") {
        killTimeline(statusTimelineRef);

        if (reduceMotion) {
          gsap.set(inner, { scale: 0.82, autoAlpha: 0 });
          return undefined;
        }

        gsap.to(inner, {
          scale: 0.82,
          autoAlpha: 0,
          duration: exitDuration,
          ease: tokens.ease.in,
          overwrite: "auto",
        });
        return undefined;
      }

      gsap.set(inner, { scale: 1, autoAlpha: 1 });
      return undefined;
    },
    {
      scope: innerRef,
      dependencies: [
        exitDuration,
        phase,
        phaseDuration,
        reduceMotion,
        tokens.ease.in,
        tokens.ease.pop,
      ],
      revertOnUpdate: true,
    }
  );

  useGSAP(
    () => {
      const inner = innerRef.current;
      if (!inner) return undefined;

      killTimeline(statusTimelineRef);
      if (phase !== "seated") return undefined;

      const bubble = collaborating
        ? null
        : inner.querySelector(".office-avatar-speech-bubble");
      const glowRing = inner.querySelector(".office-avatar-glow-ring");
      const toolLabel = inner.querySelector(".office-avatar-tool-label");
      const detailTargets = [bubble, glowRing, toolLabel].filter(Boolean);
      gsap.killTweensOf([inner, ...detailTargets]);

      if (
        reduceMotion ||
        actor.status === "idle" ||
        actor.status === "offline" ||
        !ANIMATED_STATUSES.has(actor.status)
      ) {
        gsap.to(inner, {
          y: 0,
          scale: 1,
          autoAlpha: 1,
          duration: settleDuration,
          ease: tokens.ease.out,
          overwrite: "auto",
        });
        if (detailTargets.length) {
          gsap.set(detailTargets, {
            scale: 1,
            autoAlpha: 1,
            transformOrigin: "center center",
          });
        }
        return undefined;
      }

      const timeline = gsap.timeline({
        repeat: -1,
        yoyo: true,
        defaults: {
          duration: statusDuration,
          ease: tokens.ease.inOut,
          overwrite: "auto",
        },
      });

      if (actor.status === "thinking") {
        timeline.to(inner, { y: -4, scale: 1.035, autoAlpha: 1 }, 0);
        if (glowRing) {
          timeline.to(glowRing, { scale: 1.12, autoAlpha: 0.24 }, 0);
        }
      } else if (actor.status === "speaking") {
        timeline.to(inner, { y: -6, scale: 1.02, autoAlpha: 1 }, 0);
        if (bubble) {
          timeline.fromTo(
            bubble,
            { scale: 0.92, autoAlpha: 0.82 },
            { scale: 1, autoAlpha: 1 },
            0
          );
        }
      } else if (actor.status === "tool_calling") {
        timeline.to(inner, { y: -8, scale: 1.045, autoAlpha: 1 }, 0);
        if (toolLabel) {
          timeline.fromTo(
            toolLabel,
            { scale: 0.94, autoAlpha: 0.75 },
            { scale: 1.04, autoAlpha: 1 },
            0
          );
        }
        if (glowRing) {
          timeline.to(glowRing, { scale: 1.16, autoAlpha: 0.28 }, 0);
        }
      }

      statusTimelineRef.current = timeline;
      return () => timeline.kill();
    },
    {
      scope: innerRef,
      dependencies: [
        actor.status,
        collaborating,
        phase,
        reduceMotion,
        settleDuration,
        statusDuration,
        tokens.ease.inOut,
        tokens.ease.out,
      ],
      revertOnUpdate: true,
    }
  );

  useGSAP(
    (_, contextSafe) => {
      const bubble = bubbleRef.current;
      if (!bubble) return undefined;

      gsap.killTweensOf(bubble);
      gsap.set(bubble, { transformOrigin: "0% 50%" });

      if (!isCollaborationBubble || phase !== "seated") {
        gsap.set(bubble, { y: 0, scale: 1, autoAlpha: 1 });
        return undefined;
      }

      if (reduceMotion) {
        gsap.set(bubble, { y: 0, scale: 1, autoAlpha: 1 });
        return undefined;
      }

      gsap.fromTo(
        bubble,
        { y: 2, scale: 0.9, autoAlpha: 0 },
        {
          y: 0,
          scale: 1,
          autoAlpha: 1,
          duration: tokens.durations.fast,
          ease: tokens.ease.pop,
          overwrite: "auto",
        }
      );

      const dismissBubble = contextSafe(() => {
        if (!bubbleRef.current) return;
        gsap.to(bubble, {
          y: -4,
          autoAlpha: 0,
          duration: tokens.durations.fast,
          ease: tokens.ease.out,
          overwrite: "auto",
        });
      });
      const dismiss = gsap.delayedCall(
        tokens.durations.slow * 3,
        dismissBubble
      );

      return () => {
        dismiss.kill();
        gsap.killTweensOf(bubble);
      };
    },
    {
      scope: bubbleRef,
      dependencies: [
        actor.speechBubble,
        isCollaborationBubble,
        phase,
        reduceMotion,
        tokens.durations.fast,
        tokens.durations.slow,
        tokens.ease.out,
        tokens.ease.pop,
      ],
      revertOnUpdate: true,
    }
  );

  return (
    <g
      ref={outerRef}
      data-office-avatar-position="true"
      data-target-x={x}
      data-target-y={y}
      data-collaborating={collaborating ? "true" : "false"}
      onClick={() => onSelect?.(actor.id)}
      style={{ cursor: "pointer" }}
      opacity={profile.isDimmed ? 0.42 : 1}
    >
      <g
        ref={focusRef}
        className="office-avatar-focus"
        data-selection-state={selectionState}
      >
        <g className="office-avatar-snapshot">
          <g ref={innerRef} className="office-avatar-motion">
            <defs>
              <clipPath id={clipId}>
                <circle cx="0" cy="0" r="18" />
              </clipPath>
            </defs>

            <ellipse
              cx={0}
              cy={28}
              rx={18}
              ry={7}
              fill={OFFICE_THEME.floor.deskShadow}
              opacity={0.4}
            />
            <circle
              className="office-avatar-glow-ring"
              r={28}
              fill={profile.signal}
              opacity={isSelected ? 0.16 : 0.09}
              filter="url(#strongGlow)"
            />
            <circle
              r={22}
              fill={OFFICE_THEME.floor.avatarPlate}
              stroke={profile.signal}
              strokeWidth={isSelected ? 2.8 : 2}
            />

            {avatar.kind === "image" ? (
              <image
                href={avatar.value}
                x={-18}
                y={-18}
                width={36}
                height={36}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#${clipId})`}
              />
            ) : (
              <g>
                <circle cx={0} cy={0} r={18} fill={profile.body} />
                <text
                  textAnchor="middle"
                  y={5}
                  fontSize={12}
                  fontWeight="800"
                  letterSpacing="0.4px"
                  fill={OFFICE_THEME.surface.textPrimary}
                >
                  {avatar.value}
                </text>
              </g>
            )}

            {isSelected ? (
              <circle
                r={26}
                fill="none"
                stroke={profile.signal}
                strokeWidth={2.2}
                strokeDasharray="6 4"
                opacity={0.95}
              />
            ) : null}

            {statusLabel ? (
              <g transform="translate(0,-38)">
                <rect
                  x={-22}
                  y={-10}
                  width={44}
                  height={18}
                  rx={9}
                  fill={OFFICE_THEME.floor.statusBadgeBackground}
                  stroke={profile.signal}
                  strokeWidth={1.2}
                />
                {/* Sonar Pulse for Live/Thinking status */}
                {(actor.status === "speaking" ||
                  actor.status === "thinking") && (
                  <circle
                    cx={-14.5}
                    cy={-2.5}
                    r={3.5}
                    fill={profile.signal}
                    className="motion-safe:animate-sonar opacity-0"
                    style={{ transformOrigin: "-14.5px -2.5px" }}
                  />
                )}
                <rect
                  x={-18}
                  y={-6}
                  width={7}
                  height={7}
                  rx={3.5}
                  fill={profile.signal}
                  filter="url(#neonGlow)"
                />
                <text
                  textAnchor="middle"
                  y={3}
                  x={5}
                  fontSize={8}
                  fontWeight="700"
                  letterSpacing="0.8px"
                  fill={OFFICE_THEME.surface.textPrimary}
                >
                  {statusLabel}
                </text>
              </g>
            ) : null}

            {actor.currentTool ? (
              <text
                className="office-avatar-tool-label"
                textAnchor="middle"
                y={-52}
                fontSize={8}
                fontWeight="700"
                letterSpacing="0.8px"
                fill={profile.trim}
              >
                {actor.currentTool.slice(0, 16).toUpperCase()}
              </text>
            ) : null}

            {hasSpeechBubble ? (
              <g
                ref={bubbleRef}
                className="office-avatar-speech-bubble"
                data-office-collaboration-bubble={
                  isCollaborationBubble ? "true" : "false"
                }
                transform="translate(30,-18)"
              >
                <rect
                  x={0}
                  y={-14}
                  width={bubbleWidth}
                  height={28}
                  rx={10}
                  fill={OFFICE_THEME.floor.speechBubbleBackground}
                  stroke={profile.signal}
                  strokeWidth={1.2}
                />
                <path
                  d="M 10 14 L 3 21 L 18 14"
                  fill={OFFICE_THEME.floor.speechBubbleBackground}
                />
                <text
                  x={10}
                  y={3}
                  fontSize={9}
                  fill={OFFICE_THEME.surface.textPrimary}
                >
                  {actor.speechBubble.length > 24
                    ? `${actor.speechBubble.slice(0, 24)}...`
                    : actor.speechBubble}
                </text>
              </g>
            ) : null}

            <g transform="translate(0,42)">
              <text
                textAnchor="middle"
                fontSize={10}
                fontWeight="700"
                letterSpacing="0.6px"
                fill={OFFICE_THEME.surface.textPrimary}
              >
                {(actor.name || "Assistant").slice(0, 16)}
              </text>
              {actor.title ? (
                <text
                  textAnchor="middle"
                  y={12}
                  fontSize={7.5}
                  letterSpacing="0.5px"
                  fill={OFFICE_THEME.surface.textMuted}
                >
                  {actor.title.length > 18
                    ? `${actor.title.slice(0, 18)}...`
                    : actor.title}
                </text>
              ) : null}
            </g>

            {actor.activeChannels?.length > 0 ? (
              <g
                transform={`translate(${-actor.activeChannels.length * 7}, 58)`}
              >
                {actor.activeChannels.map((channel, index) => (
                  <g key={channel} transform={`translate(${index * 16},0)`}>
                    <circle
                      cx={0}
                      cy={0}
                      r={5.5}
                      fill={OFFICE_THEME.floor.channelChipBackground}
                    />
                    <circle cx={0} cy={0} r={4} fill={channelColor(channel)} />
                  </g>
                ))}
              </g>
            ) : null}
          </g>
        </g>
      </g>
    </g>
  );
});
