import { OFFICE_THEME } from "@/components/Office/theme";
import { API_BASE } from "@/utils/constants";

const VISUAL_VARIANTS = [
  {
    key: "ember",
    body: "#ff6a59",
    shadow: "#b53a3e",
    highlight: "#ffb08d",
    trim: "#ff7a1a",
    belly: "#ffd9bd",
  },
  {
    key: "neon-iris",
    body: "#ff5fb2",
    shadow: "#9f2f6d",
    highlight: "#ffb6e3",
    trim: "#8d4dff",
    belly: "#ffdff6",
  },
  {
    key: "signal-blue",
    body: "#4b7cff",
    shadow: "#2446b8",
    highlight: "#a7c0ff",
    trim: "#2ee6ff",
    belly: "#dff9ff",
  },
  {
    key: "mint-shift",
    body: "#20c7a8",
    shadow: "#128171",
    highlight: "#92ffe1",
    trim: "#2ee6ff",
    belly: "#d9fff7",
  },
];

function hashValue(value = "") {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function firstLatinInitial(input) {
  const match = String(input || "")
    .trim()
    .match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : "";
}

function firstCjkCharacter(input) {
  const match = String(input || "").match(/[\u3400-\u9FFF]/u);
  return match ? match[0] : "";
}

export function extractActorMonogram(name = "") {
  const cjk = firstCjkCharacter(name);
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (cjk) {
    const latin = firstLatinInitial(words.slice(1).join(" ") || name);
    return `${cjk}${latin}`.trim() || cjk;
  }

  if (words.length >= 2) {
    return `${firstLatinInitial(words[0])}${firstLatinInitial(words[1])}`;
  }

  const compact = String(name || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return compact.slice(0, 2) || "AI";
}

export function getActorAvatarPresentation(actor = {}) {
  const monogram = extractActorMonogram(actor.name);
  if (actor.avatar) {
    const avatarValue =
      String(actor.avatar).startsWith("http://") ||
      String(actor.avatar).startsWith("https://") ||
      String(actor.avatar).startsWith("/")
        ? actor.avatar
        : `${API_BASE}/assistant-library/icon/${actor.avatar}`;

    return {
      kind: "image",
      value: avatarValue,
      monogram,
    };
  }

  return {
    kind: "monogram",
    value: monogram.slice(0, 1) || "AI",
    monogram,
  };
}

export function getActorVisualProfile(actor = {}) {
  const variant =
    VISUAL_VARIANTS[
      hashValue(actor.id || actor.name || actor.workspaceSlug || "office") %
        VISUAL_VARIANTS.length
    ];

  return {
    variantKey: variant.key,
    body: variant.body,
    shadow: variant.shadow,
    highlight: variant.highlight,
    trim: variant.trim,
    belly: variant.belly,
    signal: OFFICE_THEME.status[actor.status] || OFFICE_THEME.status.idle,
    monogram: extractActorMonogram(actor.name),
    isDimmed: actor.status === "offline",
  };
}
