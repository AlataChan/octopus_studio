import { X } from "@phosphor-icons/react";
import { useOfficeStore } from "@/store/officeStore";
import { OFFICE_THEME } from "../theme";
import { getActorVisualProfile } from "@/utils/office/actorVisualProfile";

function channelColor(channel) {
  return OFFICE_THEME.channels[channel] || OFFICE_THEME.channels.generic;
}

export default function ActorDetailPanel() {
  const selectedActorId = useOfficeStore((state) => state.selectedActorId);
  const actors = useOfficeStore((state) => state.actors);
  const selectActor = useOfficeStore((state) => state.selectActor);

  const actor = selectedActorId ? actors.get(selectedActorId) : null;
  if (!actor) return null;

  const profile = getActorVisualProfile(actor);
  const featuredCardBackground = OFFICE_THEME.meta.isDark
    ? "linear-gradient(180deg, rgba(10,22,48,0.86) 0%, rgba(7,16,31,0.92) 100%)"
    : "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(238,244,251,0.96) 100%)";

  return (
    <aside
      className="absolute right-0 top-0 z-20 h-full w-full max-w-sm overflow-hidden backdrop-blur-xl"
      style={{
        borderLeft: `1px solid ${OFFICE_THEME.surface.border}`,
        background: OFFICE_THEME.panel.overlayBackground,
        fontFamily: OFFICE_THEME.typography.display,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-48"
        style={{
          background: `radial-gradient(circle at 30% 20%, ${profile.signal}22 0%, transparent 58%), radial-gradient(circle at 80% 10%, ${profile.trim}18 0%, transparent 44%)`,
        }}
      />
      <div
        className="relative flex items-center justify-between px-5 py-4"
        style={{ borderBottom: `1px solid ${OFFICE_THEME.surface.border}` }}
      >
        <div>
          <p
            className="text-xs uppercase"
            style={{
              color: OFFICE_THEME.surface.textMuted,
              letterSpacing: "0.22em",
            }}
          >
            Active Agent
          </p>
          <h3
            className="text-lg font-semibold"
            style={{ color: OFFICE_THEME.surface.textPrimary }}
          >
            {actor.name}
          </h3>
        </div>
        <button
          onClick={() => selectActor(null)}
          className="rounded-full p-2 transition"
          style={{
            color: OFFICE_THEME.surface.textSecondary,
            background: OFFICE_THEME.panel.closeButtonBackground,
          }}
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative space-y-5 p-5 text-sm">
        <div
          className="rounded-[28px] p-4"
          style={{
            border: `1px solid ${profile.signal}44`,
            background: featuredCardBackground,
            boxShadow: `inset 0 0 26px ${profile.signal}12`,
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="relative flex h-24 w-24 items-center justify-center rounded-[26px]"
              style={{
                background: `radial-gradient(circle at 30% 25%, ${profile.highlight} 0%, ${profile.body} 55%, ${profile.shadow} 100%)`,
                boxShadow: `0 0 24px ${profile.signal}22`,
              }}
            >
              <div className="absolute left-[24px] top-[16px] h-3 w-3 rounded-full bg-cyan-100/90" />
              <div className="absolute right-[24px] top-[16px] h-3 w-3 rounded-full bg-cyan-100/90" />
              <div
                className="rounded-full px-3 py-1 text-xs font-black"
                style={{
                  background: profile.belly,
                  color: profile.shadow,
                  letterSpacing: "0.08em",
                }}
              >
                {profile.monogram}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-xs uppercase"
                style={{
                  color: profile.signal,
                  letterSpacing: "0.22em",
                }}
              >
                {actor.status}
              </p>
              <p
                className="mt-1 text-xl font-semibold"
                style={{ color: OFFICE_THEME.surface.textPrimary }}
              >
                {actor.name}
              </p>
              <p
                className="mt-1 text-sm"
                style={{ color: OFFICE_THEME.surface.textSecondary }}
              >
                {actor.title || "AI collaborator"}
              </p>
              {actor.avatar ? (
                <div
                  className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1"
                  style={{ background: OFFICE_THEME.panel.channelBackground }}
                >
                  <img
                    src={actor.avatar}
                    alt={actor.name}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                  <span
                    className="text-xs"
                    style={{ color: OFFICE_THEME.surface.textSecondary }}
                  >
                    profile linked
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Section label="Workspace" value={actor.workspaceSlug || "-"} mono />
          <Section label="Signal" value={actor.status} />
          {actor.currentTool ? (
            <Section label="Tool" value={actor.currentTool} mono />
          ) : null}
          <Section
            label="Channels"
            value={
              actor.activeChannels?.length ? actor.activeChannels.length : 0
            }
          />
        </div>

        {actor.speechBubble ? (
          <div>
            <p
              className="mb-2 text-xs uppercase tracking-[0.22em]"
              style={{ color: profile.signal }}
            >
              Live output
            </p>
            <div
              className="rounded-[22px] p-4 text-sm leading-6"
              style={{
                border: `1px solid ${profile.signal}44`,
                background: OFFICE_THEME.panel.metricBackground,
                color: OFFICE_THEME.surface.textPrimary,
              }}
            >
              {actor.speechBubble}
            </div>
          </div>
        ) : null}

        {actor.activeChannels?.length ? (
          <div>
            <p
              className="mb-2 text-xs uppercase"
              style={{
                color: OFFICE_THEME.surface.textMuted,
                letterSpacing: "0.22em",
              }}
            >
              Channel bindings
            </p>
            <div className="flex flex-wrap gap-2">
              {actor.activeChannels.map((channel) => (
                <span
                  key={channel}
                  className="rounded-full px-3 py-1 text-xs font-semibold capitalize"
                  style={{
                    border: `1px solid ${channelColor(channel)}55`,
                    color: OFFICE_THEME.surface.textPrimary,
                    background: OFFICE_THEME.panel.channelBackground,
                  }}
                >
                  {channel}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {actor.metrics ? (
          <div>
            <p
              className="mb-2 text-xs uppercase"
              style={{
                color: OFFICE_THEME.surface.textMuted,
                letterSpacing: "0.22em",
              }}
            >
              Performance signal
            </p>
            <div className="grid grid-cols-3 gap-3">
              <MetricCard
                label="Invokes"
                value={actor.metrics.totalInvocations ?? 0}
                tone={OFFICE_THEME.surface.cyan}
              />
              <MetricCard
                label="Success"
                value={`${Math.round((actor.metrics.successRate || 0) * 100)}%`}
                tone={OFFICE_THEME.surface.mint}
              />
              <MetricCard
                label="Avg"
                value={`${((actor.metrics.avgResponseTimeMs || 0) / 1000).toFixed(1)}s`}
                tone={OFFICE_THEME.surface.magenta}
              />
            </div>
          </div>
        ) : null}

        {actor.stale ? (
          <p
            className="rounded-[20px] px-4 py-3 text-xs"
            style={{
              border: `1px solid ${OFFICE_THEME.surface.amber}44`,
              background: OFFICE_THEME.panel.attentionBackground,
              color: OFFICE_THEME.panel.attentionText,
            }}
          >
            Signal may be stale because this assistant has been quiet for a
            while.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function Section({ label, value, mono = false }) {
  return (
    <div
      className="rounded-[20px] p-4"
      style={{
        border: `1px solid ${OFFICE_THEME.surface.border}`,
        background: OFFICE_THEME.panel.strongBackground,
      }}
    >
      <p
        className="mb-1 text-[10px] uppercase"
        style={{
          color: OFFICE_THEME.surface.textMuted,
          letterSpacing: "0.18em",
        }}
      >
        {label}
      </p>
      <p
        className={mono ? "font-mono text-sm" : "text-sm font-semibold"}
        style={{ color: OFFICE_THEME.surface.textPrimary }}
      >
        {value}
      </p>
    </div>
  );
}

function MetricCard({ label, value, tone }) {
  return (
    <div
      className="rounded-[20px] p-3"
      style={{
        border: `1px solid ${tone}44`,
        background: OFFICE_THEME.panel.metricBackground,
      }}
    >
      <p
        className="text-[10px] uppercase"
        style={{ color: OFFICE_THEME.surface.textMuted }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-lg font-semibold"
        style={{ color: OFFICE_THEME.surface.textPrimary }}
      >
        {value}
      </p>
    </div>
  );
}
