import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const preloadSource = readFileSync(
  resolve("src/utils/settingsRoutePreload.js"),
  "utf8"
);
const routeImportersSource = readFileSync(
  resolve("src/utils/routeImporters.js"),
  "utf8"
);
const appSource = readFileSync(resolve("src/App.jsx"), "utf8");
const activeWorkspacesSource = readFileSync(
  resolve("src/components/Sidebar/ActiveWorkspaces/index.jsx"),
  "utf8"
);
const sidebarSource = readFileSync(
  resolve("src/components/Sidebar/index.jsx"),
  "utf8"
);
const settingsMenuSource = readFileSync(
  resolve("src/components/SettingsSidebar/MenuOption/index.jsx"),
  "utf8"
);

describe("sidebar route preloading", () => {
  it("uses one page importer registry for lazy routes and preloads", () => {
    expect(appSource).toContain("lazy(routeImporters.workspaceChat)");
    expect(appSource).toContain("scheduleIdleRoutePreload");
    expect(preloadSource).toContain("routeImporters");
    expect(appSource).not.toContain('import("@/pages/WorkspaceChat")');
    expect(preloadSource).not.toContain('import("@/pages/');
  });

  it("keeps billing route chunks behind the original build flag", () => {
    expect(routeImportersSource).not.toContain("@/pages/Admin/Billing");
    expect(routeImportersSource).not.toContain(
      "@/pages/GeneralSettings/MyBilling"
    );
    expect(appSource).toContain('import("@/pages/Admin/Billing")');
    expect(appSource).toContain('import("@/pages/GeneralSettings/MyBilling")');
  });

  it("guards idle route preloading on data saver and slow networks", () => {
    expect(routeImportersSource).toContain("saveData");
    expect(routeImportersSource).toContain("effectiveType");
    expect(routeImportersSource).toContain("2g");
    expect(routeImportersSource).toContain("Promise.allSettled");
  });

  it("exports preloader helpers for main lazy routes", () => {
    expect(preloadSource).toContain("export function preloadWorkspaceChat()");
    expect(preloadSource).toContain("export function preloadWorkspaceGraph()");
    expect(preloadSource).toContain("export function preloadWorkspaceOffice()");
    expect(preloadSource).toContain("export function preloadWorkspaceAITeam()");
    expect(preloadSource).toContain("export function preloadDocumentManager()");
    expect(preloadSource).toContain(
      "export function preloadAssistantLibrary()"
    );
    expect(preloadSource).toContain("export function preloadSkillHub()");
  });

  it("dedupes repeated preload attempts for the same route key", async () => {
    const preloadModule = await import("@/utils/settingsRoutePreload");
    expect(typeof preloadModule.preloadRouteOnce).toBe("function");
    expect(typeof preloadModule.__resetPreloadedRoutesForTest).toBe("function");

    preloadModule.__resetPreloadedRoutesForTest();
    const loader = vi.fn(() => Promise.resolve());

    preloadModule.preloadRouteOnce("workspace-chat", loader);
    preloadModule.preloadRouteOnce("workspace-chat", loader);
    await Promise.resolve();

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("matches dynamic workspace paths to their route chunk preloaders", async () => {
    const preloadModule = await import("@/utils/settingsRoutePreload");
    expect(typeof preloadModule.resolveRoutePreloader).toBe("function");

    expect(preloadModule.resolveRoutePreloader("/workspace/acme")?.key).toBe(
      "workspace-chat"
    );
    expect(
      preloadModule.resolveRoutePreloader("/workspace/acme/t/thread-1")?.key
    ).toBe("workspace-chat");
    expect(
      preloadModule.resolveRoutePreloader("/workspace/acme/graph")?.key
    ).toBe("workspace-graph");
    expect(
      preloadModule.resolveRoutePreloader("/workspace/acme/ai-team")?.key
    ).toBe("workspace-ai-team");
    expect(
      preloadModule.resolveRoutePreloader(
        "/workspace/acme/settings/general-appearance"
      )?.key
    ).toBe("workspace-settings");
    expect(preloadModule.resolveRoutePreloader("/office")?.key).toBe(
      "workspace-office"
    );
    expect(preloadModule.resolveRoutePreloader("/document-manager")?.key).toBe(
      "document-manager"
    );
  });

  it("wires workspace row intent events to the chat route preloader", () => {
    expect(activeWorkspacesSource).toContain("preloadWorkspaceChat");
    expect(activeWorkspacesSource).toContain("onMouseEnter");
    expect(activeWorkspacesSource).toContain("onFocus");
    expect(activeWorkspacesSource).toContain("onPointerDown");
    expect(activeWorkspacesSource).toContain("onTouchStart");
  });

  it("wires the workspace graph entry to the graph route preloader", () => {
    expect(activeWorkspacesSource).toContain("preloadWorkspaceGraph");
    expect(activeWorkspacesSource).toContain("handleGraphIntent");
    expect(activeWorkspacesSource).toContain("paths.workspace.graph");
  });

  it("wires top-level sidebar route entries to their route preloaders", () => {
    expect(sidebarSource).toContain("preloadWorkspaceOffice");
    expect(sidebarSource).toContain("preloadWorkspaceAITeam");
    expect(sidebarSource).toContain("preloadDocumentManager");
    expect(sidebarSource).toContain("preloadAssistantLibrary");
    expect(sidebarSource).toContain("preloadSkillHub");
  });

  it("keeps settings sidebar intent preloading compatible", () => {
    expect(settingsMenuSource).toContain("preloadSettingsRoute");
    expect(settingsMenuSource).toContain("onMouseEnter={handleIntent}");
    expect(settingsMenuSource).toContain("onFocus={handleIntent}");
    expect(settingsMenuSource).toContain("onPointerDown={handleIntent}");
  });
});
