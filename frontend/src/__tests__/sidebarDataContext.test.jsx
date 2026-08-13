import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WorkspaceAssistant from "@/models/workspaceAssistant";
import Workspace from "@/models/workspace";
import {
  collectEnabledWorkspaceAssistants,
  getEnabledWorkspaceAssistants,
} from "@/components/Sidebar/HiredAssistants";
import { loadSidebarWorkspaces } from "@/contexts/SidebarDataContext";

vi.mock("@/models/workspaceAssistant", () => ({
  WORKSPACE_ASSISTANTS_UPDATED_EVENT: "workspace-assistants:updated",
  default: {
    list: vi.fn(),
  },
}));

vi.mock("@/models/workspace", () => ({
  default: {
    all: vi.fn(),
    orderWorkspaces: vi.fn((workspaces) => workspaces),
  },
}));

function readSource(path) {
  return readFileSync(resolve(path), "utf8");
}

describe("sidebar data context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("centralizes workspace list fetching in SidebarDataProvider", () => {
    const providerSource = readSource("src/contexts/SidebarDataContext.jsx");
    const sidebarSource = readSource("src/components/Sidebar/index.jsx");

    expect(providerSource).toContain("export function SidebarDataProvider");
    expect(providerSource).toContain("export function useSidebarData");
    expect(providerSource).toContain("Workspace.all()");
    expect(sidebarSource).toContain("SidebarDataProvider");
  });

  it("removes duplicate Workspace.all calls from sidebar consumers", () => {
    const activeWorkspacesSource = readSource(
      "src/components/Sidebar/ActiveWorkspaces/index.jsx"
    );
    const hiredAssistantsSource = readSource(
      "src/components/Sidebar/HiredAssistants/index.jsx"
    );

    expect(activeWorkspacesSource).toContain("useSidebarData");
    expect(activeWorkspacesSource).not.toContain("Workspace.all()");
    expect(hiredAssistantsSource).toContain("useSidebarData");
    expect(hiredAssistantsSource).not.toContain("Workspace.all()");
  });

  it("keeps one provider around multiple sidebar subscribers", () => {
    const sidebarSource = readSource("src/components/Sidebar/index.jsx");

    expect(sidebarSource).toContain("<SidebarDataProvider>");
    expect(sidebarSource.match(/<SidebarDataProvider>/g)).toHaveLength(2);
    expect(sidebarSource).toContain("<HiredAssistants />");
    expect(sidebarSource).toContain("<ActiveWorkspaces />");
    expect(sidebarSource).toContain("<AITeamButton />");
  });

  it("refreshes workspace data on demand", async () => {
    Workspace.all
      .mockResolvedValueOnce([{ id: 1, slug: "alpha" }])
      .mockResolvedValueOnce([{ id: 2, slug: "beta" }]);

    await expect(loadSidebarWorkspaces()).resolves.toEqual([
      { id: 1, slug: "alpha" },
    ]);
    await expect(loadSidebarWorkspaces()).resolves.toEqual([
      { id: 2, slug: "beta" },
    ]);

    expect(Workspace.all).toHaveBeenCalledTimes(2);
  });

  it("parallelizes hired assistant requests across workspaces", async () => {
    const pending = {};
    const calls = [];
    WorkspaceAssistant.list.mockImplementation(
      (workspaceSlug) =>
        new Promise((resolve) => {
          calls.push(workspaceSlug);
          pending[workspaceSlug] = resolve;
        })
    );

    const request = getEnabledWorkspaceAssistants([
      { slug: "alpha", name: "Alpha" },
      { slug: "beta", name: "Beta" },
    ]);
    await Promise.resolve();

    expect(calls).toEqual(["alpha", "beta"]);

    pending.beta({
      success: true,
      data: {
        assistants: [
          { id: "b-1", templateId: "shared", enabled: true },
          { id: "b-2", templateId: "disabled", enabled: false },
        ],
      },
    });
    pending.alpha({
      success: true,
      data: {
        assistants: [{ id: "a-1", templateId: "shared", enabled: true }],
      },
    });

    const assistants = await request;
    expect(assistants).toHaveLength(1);
    expect(assistants[0].workspaces.map((workspace) => workspace.slug)).toEqual(
      ["alpha", "beta"]
    );
  });

  it("can bypass cached hired assistant lists after a hire event", async () => {
    WorkspaceAssistant.list.mockResolvedValue({
      success: true,
      data: {
        assistants: [{ id: "a-1", templateId: "alpha", enabled: true }],
      },
    });

    await getEnabledWorkspaceAssistants([{ slug: "alpha", name: "Alpha" }], {
      bypassCache: true,
    });

    expect(WorkspaceAssistant.list).toHaveBeenCalledWith("alpha", {
      bypassCache: true,
    });
  });

  it("invalidates workspace assistant cache and emits a sidebar refresh event after hire", () => {
    const assistantLibrarySource = readSource("src/models/assistantLibrary.js");
    const hiredAssistantsSource = readSource(
      "src/components/Sidebar/HiredAssistants/index.jsx"
    );

    expect(assistantLibrarySource).toContain(
      "WorkspaceAssistant.invalidateListCache(data.workspaceSlug)"
    );
    expect(assistantLibrarySource).toContain(
      "WorkspaceAssistant.notifyUpdated(data.workspaceSlug)"
    );
    expect(hiredAssistantsSource).toContain(
      "WORKSPACE_ASSISTANTS_UPDATED_EVENT"
    );
    expect(hiredAssistantsSource).toMatch(
      /window\.addEventListener\(\s*WORKSPACE_ASSISTANTS_UPDATED_EVENT/
    );
    expect(hiredAssistantsSource).toContain("bypassCache: true");
  });

  it("treats failed per-workspace assistant requests as empty", () => {
    const assistants = collectEnabledWorkspaceAssistants([
      {
        workspace: { slug: "alpha", name: "Alpha" },
        result: { success: false },
      },
      {
        workspace: { slug: "beta", name: "Beta" },
        result: {
          success: true,
          data: {
            assistants: [{ id: "b-1", templateId: "beta", enabled: true }],
          },
        },
      },
    ]);

    expect(assistants).toHaveLength(1);
    expect(assistants[0].workspaceSlug).toBe("beta");
  });
});
