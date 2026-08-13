import { REFETCH_LOGO_EVENT } from "@/LogoContext";
import { useState, useEffect } from "react";

const availableThemes = {
  default: "Default",
  light: "Light",
};

const THEME_STORAGE_KEY = "theme";

export function normalizeThemePreference(value) {
  return value === "light" ? "light" : "default";
}

export function getInitialThemePreference(storage = globalThis?.localStorage) {
  const stored = storage?.getItem?.(THEME_STORAGE_KEY);
  if (stored === null || stored === undefined) return "light";
  return normalizeThemePreference(stored);
}

/**
 * Determines the current theme of the application
 * @returns {{theme: ('default' | 'light'), setTheme: function, availableThemes: object}} The current theme, a function to set the theme, and the available themes
 */
export function useTheme() {
  const [theme, _setTheme] = useState(() => getInitialThemePreference());

  useEffect(() => {
    const normalizedTheme = normalizeThemePreference(theme);
    document.documentElement.setAttribute("data-theme", theme);
    document.body.classList.toggle("light", normalizedTheme === "light");
    localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
    window.dispatchEvent(new Event(REFETCH_LOGO_EVENT));
  }, [theme]);

  // In development, attach keybind combinations to toggle theme
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    function toggleOnKeybind(e) {
      if (e.metaKey && e.key === ".") {
        e.preventDefault();
        setTheme((prev) => (prev === "light" ? "default" : "light"));
      }
    }
    document.addEventListener("keydown", toggleOnKeybind);
    return () => document.removeEventListener("keydown", toggleOnKeybind);
  }, []);

  /**
   * Sets the theme of the application and runs any
   * other necessary side effects
   * @param {string} newTheme The new theme to set
   */
  function setTheme(newTheme) {
    _setTheme((currentTheme) =>
      normalizeThemePreference(
        typeof newTheme === "function" ? newTheme(currentTheme) : newTheme
      )
    );
  }

  return { theme, setTheme, availableThemes };
}
