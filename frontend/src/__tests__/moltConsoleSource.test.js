import fs from "fs";
import path from "path";

const root = process.cwd();

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("Molt console source wiring", () => {
  test("console page reads status, capability, mission status, and archetypes", () => {
    const page = source("src/pages/Admin/SgaSettings/index.jsx");

    expect(page).toContain('from "@/models/molt"');
    expect(page).toContain("Molt.status()");
    expect(page).toContain("Molt.capability()");
    expect(page).toContain("Molt.missionStatus()");
    expect(page).toContain("Molt.archetypes()");
  });

  test("settings sidebar exposes the Molt console route", () => {
    const sidebar = source("src/components/SettingsSidebar/index.jsx");
    const paths = source("src/utils/paths.js");

    expect(paths).toContain("sga: ()");
    expect(sidebar).toContain("paths.settings.sga()");
    expect(sidebar).toContain("SGA-Molt 控制台");
  });
});
