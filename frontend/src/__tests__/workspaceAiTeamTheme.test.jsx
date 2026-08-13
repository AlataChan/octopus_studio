import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PerformanceStats from "@/components/PerformanceStats";
import AssistantDetail from "@/components/AssistantDetail";
import { GraphView, OverviewView } from "@/pages/WorkspaceAITeam";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiTeamSource = fs.readFileSync(
  path.resolve(__dirname, "../pages/WorkspaceAITeam/index.jsx"),
  "utf8"
);
const performanceStatsSource = fs.readFileSync(
  path.resolve(__dirname, "../components/PerformanceStats/index.jsx"),
  "utf8"
);
const sidebarSource = fs.readFileSync(
  path.resolve(__dirname, "../components/Sidebar/index.jsx"),
  "utf8"
);
const hiredAssistantsSource = fs.readFileSync(
  path.resolve(__dirname, "../components/Sidebar/HiredAssistants/index.jsx"),
  "utf8"
);
const searchBoxSource = fs.readFileSync(
  path.resolve(__dirname, "../components/Sidebar/SearchBox/index.jsx"),
  "utf8"
);
const userCardSource = fs.readFileSync(
  path.resolve(__dirname, "../components/Sidebar/UserCard/index.jsx"),
  "utf8"
);

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({ slug: "phase0-test" }),
}));

describe("Workspace AI Team theme wiring", () => {
  it("renders overview surfaces with theme token classes", () => {
    const markup = renderToStaticMarkup(
      <OverviewView
        workspaceSlug="phase0-test"
        overview={{
          totalAssistants: 2,
          totalChats: 4,
          totalDocuments: 1,
          assistants: [
            {
              id: "a-1",
              source: "hired",
              instanceName: "长文协作助手",
              employeeName: "Luna",
              employeeTitle: "首席营销官 CMO",
              category: "营销",
              rank: 0.5,
              tags: ["品牌", "内容"],
              chatCount: 2,
              documentCount: 1,
            },
          ],
        }}
      />
    );

    expect(markup).toContain("bg-theme-bg-secondary");
    expect(markup).toContain("border-theme-sidebar-border");
    expect(markup).toContain("text-theme-text-primary");
    expect(markup).toContain("text-theme-text-secondary");
  });

  it("renders graph view controls with theme token classes", () => {
    const markup = renderToStaticMarkup(
      <GraphView
        collaborationData={null}
        getNodeColor={() => "#3b82f6"}
        graphData={{
          nodes: [{ id: "a-1", name: "Luna", type: "assistant", metadata: {} }],
          links: [],
        }}
        onPeriodChange={vi.fn()}
        period="7d"
      />
    );

    expect(markup).toContain("bg-theme-bg-secondary");
    expect(markup).toContain("bg-[var(--theme-button-sidebar-bg)]");
    expect(markup).toContain("text-theme-text-primary");
    expect(markup).toContain("text-theme-text-secondary");
  });

  it("renders performance stats loading state with theme token classes", () => {
    const markup = renderToStaticMarkup(
      <PerformanceStats workspaceSlug="phase0-test" />
    );

    expect(markup).toContain("bg-theme-bg-secondary");
    expect(markup).toContain("border-theme-sidebar-border");
  });

  it("renders assistant detail modal shell with theme token classes", () => {
    const markup = renderToStaticMarkup(
      <AssistantDetail
        assistant={{ id: "a-1", name: "长文协作助手" }}
        onClose={vi.fn()}
        workspaceSlug="phase0-test"
      />
    );

    expect(markup).toContain("bg-theme-bg-secondary");
    expect(markup).toContain("border-theme-sidebar-border");
    expect(markup).toContain("text-theme-text-primary");
    expect(markup).toContain("text-theme-text-secondary");
  });

  it("uses theme-driven accent tokens instead of hardcoded blue and purple utility classes", () => {
    expect(aiTeamSource).toContain("var(--theme-accent-primary)");
    expect(aiTeamSource).toContain("var(--theme-accent-soft)");
    expect(aiTeamSource).not.toMatch(
      /text-blue-400|bg-blue-500|text-purple-400|bg-purple-500/
    );
  });

  it("uses the shared mist-blue accent styling in PerformanceStats", () => {
    expect(performanceStatsSource).toContain("var(--theme-accent-primary)");
    expect(performanceStatsSource).toContain("var(--theme-accent-soft)");
    expect(performanceStatsSource).not.toMatch(/text-blue-400|bg-blue-500/);
  });

  it("uses the mist-blue route chrome across the sidebar shell and search controls", () => {
    expect(sidebarSource).toContain("var(--theme-accent-soft)");
    expect(sidebarSource).toContain("text-theme-text-primary");
    expect(sidebarSource).not.toMatch(
      /bg-purple-400|bg-sky-400|text-theme-text-primary\/80 hover:text-white/
    );

    expect(hiredAssistantsSource).toContain("text-theme-text-primary");
    expect(hiredAssistantsSource).not.toMatch(
      /text-theme-text-primary\/80|text-theme-text-primary\/40|bg-white\/10/
    );

    expect(searchBoxSource).toContain("bg-primary-button");
    expect(searchBoxSource).toContain("text-theme-text-primary");
    expect(searchBoxSource).not.toMatch(/bg-white rounded-lg|text-black/);

    expect(userCardSource).toContain("text-theme-text-primary");
    expect(userCardSource).toContain("var(--theme-accent-soft)");
    expect(userCardSource).not.toContain('className="text-theme-text-primary');
  });
});
