import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const targetedSettingsPages = [
  "src/pages/Admin/ExperimentalFeatures/index.jsx",
  "src/pages/Admin/Agents/index.jsx",
  "src/pages/Admin/KnowledgeGraph/index.jsx",
  "src/pages/GeneralSettings/CommunityHub/Authentication/index.jsx",
  "src/pages/WorkspaceSettings/index.jsx",
];

function readSource(path) {
  return readFileSync(resolve(path), "utf8");
}

describe("settings loading shell", () => {
  it("keeps targeted settings loading states off the full-screen preloader", () => {
    for (const pagePath of targetedSettingsPages) {
      const source = readSource(pagePath);
      expect(source, pagePath).toContain("SettingsPageLoadingShell");
      expect(source, pagePath).not.toContain("FullScreenLoader");
    }
  });

  it("renders a shared settings shell without the fixed preloader overlay", () => {
    const source = readSource(
      "src/components/SettingsPageLoadingShell/index.jsx"
    );

    expect(source).toContain("SettingsSidebar");
    expect(source).toContain('data-testid="settings-page-loading-shell"');
    expect(source).not.toContain('id="preloader"');
    expect(source).not.toContain("fixed left-0 top-0");
  });

  it("uses the workspace sidebar variant for workspace settings", () => {
    const source = readSource("src/pages/WorkspaceSettings/index.jsx");

    expect(source).toMatch(/sidebar=\{!isMobile && <Sidebar \/>\}/);
    expect(source).toContain(
      'rootClassName="w-screen h-screen overflow-hidden bg-page-texture flex"'
    );
  });

  it("invalidates the support email cache after support email settings are saved", () => {
    const source = readSource(
      "src/pages/GeneralSettings/Settings/components/SupportEmail/index.jsx"
    );

    expect(source).toContain(
      "removeLocalStorageItem(System.cacheKeys.supportEmail)"
    );
  });
});
