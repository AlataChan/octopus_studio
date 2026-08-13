const FALLBACKS = {
  default: {
    bg: "#0c0e12",
    panel: "#181c24",
    accent: "#f0803c",
    textPrimary: "#edeff3",
    textSecondary: "#a3abb8",
    border: "rgba(255, 255, 255, 0.1)",
  },
  light: {
    bg: "#f9f8f6",
    panel: "#fffefc",
    accent: "#c2410c",
    textPrimary: "#333333",
    textSecondary: "#60646c",
    border: "rgba(51, 51, 51, 0.16)",
  },
};

function readThemeVar(style, name, fallback) {
  if (!style) return fallback;
  const value = style.getPropertyValue(name).trim();
  return value || fallback;
}

export function colorWithAlpha(color, alpha) {
  if (!color) return `rgba(240, 128, 60, ${alpha})`;

  const normalized = color.trim();
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3
      ? hex[1].split("").map((part) => part + part).join("")
      : hex[1];
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const rgb = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(",").map((part) => part.trim()).slice(0, 3);
    if (parts.length === 3) return `rgba(${parts.join(", ")}, ${alpha})`;
  }

  return normalized;
}

export function resolveGraphTheme(theme = "default") {
  const isLight = theme === "light";
  const fallback = isLight ? FALLBACKS.light : FALLBACKS.default;
  const style = typeof window !== "undefined"
    ? window.getComputedStyle(document.documentElement)
    : null;

  const bg = readThemeVar(style, "--theme-bg-primary", fallback.bg);
  const panel = readThemeVar(style, "--theme-bg-secondary", fallback.panel);
  const accent = readThemeVar(style, "--theme-accent-primary", fallback.accent);
  const textPrimary = readThemeVar(
    style,
    "--theme-text-primary",
    fallback.textPrimary
  );
  const textSecondary = readThemeVar(
    style,
    "--theme-text-secondary",
    fallback.textSecondary
  );
  const border = readThemeVar(style, "--theme-border-subtle", fallback.border);

  return {
    isDark: !isLight,
    bg,
    panel,
    halo: colorWithAlpha(accent, isLight ? 0.16 : 0.2),
    accent,
    accentSoft: colorWithAlpha(accent, isLight ? 0.12 : 0.16),
    border,
    shadow: isLight
      ? "0 16px 40px rgba(62, 43, 30, 0.16)"
      : "0 18px 46px rgba(0, 0, 0, 0.42)",
    node: {
      assistant: {
        fill: accent,
        stroke: colorWithAlpha(accent, 0.48),
        label: textPrimary,
      },
      doc: {
        fill: isLight ? "#fae8d8" : "#2a201a",
        stroke: accent,
        label: textPrimary,
      },
      chat: {
        fill: panel,
        stroke: border,
        label: textSecondary,
      },
      tag: {
        fill: colorWithAlpha(accent, isLight ? 0.1 : 0.14),
        stroke: colorWithAlpha(accent, 0.3),
        label: textSecondary,
      },
      concept: {
        fill: colorWithAlpha(accent, isLight ? 0.13 : 0.18),
        stroke: colorWithAlpha(accent, 0.42),
        label: textPrimary,
      },
      entity: {
        fill: isLight ? panel : colorWithAlpha(accent, 0.1),
        stroke: colorWithAlpha(accent, 0.32),
        label: textPrimary,
      },
      comparison: {
        fill: panel,
        stroke: colorWithAlpha(accent, 0.26),
        label: textSecondary,
      },
      timeline: {
        fill: colorWithAlpha(accent, isLight ? 0.08 : 0.12),
        stroke: border,
        label: textSecondary,
      },
    },
    edge: {
      color: isLight
        ? "rgba(104, 88, 75, 0.28)"
        : "rgba(163, 171, 184, 0.18)",
      focus: colorWithAlpha(accent, 0.5),
    },
    text: {
      primary: textPrimary,
      secondary: textSecondary,
    },
  };
}
