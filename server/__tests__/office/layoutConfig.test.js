const fs = require("fs");
const path = require("path");

describe("office-layout.json", () => {
  let config;

  beforeAll(() => {
    const raw = fs.readFileSync(
      path.resolve(__dirname, "../../config/office-layout.json"),
      "utf-8"
    );
    config = JSON.parse(raw);
  });

  it("has canvas dimensions", () => {
    expect(config.canvas).toEqual({ width: 1320, height: 860 });
  });

  it("has at least one zone", () => {
    expect(config.zones.length).toBeGreaterThanOrEqual(1);
  });

  it("every zone has required fields", () => {
    for (const zone of config.zones) {
      expect(zone).toHaveProperty("id");
      expect(zone).toHaveProperty("type");
      expect(zone).toHaveProperty("label");
      expect(zone).toHaveProperty("position");
      expect(zone).toHaveProperty("size");
      expect(["workspace", "meeting", "hotdesk", "lounge"]).toContain(
        zone.type
      );
    }
  });

  it("workspace zones have gridSize and workspaceSlug", () => {
    const wsZones = config.zones.filter((z) => z.type === "workspace");
    for (const zone of wsZones) {
      expect(zone.gridSize).toHaveLength(2);
      expect(zone).toHaveProperty("workspaceSlug");
    }
  });

  it("has features section with office3DEnabled", () => {
    expect(config.features).toHaveProperty("office3DEnabled");
  });
});
