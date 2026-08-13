import { useMemo } from "react";
import { useOfficeStore } from "@/store/officeStore";
import FloorPlan from "./Floor2D/FloorPlan";
import ActorDetailPanel from "./Panels/ActorDetailPanel";
import OfficeMetricsBar, { AnimatedNumber } from "./Panels/OfficeMetricsBar";
import { OfficeMotionProvider } from "./motion/OfficeMotionProvider";
import { OFFICE_THEME } from "./theme";

export default function OfficeView() {
  const layout = useOfficeStore((state) => state.layout);
  const actors = useOfficeStore((state) => state.actors);

  const stats = useMemo(() => {
    let busy = 0;
    for (const actor of actors.values()) {
      if (["thinking", "speaking", "tool_calling"].includes(actor.status)) {
        busy += 1;
      }
    }
    return {
      total: actors.size,
      busy,
      zones: layout?.zones?.length || 0,
    };
  }, [actors, layout]);

  return (
    <OfficeMotionProvider>
      <div
        className="relative flex h-full w-full flex-col overflow-hidden"
        style={{ fontFamily: OFFICE_THEME.typography.display }}
      >
        <div
          className="relative overflow-hidden px-5 py-5"
          style={{
            borderBottom: `1px solid ${OFFICE_THEME.surface.border}`,
            background: OFFICE_THEME.header.background,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: OFFICE_THEME.header.glow,
            }}
          />

          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p
                className="text-xs uppercase"
                style={{
                  color: OFFICE_THEME.surface.textMuted,
                  letterSpacing: "0.28em",
                }}
              >
                Virtual Office
              </p>
              <h1
                className="mt-2 text-3xl font-semibold md:text-4xl"
                style={{ color: OFFICE_THEME.surface.textPrimary }}
              >
                AI signal floor
              </h1>
              <p
                className="mt-3 max-w-xl text-sm md:text-base"
                style={{ color: OFFICE_THEME.surface.textSecondary }}
              >
                Real assistants, live state transitions, and collaboration links
                in one control room.
                {stats.total > 0
                  ? ` ${stats.total} agents are currently on the floor.`
                  : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <HeroChip
                  label="Agents live"
                  value={stats.total}
                  tone={OFFICE_THEME.surface.cyan}
                />
                <HeroChip
                  label="Busy now"
                  value={stats.busy}
                  tone={OFFICE_THEME.surface.magenta}
                />
                <HeroChip
                  label="Zones"
                  value={stats.zones}
                  tone={OFFICE_THEME.surface.orange}
                />
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <OfficeMetricsBar />
            </div>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <FloorPlan />
          <ActorDetailPanel />
        </div>
      </div>
    </OfficeMotionProvider>
  );
}

function HeroChip({ label, value, tone }) {
  return (
    <div
      className="rounded-full px-3 py-1.5"
      style={{
        border: `1px solid ${tone}55`,
        background: OFFICE_THEME.header.chipBackground,
      }}
    >
      <span
        className="mr-2 text-[10px] uppercase"
        style={{
          color: OFFICE_THEME.surface.textMuted,
          letterSpacing: "0.18em",
        }}
      >
        {label}
      </span>
      <span
        className="text-sm font-semibold"
        style={{ color: OFFICE_THEME.surface.textPrimary }}
      >
        <AnimatedNumber
          value={value}
          label={label}
          className="office-count-motion"
        />
      </span>
    </div>
  );
}
