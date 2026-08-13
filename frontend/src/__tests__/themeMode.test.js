import { describe, expect, it } from "vitest";
import {
  getInitialThemePreference,
  normalizeThemePreference,
} from "@/hooks/useTheme";

describe("theme preference helpers", () => {
  it("defaults to light theme when no preference is saved", () => {
    const storage = {
      getItem() {
        return null;
      },
    };

    expect(getInitialThemePreference(storage)).toBe("light");
  });

  it("keeps a saved light theme preference", () => {
    const storage = {
      getItem(key) {
        return key === "theme" ? "light" : null;
      },
    };

    expect(getInitialThemePreference(storage)).toBe("light");
  });

  it("falls back to default for unknown values", () => {
    expect(normalizeThemePreference("unknown")).toBe("default");
    expect(getInitialThemePreference({ getItem: () => "mystery" })).toBe(
      "default"
    );
  });
});
