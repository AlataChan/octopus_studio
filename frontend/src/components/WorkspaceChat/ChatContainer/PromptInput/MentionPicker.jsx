import React from "react";

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === "object") return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function nativeAssistantName(assistant) {
  return (
    assistant?.instanceName ||
    assistant?.template?.employeeName ||
    assistant?.template?.name ||
    assistant?.name ||
    "Assistant"
  );
}

function nativeAssistantDescription(assistant) {
  return (
    assistant?.template?.employeeTitle ||
    assistant?.template?.description ||
    assistant?.description ||
    ""
  );
}

function moltAgentId(agent) {
  return String(
    agent?.molt_agent_id ||
      agent?.moltAgentId ||
      agent?.agentId ||
      agent?.id ||
      ""
  );
}

function moltAgentName(agent) {
  return (
    agent?.display_name ||
    agent?.displayName ||
    agent?.name ||
    agent?.label ||
    moltAgentId(agent) ||
    "Molt agent"
  );
}

function moltAgentDescription(agent) {
  const metadata = parseMetadata(agent?.metadata);
  return (
    metadata.description ||
    agent?.description ||
    agent?.capabilities?.join?.(", ") ||
    ""
  );
}

export function buildMentionCandidates({
  nativeAssistants = [],
  moltAgents = [],
} = {}) {
  const native = nativeAssistants
    .filter((assistant) => assistant?.enabled !== false)
    .map((assistant) => ({
      type: "native",
      id: String(assistant.id),
      name: nativeAssistantName(assistant),
      badge: "Native",
      description: nativeAssistantDescription(assistant),
      raw: assistant,
    }))
    .filter((candidate) => candidate.id && candidate.name);

  const molt = moltAgents
    .filter((agent) => agent?.enabled !== false)
    .map((agent) => ({
      type: "molt",
      id: moltAgentId(agent),
      name: moltAgentName(agent),
      badge: "Molt",
      description: moltAgentDescription(agent),
      raw: agent,
    }))
    .filter((candidate) => candidate.id && candidate.name);

  return [...native, ...molt];
}

export function getMentionQuery(text = "") {
  const match = String(text).match(/(^|\s)@([^\s@]*)$/);
  if (!match) return null;
  return match[2] || "";
}

export function filterMentionCandidates(candidates = [], query = "") {
  const needle = String(query || "").toLowerCase();
  return candidates.filter((candidate) => {
    if (!needle) return true;
    return (
      candidate.name?.toLowerCase?.().includes(needle) ||
      candidate.id?.toLowerCase?.().includes(needle)
    );
  });
}

function removeMentionTrigger(text = "") {
  return String(text).replace(/(^|\s)@([^\s@]*)$/, "$1");
}

export function selectMentionCandidate({
  currentText = "",
  currentMentions = [],
  candidate,
} = {}) {
  if (!candidate) return { text: currentText, mentions: currentMentions };

  const exists = currentMentions.some(
    (mention) => mention.type === candidate.type && mention.id === candidate.id
  );
  return {
    text: removeMentionTrigger(currentText),
    mentions: exists ? currentMentions : [...currentMentions, candidate],
  };
}

export function applyMentionBackspace({ key, text = "", mentions = [] } = {}) {
  if (key !== "Backspace" || String(text).length > 0 || mentions.length === 0) {
    return { handled: false, mentions };
  }
  return { handled: true, mentions: mentions.slice(0, -1) };
}

export function MentionChip({
  mention,
  onRemove = () => {},
  t = (key) => key,
}) {
  if (!mention) return null;
  const isMolt = mention.type === "molt";
  const badge = isMolt
    ? t("molt.chat.mention_badge")
    : mention.badge || "Native";

  return (
    <span
      data-mention-type={mention.type}
      data-mention-id={mention.id}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
        isMolt
          ? "border-blue-400/40 bg-blue-500/20 text-blue-100"
          : "border-theme-border bg-white/10 text-theme-text-primary"
      }`}
    >
      <span className="font-medium">@{mention.name}</span>
      <span
        className={`rounded px-1 text-[10px] ${
          isMolt ? "bg-blue-400/20 text-blue-100" : "bg-white/10 text-white/60"
        }`}
      >
        {badge}
      </span>
      <button
        type="button"
        aria-label={`Remove ${mention.name}`}
        className="ml-1 text-white/60 hover:text-theme-text-primary"
        onClick={() => onRemove(mention)}
      >
        x
      </button>
    </span>
  );
}

export function MentionPicker({
  candidates = [],
  query = "",
  onSelect = () => {},
  t = (key) => key,
}) {
  const filtered = filterMentionCandidates(candidates, query).slice(0, 8);
  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-[118px] left-2 right-2 z-20 rounded-xl border border-theme-border bg-theme-action-menu-bg p-2 shadow-2xl">
      {filtered.map((candidate) => {
        const isMolt = candidate.type === "molt";
        return (
          <button
            key={`${candidate.type}:${candidate.id}`}
            type="button"
            data-mention-type={candidate.type}
            data-mention-id={candidate.id}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-theme-action-menu-item-hover"
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(candidate);
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-theme-text-primary">
                {candidate.name}
              </span>
              {candidate.description && (
                <span className="block truncate text-xs text-theme-text-secondary">
                  {candidate.description}
                </span>
              )}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[11px] ${
                isMolt
                  ? "bg-blue-500/20 text-blue-100"
                  : "bg-white/10 text-white/60"
              }`}
            >
              {isMolt ? t("molt.chat.mention_badge") : candidate.badge}
            </span>
          </button>
        );
      })}
    </div>
  );
}
