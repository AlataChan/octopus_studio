import { memo, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { OFFICE_THEME } from "../theme";
import { useOfficeMotion } from "../motion/OfficeMotionProvider";

export const MIN_FLOW_STRENGTH = 0.35;
export const MAX_FLOWING_LINKS = 12;
export const DOTS_PER_LINK = 2;

function clampStrength(strength) {
  return Math.min(Math.max(Number(strength) || 0, 0), 1);
}

function flowDashArray(strength) {
  const dash = Math.max(0.055, 0.13 - strength * 0.045);
  const gap = Math.max(0.07, 0.18 - strength * 0.07);
  return `${dash.toFixed(3)} ${gap.toFixed(3)}`;
}

function flowDuration(strength, baseDuration) {
  return Math.max(baseDuration * (1.6 - strength), baseDuration * 0.45);
}

function messageDotDuration(strength, baseDuration) {
  return Math.max(baseDuration * (1.5 - strength * 0.65), baseDuration * 0.5);
}

function buildConnectionLinePath({ x1, y1, x2, y2 }) {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

export function shouldRenderMessageDots({
  flowEnabled,
  reduceMotion,
  isMobile,
}) {
  return Boolean(flowEnabled && !reduceMotion && !isMobile);
}

export function shouldEnableLinkFlow({
  reduceMotion,
  isMobile,
  isVisible,
  allowFlow,
  strength,
}) {
  return Boolean(
    !reduceMotion &&
      !isMobile &&
      isVisible &&
      allowFlow &&
      clampStrength(strength) >= MIN_FLOW_STRENGTH
  );
}

export function getConnectionLineMotionKeys({ x1, y1, x2, y2, strength }) {
  const path = buildConnectionLinePath({ x1, y1, x2, y2 });
  const normalizedStrength = clampStrength(strength);

  return {
    path,
    drawKey: path,
    flowKey: `${path}|${normalizedStrength.toFixed(3)}`,
  };
}

export const ConnectionLine = memo(function ConnectionLine({
  x1,
  y1,
  x2,
  y2,
  strength = 0.5,
  allowFlow = true,
  isVisible = true,
}) {
  const pathRef = useRef(null);
  const dotGroupRef = useRef(null);
  const drawTweenRef = useRef(null);
  const flowTweenRef = useRef(null);
  const flowDelayRef = useRef(null);
  const drawCompleteRef = useRef(false);
  const { reduceMotion, isMobile, tokens } = useOfficeMotion();
  const normalizedStrength = clampStrength(strength);
  const glowOpacity = 0.08 + normalizedStrength * 0.18;
  const strokeOpacity = 0.24 + normalizedStrength * 0.46;
  const staticDashArray =
    normalizedStrength < MIN_FLOW_STRENGTH ? "0.060 0.100" : "1 0";
  const animatedDashArray = flowDashArray(normalizedStrength);
  const flowEnabled = shouldEnableLinkFlow({
    reduceMotion,
    isMobile,
    isVisible,
    allowFlow,
    strength,
  });
  const messageDotsEnabled = shouldRenderMessageDots({
    flowEnabled,
    reduceMotion,
    isMobile,
  });
  const {
    path: d,
    drawKey,
    flowKey,
  } = getConnectionLineMotionKeys({
    x1,
    y1,
    x2,
    y2,
    strength,
  });
  const reduceMotionDashArray = reduceMotion ? staticDashArray : "";

  useGSAP(
    () => {
      const path = pathRef.current;
      if (!path) return undefined;

      drawTweenRef.current?.kill();

      if (reduceMotion) {
        drawCompleteRef.current = true;
        gsap.set(path, {
          strokeDasharray: staticDashArray,
          strokeDashoffset: 0,
        });
        return undefined;
      }

      drawCompleteRef.current = false;
      gsap.set(path, {
        strokeDasharray: "1 1",
        strokeDashoffset: 1,
      });
      drawTweenRef.current = gsap.to(path, {
        strokeDashoffset: 0,
        duration: tokens.durations.link,
        ease: tokens.ease.out,
        overwrite: "auto",
        onComplete: () => {
          drawCompleteRef.current = true;
        },
      });

      return () => {
        drawTweenRef.current?.kill();
        drawTweenRef.current = null;
      };
    },
    {
      scope: pathRef,
      dependencies: [
        drawKey,
        reduceMotion,
        reduceMotionDashArray,
        tokens.durations.link,
        tokens.ease.out,
      ],
      revertOnUpdate: true,
    }
  );

  useGSAP(
    () => {
      const path = pathRef.current;
      if (!path) return undefined;

      flowTweenRef.current?.kill();
      flowTweenRef.current = null;
      flowDelayRef.current?.kill();
      flowDelayRef.current = null;

      const applyFlowState = () => {
        if (!pathRef.current) return;

        gsap.set(path, {
          strokeDasharray: flowEnabled ? animatedDashArray : staticDashArray,
          strokeDashoffset: 0,
        });

        if (flowEnabled) {
          flowTweenRef.current = gsap.to(path, {
            strokeDashoffset: -1,
            duration: flowDuration(normalizedStrength, tokens.durations.link),
            ease: tokens.ease.flow,
            repeat: -1,
            overwrite: "auto",
          });
        }
      };

      if (reduceMotion || drawCompleteRef.current) {
        applyFlowState();
      } else {
        flowDelayRef.current = gsap.delayedCall(
          tokens.durations.link,
          applyFlowState
        );
      }

      return () => {
        flowTweenRef.current?.kill();
        flowTweenRef.current = null;
        flowDelayRef.current?.kill();
        flowDelayRef.current = null;
      };
    },
    {
      scope: pathRef,
      dependencies: [
        animatedDashArray,
        drawKey,
        flowEnabled,
        flowKey,
        normalizedStrength,
        reduceMotion,
        staticDashArray,
        tokens.durations.link,
        tokens.ease.flow,
      ],
      revertOnUpdate: true,
    }
  );

  useGSAP(
    () => {
      const dotGroup = dotGroupRef.current;
      if (!dotGroup) return undefined;

      const dots = Array.from(
        dotGroup.querySelectorAll(".office-connection-message-dot")
      );
      gsap.killTweensOf(dots);

      if (!messageDotsEnabled || !dots.length) return undefined;

      const duration = messageDotDuration(
        normalizedStrength,
        tokens.durations.link
      );
      const deltaX = x2 - x1;
      const deltaY = y2 - y1;

      dots.forEach((dot, index) => {
        const tween = gsap.fromTo(
          dot,
          {
            x: 0,
            y: 0,
            autoAlpha: 0.45,
            scale: index === 0 ? 1 : 0.82,
          },
          {
            x: deltaX,
            y: deltaY,
            autoAlpha: 1,
            scale: index === 0 ? 1 : 0.82,
            duration,
            ease: tokens.ease.flow,
            repeat: -1,
            overwrite: "auto",
          }
        );
        tween.progress(index / DOTS_PER_LINK);
      });

      return () => gsap.killTweensOf(dots);
    },
    {
      scope: dotGroupRef,
      dependencies: [
        messageDotsEnabled,
        normalizedStrength,
        tokens.durations.link,
        tokens.ease.flow,
        x1,
        x2,
        y1,
        y2,
      ],
      revertOnUpdate: true,
    }
  );

  return (
    <g
      data-flow-enabled={flowEnabled ? "true" : "false"}
      data-message-dots-enabled={messageDotsEnabled ? "true" : "false"}
    >
      <path
        d={d}
        stroke={OFFICE_THEME.surface.magenta}
        strokeWidth={6 + normalizedStrength * 4}
        strokeOpacity={glowOpacity}
        filter="url(#strongGlow)"
        fill="none"
      />
      <path
        ref={pathRef}
        className="office-connection-line-motion"
        data-draw-key={drawKey}
        data-flow-key={flowKey}
        d={d}
        pathLength={1}
        stroke={OFFICE_THEME.surface.cyan}
        strokeWidth={1.2 + normalizedStrength * 1.8}
        strokeOpacity={strokeOpacity}
        strokeDasharray={flowEnabled ? animatedDashArray : staticDashArray}
        strokeDashoffset={reduceMotion ? 0 : 1}
        strokeLinecap="round"
        fill="none"
      />
      {messageDotsEnabled ? (
        <g ref={dotGroupRef} data-office-message-dots="true">
          {Array.from({ length: DOTS_PER_LINK }, (_, index) => (
            <circle
              key={`message-dot-${index}`}
              className="office-connection-message-dot"
              data-dot-index={index}
              cx={x1}
              cy={y1}
              r={2.8 - index * 0.35}
              fill={OFFICE_THEME.surface.cyan}
              opacity={0.92}
              filter="url(#neonGlow)"
            />
          ))}
        </g>
      ) : null}
    </g>
  );
});
