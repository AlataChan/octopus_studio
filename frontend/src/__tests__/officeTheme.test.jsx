import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OfficePage from "@/pages/Office";
import { getOfficeTheme } from "@/components/Office/theme";

vi.mock("@/components/Sidebar", () => ({
  default: function MockSidebar() {
    return <div>Sidebar</div>;
  },
}));

vi.mock("@/components/Office/OfficeView", () => ({
  default: function MockOfficeView() {
    return <div>OfficeView</div>;
  },
}));

vi.mock("@/hooks/useOfficeStream", () => ({
  default: () => {},
}));

describe("office theme", () => {
  const originalDocument = global.document;

  beforeEach(() => {
    global.document = {
      documentElement: {
        getAttribute(name) {
          return name === "data-theme" ? "light" : null;
        },
      },
    };
  });

  afterEach(() => {
    if (originalDocument === undefined) {
      delete global.document;
      return;
    }
    global.document = originalDocument;
  });

  it("returns the light office palette", () => {
    const theme = getOfficeTheme("light");

    expect(theme.meta.isDark).toBe(false);
    expect(theme.surface.page).not.toBe(getOfficeTheme("default").surface.page);
  });

  it("uses the copper palette for the default dark office theme", () => {
    const theme = getOfficeTheme("default");

    expect(theme.meta.isDark).toBe(true);
    expect(theme.surface.blue).toBe("#f0803c");
    expect(theme.surface.cyan).toBe("#ffb27d");
    expect(theme.surface.violet).toBe("#ff9d5c");
    expect(theme.surface.magenta).toBe("#ff9d5c");
    expect(theme.page.background).toContain("rgba(240,128,60,0.12)");
    expect(theme.scene.lightA).toBe("#f0803c");
    expect(theme.scene.lightB).toBe("#ffb27d");
  });

  it("uses light office shell colors when the app theme is light", () => {
    const markup = renderToStaticMarkup(<OfficePage />);
    const lightTheme = getOfficeTheme("light");

    expect(markup).toContain(lightTheme.page.background);
    expect(markup).toContain(lightTheme.page.grid);
    expect(markup).toContain(lightTheme.shell.background);
  });
});
