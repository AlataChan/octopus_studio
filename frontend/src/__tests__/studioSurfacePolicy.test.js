import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  isFocusedStudioSurface,
  navigationVisibility,
} from "@/utils/studioSurfacePolicy";

const REPO_ROOT = path.resolve(process.cwd(), "..");

describe("focused Studio product surface", () => {
  it("is focused by default and can reveal compatibility navigation explicitly", () => {
    expect(isFocusedStudioSurface(undefined)).toBe(true);
    expect(isFocusedStudioSurface("true")).toBe(true);
    expect(isFocusedStudioSurface("false")).toBe(false);
    expect(navigationVisibility(undefined)).toEqual({
      sellableLoop: true,
      compatibility: false,
    });
    expect(navigationVisibility("false")).toEqual({
      sellableLoop: true,
      compatibility: true,
    });
  });

  it("classifies every real endpoint and top-level frontend page", () => {
    const evidence = fs.readFileSync(
      path.join(
        REPO_ROOT,
        "docs/consolidation/studio-surface-classification.md"
      ),
      "utf8"
    );
    const endpointEntries = fs
      .readdirSync(path.join(REPO_ROOT, "server/endpoints"))
      .sort();
    const pageEntries = fs
      .readdirSync(path.join(REPO_ROOT, "frontend/src/pages"))
      .sort();

    for (const entry of endpointEntries) {
      expect(evidence).toContain(`\`server/endpoints/${entry}\``);
    }
    for (const entry of pageEntries) {
      expect(evidence).toContain(`\`frontend/src/pages/${entry}\``);
    }
  });

  it("keeps the sellable loop visible and marks compatibility navigation", () => {
    const sidebar = fs.readFileSync(
      path.join(REPO_ROOT, "frontend/src/components/Sidebar/index.jsx"),
      "utf8"
    );
    const workspaces = fs.readFileSync(
      path.join(
        REPO_ROOT,
        "frontend/src/components/Sidebar/ActiveWorkspaces/index.jsx"
      ),
      "utf8"
    );
    const settings = fs.readFileSync(
      path.join(REPO_ROOT, "frontend/src/components/SettingsSidebar/index.jsx"),
      "utf8"
    );
    const systemSettings = fs.readFileSync(
      path.join(REPO_ROOT, "server/models/systemSettings.js"),
      "utf8"
    );

    expect(workspaces).toContain("paths.workspace.fdeWorkflows");
    expect(workspaces).toContain("FdeServiceConfigured");
    expect(systemSettings).toContain("FdeServiceConfigured");
    expect(sidebar).toContain("SHOW_COMPATIBILITY_NAVIGATION");
    expect(settings).toContain("SHOW_COMPATIBILITY_NAVIGATION");
  });
});
