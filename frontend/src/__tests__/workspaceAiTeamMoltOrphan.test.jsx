import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import {
  formatMoltLastSeen,
  MoltAgentsSection,
  MoltOfflineBanner,
  restoreWorkspaceMoltAgent,
} from "@/pages/WorkspaceAITeam";

vi.mock("@/utils/request", () => ({
  baseHeaders: () => ({ Authorization: "Bearer token" }),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({ slug: "demo" }),
}));

const translations = {
  "molt.aiTeam.section_title": "Molt Agents",
  "molt.aiTeam.empty": "No Molt agents attached.",
  "molt.aiTeam.empty_hint": "Connect from SGA-Molt Console.",
  "molt.aiTeam.loading": "Loading workspace Molt agents...",
  "molt.aiTeam.badge": "Molt",
  "molt.aiTeam.disable": "Disable",
  "molt.aiTeam.enable": "Enable",
  "molt.aiTeam.remove": "Remove",
  "molt.aiTeam.fetch_error": "Unable to load workspace Molt agents.",
  "molt.aiTeam.orphan_badge": "Removed in Molt",
  "molt.aiTeam.last_seen": "Last seen: {time}",
  "molt.aiTeam.restore_button": "Restore",
  "molt.aiTeam.restore_success": "Restored.",
  "molt.aiTeam.restore_failed": "Unable to restore.",
  "molt.aiTeam.molt_offline_banner":
    "SGA-Molt is offline. Agent status may be stale.",
};

function t(key, values = {}) {
  return (translations[key] || key).replace(
    /\{(\w+)\}/g,
    (_, name) => values[name] ?? `{${name}}`
  );
}

describe("Workspace AI Team Molt orphan UI", () => {
  test("enabled=false with lastSeenAt renders removed-in-Molt badge", () => {
    const markup = renderToStaticMarkup(
      <MoltAgentsSection
        agents={[
          {
            molt_agent_id: "agent-1",
            display_name: "Matrix Agent",
            enabled: false,
            lastSeenAt: "2026-05-03T00:00:00.000Z",
          },
        ]}
        t={t}
      />
    );

    expect(markup).toContain("Removed in Molt");
    expect(markup).toContain("Matrix Agent");
  });

  test("lastSeenAt is displayed as relative time", () => {
    const value = formatMoltLastSeen(
      "2026-05-03T00:00:00.000Z",
      new Date("2026-05-05T00:00:00.000Z")
    );

    expect(value).toBe("2 days ago");
  });

  test("Restore button calls Molt.updateWorkspaceAgent enabled=true", async () => {
    const molt = {
      updateWorkspaceAgent: vi.fn(async () => ({ success: true })),
    };

    await restoreWorkspaceMoltAgent({
      slug: "demo",
      agent: { molt_agent_id: "agent-1" },
      molt,
    });

    expect(molt.updateWorkspaceAgent).toHaveBeenCalledWith("demo", "agent-1", {
      enabled: true,
    });
  });

  test("Molt offline banner renders stale-state warning", () => {
    const markup = renderToStaticMarkup(<MoltOfflineBanner t={t} />);

    expect(markup).toContain("SGA-Molt is offline. Agent status may be stale.");
  });
});
