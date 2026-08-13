const OFFICE_THEME_PALETTES = {
  default: {
    meta: {
      isDark: true,
      mode: "default",
    },
    typography: {
      display:
        '"Plus Jakarta Sans", "PingFang SC", "Helvetica Neue", sans-serif',
      mono: '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace',
    },
    surface: {
      page: "#0c0e12",
      shell: "#12151b",
      panel: "#181c24",
      panelRaised: "#1f242e",
      border: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#edeff3",
      textSecondary: "#a3abb8",
      textMuted: "#7e8696",
      cyan: "#ffb27d",
      blue: "#f0803c",
      violet: "#ff9d5c",
      magenta: "#ff9d5c",
      amber: "#fec84b",
      orange: "#f26d63",
      mint: "#3dd68c",
      onAccent: "#1a0e05",
    },
    page: {
      background:
        "radial-gradient(circle at 20% 10%, rgba(240,128,60,0.12) 0%, transparent 28%), radial-gradient(circle at 78% 14%, rgba(255,178,125,0.08) 0%, transparent 24%), linear-gradient(180deg, #0c0e12 0%, #12151b 100%)",
      grid: "linear-gradient(rgba(240, 128, 60, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(240, 128, 60, 0.04) 1px, transparent 1px)",
    },
    shell: {
      background: "linear-gradient(180deg, #12151b 0%, #181c24 100%)",
      shadow:
        "0 24px 60px rgba(0, 0, 0, 0.44), inset 0 1px 0 rgba(255,255,255,0.03)",
    },
    header: {
      background: "linear-gradient(180deg, #12151b 0%, #12151b 100%)",
      glow: "radial-gradient(circle at 18% 12%, rgba(240,128,60,0.08) 0%, transparent 38%)",
      chipBackground: "rgba(255, 255, 255, 0.04)",
      tagBackground: "rgba(240, 128, 60, 0.1)",
      tagText: "#ffb27d",
    },
    layout: {
      grid: "rgba(255, 255, 255, 0.03)",
      shellGlow: "rgba(240, 128, 60, 0.08)",
      shellGlowWarm: "rgba(240, 128, 60, 0.05)",
      overlay: "rgba(12, 14, 18, 0.8)",
    },
    panel: {
      subtleBackground: "rgba(18, 21, 27, 0.8)",
      strongBackground: "rgba(24, 28, 36, 0.9)",
      softBackground: "rgba(18, 21, 27, 0.95)",
      overlayBackground:
        "linear-gradient(180deg, rgba(12,14,18,0.98) 0%, rgba(18,21,27,0.96) 100%)",
      closeButtonBackground: "rgba(255, 255, 255, 0.06)",
      channelBackground: "rgba(255,255,255,0.04)",
      metricBackground: "rgba(18, 21, 27, 0.85)",
      attentionBackground: "rgba(240, 128, 60, 0.1)",
      attentionText: "#ffb27d",
    },
    floor: {
      surfaceStops: ["#0c0e12", "#12151b", "#12151b"],
      glowA: [
        "rgba(240,128,60,0.08)",
        "rgba(240,128,60,0.02)",
        "rgba(240,128,60,0)",
      ],
      glowB: [
        "rgba(255,178,125,0.05)",
        "rgba(255,178,125,0.01)",
        "rgba(255,178,125,0)",
      ],
      gridStroke: "rgba(255, 255, 255, 0.03)",
      frameStroke: "rgba(255, 255, 255, 0.08)",
      deskShadow: "#000000",
      avatarPlate: "rgba(24, 28, 36, 0.95)",
      statusBadgeBackground: "#181c24",
      speechBubbleBackground: "rgba(31, 36, 46, 0.95)",
      channelChipBackground: "rgba(255, 255, 255, 0.05)",
    },
    scene: {
      background: "#0c0e12",
      fog: "#0c0e12",
      lightA: "#f0803c",
      lightB: "#ffb27d",
      lightC: "#fec84b",
      controlInactiveBackground: "rgba(255,255,255,0.05)",
      hintBackground: "rgba(18,21,27,0.85)",
      hintText: "#a3abb8",
      labelBackground: "rgba(24, 28, 36, 0.9)",
      labelText: "#edeff3",
      toolBackground: "rgba(31, 36, 46, 0.95)",
      bubbleBackground: "rgba(31, 36, 46, 0.95)",
      bubbleText: "#edeff3",
      ringFill: "#1f242e",
      keyboard: "#edeff3",
      mouth: "#ffb27d",
      visor: "#f0803c",
      eyes: "#edeff3",
      eyeGlow: "#f0803c",
      ground: "#0c0e12",
      gridMajor: "#181c24",
      gridMinor: "#12151b",
    },
    status: {
      idle: "#3dd68c",
      thinking: "#fec84b",
      speaking: "#f0803c",
      tool_calling: "#ffb27d",
      error: "#f26d63",
      offline: "#7e8696",
    },
    zones: {
      workspace: {
        fill: "rgba(24, 28, 36, 0.5)",
        glow: "#f0803c",
        edge: "rgba(255, 255, 255, 0.1)",
        label: "#edeff3",
      },
      meeting: {
        fill: "rgba(254, 200, 75, 0.05)",
        glow: "#fec84b",
        edge: "rgba(254, 200, 75, 0.15)",
        label: "#fec84b",
      },
      hotdesk: {
        fill: "rgba(61, 214, 140, 0.05)",
        glow: "#3dd68c",
        edge: "rgba(61, 214, 140, 0.15)",
        label: "#3dd68c",
      },
      lounge: {
        fill: "rgba(255, 178, 125, 0.05)",
        glow: "#ffb27d",
        edge: "rgba(255, 178, 125, 0.15)",
        label: "#ffb27d",
      },
    },
    character: {
      body: "#f0803c",
      bodyShadow: "#a8370a",
      bodyHighlight: "#ff9d5c",
      eye: "#edeff3",
      eyeGlow: "#ffb27d",
      antenna: "#ffb27d",
      outline: "#1a0e05",
    },
    channels: {
      slack: "#3dd68c",
      discord: "#61c3ff",
      email: "#fec84b",
      generic: "#a3abb8",
    },
    motion: {
      durations: { fast: 0.25, base: 0.45, slow: 0.8, link: 1.0 },
      ease: {
        in: "power2.in",
        out: "power2.out",
        inOut: "power2.inOut",
        pop: "back.out(1.7)",
        flow: "none",
      },
      stagger: { entrance: 0.06 },
    },
  },
  light: {
    meta: {
      isDark: false,
      mode: "light",
    },
    typography: {
      display:
        '"Plus Jakarta Sans", "PingFang SC", "Helvetica Neue", sans-serif',
      mono: '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace',
    },
    surface: {
      page: "#f9f8f6",
      shell: "#fffefc",
      panel: "#fffefc",
      panelRaised: "#fae8d8",
      border: "rgba(51, 51, 51, 0.16)",
      textPrimary: "#333333",
      textSecondary: "#666666",
      textMuted: "#9ca3af",
      cyan: "#e36636",
      blue: "#c2410c",
      violet: "#a8370a",
      magenta: "#c2410c",
      amber: "#854708",
      orange: "#b42318",
      mint: "#0f9f7f",
      onAccent: "#ffffff",
    },
    page: {
      background:
        "radial-gradient(circle at 18% 10%, rgba(194,65,12,0.10) 0%, transparent 30%), radial-gradient(circle at 82% 14%, rgba(227,102,54,0.08) 0%, transparent 26%), linear-gradient(180deg, #f9f8f6 0%, #f3efe8 100%)",
      grid: "linear-gradient(rgba(194, 65, 12, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(194, 65, 12, 0.08) 1px, transparent 1px)",
    },
    shell: {
      background: "linear-gradient(180deg, #fffefc 0%, #f9f8f6 100%)",
      shadow:
        "0 24px 60px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.8)",
    },
    header: {
      background: "linear-gradient(180deg, #fffefc 0%, #fffefc 100%)",
      glow: "radial-gradient(circle at 18% 12%, rgba(194,65,12,0.06) 0%, transparent 38%)",
      chipBackground: "rgba(0, 0, 0, 0.03)",
      tagBackground: "rgba(194, 65, 12, 0.08)",
      tagText: "#c2410c",
    },
    layout: {
      grid: "rgba(0, 0, 0, 0.03)",
      shellGlow: "rgba(194, 65, 12, 0.06)",
      shellGlowWarm: "rgba(194, 65, 12, 0.04)",
      overlay: "rgba(249, 248, 246, 0.85)",
    },
    panel: {
      subtleBackground: "rgba(255, 255, 255, 0.8)",
      strongBackground: "rgba(255, 255, 255, 0.9)",
      softBackground: "rgba(255, 255, 255, 0.95)",
      overlayBackground:
        "linear-gradient(180deg, rgba(249,248,246,0.98) 0%, rgba(255,255,255,0.96) 100%)",
      closeButtonBackground: "rgba(0, 0, 0, 0.05)",
      channelBackground: "rgba(0,0,0,0.03)",
      metricBackground: "rgba(255, 255, 255, 0.85)",
      attentionBackground: "rgba(194, 65, 12, 0.08)",
      attentionText: "#c2410c",
    },
    floor: {
      surfaceStops: ["#f9f8f6", "#fffefc", "#fffefc"],
      glowA: [
        "rgba(194,65,12,0.06)",
        "rgba(194,65,12,0.02)",
        "rgba(194,65,12,0)",
      ],
      glowB: [
        "rgba(227,102,54,0.04)",
        "rgba(227,102,54,0.01)",
        "rgba(227,102,54,0)",
      ],
      gridStroke: "rgba(0, 0, 0, 0.03)",
      frameStroke: "rgba(0, 0, 0, 0.08)",
      deskShadow: "#d5dce6",
      avatarPlate: "rgba(255, 255, 255, 0.98)",
      statusBadgeBackground: "#fffefc",
      speechBubbleBackground: "rgba(255, 255, 255, 0.98)",
      channelChipBackground: "rgba(0, 0, 0, 0.03)",
    },
    scene: {
      background: "#f9f8f6",
      fog: "#f9f8f6",
      lightA: "#c2410c",
      lightB: "#e36636",
      lightC: "#854708",
      controlInactiveBackground: "rgba(0,0,0,0.05)",
      hintBackground: "rgba(255,255,255,0.85)",
      hintText: "#666666",
      labelBackground: "rgba(255, 255, 255, 0.95)",
      labelText: "#333333",
      toolBackground: "rgba(255, 255, 255, 0.98)",
      bubbleBackground: "rgba(255, 255, 255, 0.98)",
      bubbleText: "#333333",
      ringFill: "#f0efea",
      keyboard: "#333333",
      mouth: "#e36636",
      visor: "#c2410c",
      eyes: "#333333",
      eyeGlow: "#c2410c",
      ground: "#f9f8f6",
      gridMajor: "#fffefc",
      gridMinor: "#f0efea",
    },
    status: {
      idle: "#0f9f7f",
      thinking: "#854708",
      speaking: "#c2410c",
      tool_calling: "#e36636",
      error: "#b42318",
      offline: "#9ca3af",
    },
    zones: {
      workspace: {
        fill: "rgba(255, 255, 255, 0.5)",
        glow: "#c2410c",
        edge: "rgba(0, 0, 0, 0.08)",
        label: "#333333",
      },
      meeting: {
        fill: "rgba(133, 71, 8, 0.04)",
        glow: "#854708",
        edge: "rgba(133, 71, 8, 0.12)",
        label: "#854708",
      },
      hotdesk: {
        fill: "rgba(15, 159, 127, 0.04)",
        glow: "#0f9f7f",
        edge: "rgba(15, 159, 127, 0.12)",
        label: "#0f9f7f",
      },
      lounge: {
        fill: "rgba(227, 102, 54, 0.04)",
        glow: "#e36636",
        edge: "rgba(227, 102, 54, 0.12)",
        label: "#e36636",
      },
    },
    character: {
      body: "#c2410c",
      bodyShadow: "#a8370a",
      bodyHighlight: "#e36636",
      eye: "#333333",
      eyeGlow: "#e36636",
      antenna: "#e36636",
      outline: "#ffffff",
    },
    channels: {
      slack: "#0f9f7f",
      discord: "#005694",
      email: "#854708",
      generic: "#666666",
    },
    motion: {
      durations: { fast: 0.25, base: 0.45, slow: 0.8, link: 1.0 },
      ease: {
        in: "power2.in",
        out: "power2.out",
        inOut: "power2.inOut",
        pop: "back.out(1.7)",
        flow: "none",
      },
      stagger: { entrance: 0.06 },
    },
  },
};

function normalizeOfficeThemeMode(mode) {
  return mode === "light" ? "light" : "default";
}

export function resolveOfficeThemeMode() {
  if (typeof document !== "undefined") {
    const htmlTheme = document.documentElement?.getAttribute?.("data-theme");
    if (htmlTheme) return normalizeOfficeThemeMode(htmlTheme);
  }
  return "default";
}

export function getOfficeTheme(mode = resolveOfficeThemeMode()) {
  return OFFICE_THEME_PALETTES[normalizeOfficeThemeMode(mode)];
}

function getThemeValue(path = []) {
  return path.reduce((value, key) => value?.[key], getOfficeTheme());
}

function createOfficeThemeProxy(path = []) {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === Symbol.toStringTag) return "OfficeThemeProxy";
        const nextPath = [...path, property];
        const value = getThemeValue(nextPath);
        if (value && typeof value === "object") {
          return createOfficeThemeProxy(nextPath);
        }
        return value;
      },
      ownKeys() {
        return Reflect.ownKeys(getThemeValue(path) || {});
      },
      getOwnPropertyDescriptor() {
        return {
          enumerable: true,
          configurable: true,
        };
      },
    }
  );
}

export const OFFICE_THEME = createOfficeThemeProxy();
