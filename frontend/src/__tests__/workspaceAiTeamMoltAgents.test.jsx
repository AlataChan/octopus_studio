import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Molt from "@/models/molt";
import {
  loadWorkspaceMoltAgents,
  MoltAgentsSection,
  removeWorkspaceMoltAgent,
  toggleWorkspaceMoltAgent,
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

const root = process.cwd();

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const translations = {
  "molt.aiTeam.section_title": "Molt Agents",
  "molt.aiTeam.empty": "No Molt agents attached.",
  "molt.aiTeam.empty_hint": "Connect from SGA-Molt Console.",
  "molt.aiTeam.loading": "Loading workspace Molt agents...",
  "molt.aiTeam.badge": "Molt",
  "molt.aiTeam.disable": "Disable",
  "molt.aiTeam.enable": "Enable",
  "molt.aiTeam.remove": "Remove",
  "molt.aiTeam.remove_confirm": "Remove this Molt agent from the workspace?",
  "molt.aiTeam.fetch_error": "Unable to load workspace Molt agents.",
};

function t(key) {
  return translations[key] || key;
}

function renderMoltAgentsSection(props) {
  return renderToStaticMarkup(
    <MoltAgentsSection
      agents={[]}
      error={null}
      isLoading={false}
      onRemove={vi.fn()}
      onToggle={vi.fn()}
      t={t}
      {...props}
    />
  );
}

describe("Molt workspace agent API methods", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn(async () => ({ success: true, agents: [] })),
    });
  });

  test("loads workspace Molt agents with authenticated GET headers", async () => {
    await Molt.workspaceAgents("demo space");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/workspace/demo%20space/molt-agents",
      {
        method: "GET",
        headers: { Authorization: "Bearer token" },
      }
    );
  });

  test("attaches, updates, and removes workspace Molt agents", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn(async () => ({ success: true })),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn(async () => ({ success: true })),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn(async () => ({ success: true })),
      });

    await Molt.attachWorkspaceAgent("demo", {
      moltAgentId: "molt-agent-1",
      displayName: "Matrix Coordinator",
    });
    await Molt.updateWorkspaceAgent("demo", "molt-agent-1", {
      enabled: false,
    });
    await Molt.removeWorkspaceAgent("demo", "molt-agent-1");

    expect(global.fetch.mock.calls).toEqual([
      [
        "/api/workspace/demo/molt-agents",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            moltAgentId: "molt-agent-1",
            displayName: "Matrix Coordinator",
          }),
        },
      ],
      [
        "/api/workspace/demo/molt-agents/molt-agent-1",
        {
          method: "PATCH",
          headers: {
            Authorization: "Bearer token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ enabled: false }),
        },
      ],
      [
        "/api/workspace/demo/molt-agents/molt-agent-1",
        {
          method: "DELETE",
          headers: { Authorization: "Bearer token" },
        },
      ],
    ]);
  });
});

describe("Workspace AI Team Molt agents section", () => {
  test("loads attached Molt agents for a workspace slug", async () => {
    const molt = {
      workspaceAgents: vi.fn(async () => ({
        success: true,
        agents: [{ molt_agent_id: "molt-agent-1" }],
      })),
    };

    await expect(
      loadWorkspaceMoltAgents({ slug: "demo", molt, t })
    ).resolves.toEqual({
      agents: [{ molt_agent_id: "molt-agent-1" }],
      moltAvailable: true,
      error: null,
    });
    expect(molt.workspaceAgents).toHaveBeenCalledWith("demo");
  });

  test("uses workspace-scoped Molt availability without global status request", async () => {
    const molt = {
      workspaceAgents: vi.fn(async () => ({
        success: true,
        agents: [],
        moltAvailable: false,
      })),
      status: vi.fn(),
    };

    await expect(
      loadWorkspaceMoltAgents({ slug: "demo", molt, t })
    ).resolves.toEqual({
      agents: [],
      moltAvailable: false,
      error: null,
    });
    expect(molt.workspaceAgents).toHaveBeenCalledWith("demo");
    expect(molt.status).not.toHaveBeenCalled();
  });

  test("renders empty attached state with console guidance", () => {
    const markup = renderMoltAgentsSection();

    expect(markup).toContain("No Molt agents attached.");
    expect(markup).toContain("Connect from SGA-Molt Console.");
    expect(markup).toContain("/settings/sga");
  });

  test("renders attached agents with Molt badge and controls", () => {
    const markup = renderMoltAgentsSection({
      agents: [
        {
          molt_agent_id: "molt-agent-1",
          display_name: "Matrix Coordinator",
          enabled: true,
        },
      ],
    });

    expect(markup).toContain("Matrix Coordinator");
    expect(markup).toContain("molt-agent-1");
    expect(markup).toContain("Molt");
    expect(markup).toContain("Disable");
    expect(markup).toContain("Remove");
  });

  test("toggles enabled state through the Molt workspace API", async () => {
    const molt = {
      updateWorkspaceAgent: vi.fn(async () => ({ success: true })),
    };

    await toggleWorkspaceMoltAgent({
      slug: "demo",
      agent: { molt_agent_id: "molt-agent-1" },
      enabled: false,
      molt,
    });

    expect(molt.updateWorkspaceAgent).toHaveBeenCalledWith(
      "demo",
      "molt-agent-1",
      { enabled: false }
    );
  });

  test("confirms before removing an attached Molt agent", async () => {
    const molt = {
      removeWorkspaceAgent: vi.fn(async () => ({ success: true })),
    };
    const confirm = vi.fn(() => true);

    await removeWorkspaceMoltAgent({
      slug: "demo",
      agent: { molt_agent_id: "molt-agent-1" },
      confirm,
      molt,
      t,
    });

    expect(confirm).toHaveBeenCalledWith(
      "Remove this Molt agent from the workspace?"
    );
    expect(molt.removeWorkspaceAgent).toHaveBeenCalledWith(
      "demo",
      "molt-agent-1"
    );
  });

  test("does not remove an agent when confirmation is cancelled", async () => {
    const molt = {
      removeWorkspaceAgent: vi.fn(async () => ({ success: true })),
    };

    await expect(
      removeWorkspaceMoltAgent({
        slug: "demo",
        agent: { molt_agent_id: "molt-agent-1" },
        confirm: vi.fn(() => false),
        molt,
        t,
      })
    ).resolves.toEqual({ success: false, cancelled: true });
    expect(molt.removeWorkspaceAgent).not.toHaveBeenCalled();
  });

  test("renders fetch errors without crashing", () => {
    const markup = renderMoltAgentsSection({ error: "Backend unavailable" });

    expect(markup).toContain("Unable to load workspace Molt agents.");
    expect(markup).toContain("Backend unavailable");
  });

  test("defines required zh and en translation keys", () => {
    const zh = source("src/locales/zh/common.js");
    const en = source("src/locales/en/common.js");
    const keys = [
      "molt.aiTeam.section_title",
      "molt.aiTeam.empty",
      "molt.aiTeam.empty_hint",
      "molt.aiTeam.loading",
      "molt.aiTeam.badge",
      "molt.aiTeam.disable",
      "molt.aiTeam.enable",
      "molt.aiTeam.remove",
      "molt.aiTeam.remove_confirm",
      "molt.aiTeam.fetch_error",
    ];

    for (const key of keys) {
      expect(zh).toContain(key);
      expect(en).toContain(key);
    }
  });
});
