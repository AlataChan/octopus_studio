import { useMemo, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useOfficeStore } from "@/store/officeStore";
import { OFFICE_THEME } from "../theme";
import { useOfficeMotion } from "../motion/OfficeMotionProvider";

export function getAnimatedNumberStartValue(renderedValue, fallbackValue) {
  const parsed = Number(String(renderedValue ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

export function AnimatedNumber({
  value,
  label,
  className = "office-count-motion",
  style,
}) {
  const valueRef = useRef(null);
  const stateRef = useRef({ val: value });
  const currentValueRef = useRef(value);
  const { reduceMotion, tokens } = useOfficeMotion();

  useGSAP(
    () => {
      const valueNode = valueRef.current;
      if (!valueNode) return undefined;

      const state = stateRef.current;
      gsap.killTweensOf(state);

      if (reduceMotion) {
        state.val = value;
        currentValueRef.current = value;
        valueNode.textContent = String(Math.round(value));
        return undefined;
      }

      state.val = getAnimatedNumberStartValue(
        valueNode.textContent,
        currentValueRef.current
      );
      currentValueRef.current = state.val;
      valueNode.textContent = String(Math.round(state.val));
      const tween = gsap.to(state, {
        val: value,
        duration: tokens.durations.base,
        ease: tokens.ease.out,
        overwrite: "auto",
        onUpdate: () => {
          currentValueRef.current = state.val;
          valueNode.textContent = String(Math.round(state.val));
        },
        onComplete: () => {
          state.val = value;
          currentValueRef.current = value;
          valueNode.textContent = String(Math.round(value));
        },
      });

      return () => tween.kill();
    },
    {
      scope: valueRef,
      dependencies: [
        reduceMotion,
        tokens.durations.base,
        tokens.ease.out,
        value,
      ],
      revertOnUpdate: true,
    }
  );

  return (
    <span
      ref={valueRef}
      className={className}
      data-office-count-label={label}
      data-office-count-value={value}
      style={style}
    >
      {Math.round(value)}
    </span>
  );
}

function MetricPill({ label, value, tone = OFFICE_THEME.surface.cyan }) {
  return (
    <div
      className="rounded-full px-3 py-2"
      style={{
        border: `1px solid ${tone}55`,
        background: OFFICE_THEME.panel.subtleBackground,
        boxShadow: `inset 0 0 18px ${tone}12`,
      }}
    >
      <p
        className="text-[10px] uppercase"
        style={{
          color: OFFICE_THEME.surface.textMuted,
          letterSpacing: "0.18em",
        }}
      >
        {label}
      </p>
      <p
        className="text-sm font-semibold"
        style={{ color: OFFICE_THEME.surface.textPrimary }}
      >
        <AnimatedNumber value={value} label={label} />
      </p>
    </div>
  );
}

export default function OfficeMetricsBar() {
  const actors = useOfficeStore((state) => state.actors);
  const connectionStatus = useOfficeStore((state) => state.connectionStatus);
  const reconnectAttempt = useOfficeStore((state) => state.reconnectAttempt);
  const retryConnection = useOfficeStore((state) => state.retryConnection);

  const stats = useMemo(() => {
    const result = { online: 0, busy: 0, errors: 0, offline: 0, total: 0 };
    for (const actor of actors.values()) {
      result.total += 1;
      if (actor.status === "offline") {
        result.offline += 1;
        continue;
      }
      result.online += 1;
      if (["thinking", "speaking", "tool_calling"].includes(actor.status)) {
        result.busy += 1;
      }
      if (actor.status === "error") {
        result.errors += 1;
      }
    }
    return result;
  }, [actors]);

  const liveTone =
    connectionStatus === "connected"
      ? OFFICE_THEME.surface.mint
      : connectionStatus === "connecting"
        ? OFFICE_THEME.surface.amber
        : OFFICE_THEME.surface.orange;

  const statusText = (() => {
    switch (connectionStatus) {
      case "connected":
        return "Signal Live";
      case "connecting":
        return reconnectAttempt > 0
          ? `Reconnecting... (#${reconnectAttempt})`
          : "Connecting...";
      case "failed":
        return "Connection failed";
      case "disconnected":
        return "Disconnected";
      default:
        return connectionStatus;
    }
  })();

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <div
        className="inline-flex items-center gap-2 rounded-full px-3 py-2"
        style={{
          border: `1px solid ${liveTone}55`,
          background: OFFICE_THEME.panel.subtleBackground,
          color: OFFICE_THEME.surface.textPrimary,
        }}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            connectionStatus === "connecting" || connectionStatus === "failed"
              ? "animate-pulse"
              : ""
          }`}
          style={{
            background:
              connectionStatus === "connected"
                ? OFFICE_THEME.surface.mint
                : connectionStatus === "connecting"
                  ? OFFICE_THEME.surface.amber
                  : OFFICE_THEME.surface.orange,
            boxShadow: `0 0 12px ${liveTone}`,
          }}
        />
        <span className="text-sm font-semibold">{statusText}</span>
        {connectionStatus === "failed" && (
          <button
            onClick={retryConnection}
            className="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors"
            style={{
              border: `1px solid ${OFFICE_THEME.surface.cyan}55`,
              background: OFFICE_THEME.panel.strongBackground,
              color: OFFICE_THEME.surface.cyan,
              cursor: "pointer",
              boxShadow: `0 0 8px ${OFFICE_THEME.surface.cyan}22`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${OFFICE_THEME.surface.cyan}22`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                OFFICE_THEME.panel.strongBackground;
            }}
          >
            Retry
          </button>
        )}
      </div>
      <MetricPill
        label="Online"
        value={stats.online}
        tone={OFFICE_THEME.surface.cyan}
      />
      <MetricPill
        label="Busy"
        value={stats.busy}
        tone={OFFICE_THEME.surface.violet}
      />
      {stats.errors > 0 ? (
        <MetricPill
          label="Alert"
          value={stats.errors}
          tone={OFFICE_THEME.surface.orange}
        />
      ) : null}
      <MetricPill
        label="Total"
        value={stats.total}
        tone={OFFICE_THEME.surface.magenta}
      />
    </div>
  );
}
