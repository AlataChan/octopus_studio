import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function zoneArea(zone) {
  return zone.size.w * zone.size.h;
}

describe("office layout", () => {
  it("keeps the default workspace as the dominant floor zone", () => {
    const layoutPath = resolve(
      process.cwd(),
      "../server/config/office-layout.json"
    );
    const layout = JSON.parse(readFileSync(layoutPath, "utf8"));
    const workspaceZone = layout.zones.find(
      (zone) => zone.id === "zone-default"
    );
    const otherZones = layout.zones.filter(
      (zone) => zone.id !== "zone-default"
    );

    expect(workspaceZone).toBeTruthy();
    for (const zone of otherZones) {
      expect(zoneArea(workspaceZone)).toBeGreaterThan(zoneArea(zone));
    }
  });
});
