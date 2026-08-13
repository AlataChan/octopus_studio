import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  MentionChip,
  MentionPicker,
  applyMentionBackspace,
  buildMentionCandidates,
  getMentionQuery,
  selectMentionCandidate,
} from "@/components/WorkspaceChat/ChatContainer/PromptInput/MentionPicker";
import {
  MoltBubbleLabel,
  appendMoltStreamChunk,
  applyMoltStreamError,
  buildMoltScopeKey,
  selectPrimaryMoltMention,
  shouldPreserveMoltInput,
} from "@/components/WorkspaceChat/ChatContainer/moltChatHelpers";

const root = process.cwd();

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const nativeAssistant = {
  id: "native-1",
  instanceName: "Researcher",
  template: {
    employeeName: "Researcher",
    employeeTitle: "Native assistant",
    description: "Searches workspace docs",
  },
};

const moltAgent = {
  id: 1,
  molt_agent_id: "molt-matrix",
  display_name: "Matrix Coordinator",
  metadata: JSON.stringify({ description: "Coordinates Molt agents" }),
  enabled: true,
};

const t = (key, values = {}) =>
  ({
    "molt.chat.mention_badge": "Molt",
    "molt.chat.bubble_label": `via SGA-Molt: ${values.agent}`,
    "molt.chat.thread_stale_title": "Molt thread not found",
    "molt.chat.thread_stale_action": "Start new conversation",
  })[key] || key;

describe("workspace chat Molt @-mention integration", () => {
  test("input @ opens candidates containing native and Molt agents", () => {
    const candidates = buildMentionCandidates({
      nativeAssistants: [nativeAssistant],
      moltAgents: [moltAgent],
    });

    expect(getMentionQuery("ask @")).toBe("");
    expect(candidates.map((candidate) => candidate.type)).toEqual([
      "native",
      "molt",
    ]);
    expect(candidates.map((candidate) => candidate.name)).toEqual([
      "Researcher",
      "Matrix Coordinator",
    ]);
  });

  test("candidate metadata is structured rather than plain text", () => {
    const [native, molt] = buildMentionCandidates({
      nativeAssistants: [nativeAssistant],
      moltAgents: [moltAgent],
    });

    expect(native).toMatchObject({
      type: "native",
      id: "native-1",
      name: "Researcher",
      badge: "Native",
    });
    expect(molt).toMatchObject({
      type: "molt",
      id: "molt-matrix",
      name: "Matrix Coordinator",
      badge: "Molt",
      description: "Coordinates Molt agents",
    });
  });

  test("molt candidates render a blue Molt badge", () => {
    const candidates = buildMentionCandidates({
      nativeAssistants: [nativeAssistant],
      moltAgents: [moltAgent],
    });
    const markup = renderToStaticMarkup(
      <MentionPicker
        candidates={candidates}
        query=""
        onSelect={() => {}}
        t={t}
      />
    );

    expect(markup).toContain('data-mention-type="molt"');
    expect(markup).toContain("Matrix Coordinator");
    expect(markup).toContain("bg-blue-500/20");
  });

  test("selecting a Molt agent creates a removable chip", () => {
    const candidate = buildMentionCandidates({
      nativeAssistants: [],
      moltAgents: [moltAgent],
    })[0];
    const result = selectMentionCandidate({
      currentText: "Ask @mat",
      currentMentions: [],
      candidate,
    });
    const markup = renderToStaticMarkup(
      <MentionChip mention={result.mentions[0]} onRemove={() => {}} t={t} />
    );

    expect(result.text).toBe("Ask ");
    expect(markup).toContain('data-mention-type="molt"');
    expect(markup).toContain("Matrix Coordinator");
    expect(markup).toContain("Molt");
  });

  test("backspace removes the whole chip when text is empty", () => {
    const mentions = [
      { type: "molt", id: "molt-matrix", name: "Matrix Coordinator" },
    ];

    expect(
      applyMentionBackspace({ key: "Backspace", text: "", mentions })
    ).toEqual({ handled: true, mentions: [] });
  });

  test("sending with a Molt chip routes to Molt.streamWorkspaceAgent", () => {
    const chatContainer = source(
      "src/components/WorkspaceChat/ChatContainer/index.jsx"
    );

    expect(chatContainer).toContain("Molt.streamWorkspaceAgent");
    expect(chatContainer).toContain("promptMessage?.moltAgent");
  });

  test("sending without a Molt chip keeps the native path", () => {
    const result = selectPrimaryMoltMention([
      { type: "native", id: "native-1", name: "Researcher" },
    ]);

    expect(result.primary).toBe(null);
    expect(result.ignored).toEqual([]);
  });

  test("multiple Molt chips use the first and warn about the rest", () => {
    const result = selectPrimaryMoltMention([
      { type: "molt", id: "molt-1", name: "One" },
      { type: "molt", id: "molt-2", name: "Two" },
    ]);

    expect(result.primary).toMatchObject({ id: "molt-1" });
    expect(result.ignored).toEqual([
      { type: "molt", id: "molt-2", name: "Two" },
    ]);
    expect(result.hasIgnored).toBe(true);
  });

  test("SSE chunks accumulate in the Molt assistant bubble", () => {
    const next = appendMoltStreamChunk(
      [
        { role: "user", content: "hello" },
        {
          uuid: "reply-1",
          role: "assistant",
          content: "hel",
          moltAgent: { name: "Matrix Coordinator" },
        },
      ],
      "reply-1",
      "lo"
    );

    expect(next[1].content).toBe("hello");
    expect(next[1].pending).toBe(false);
    expect(next[1].animate).toBe(true);
  });

  test("bubble label renders via SGA-Molt agent name", () => {
    const markup = renderToStaticMarkup(
      <MoltBubbleLabel agent={{ name: "Matrix Coordinator" }} t={t} />
    );

    expect(markup).toContain("via SGA-Molt: Matrix Coordinator");
  });

  test("error frames become assistant bubble errors", () => {
    const next = applyMoltStreamError(
      [
        {
          uuid: "reply-1",
          role: "assistant",
          content: "",
          pending: true,
          moltAgent: { name: "Matrix Coordinator" },
        },
      ],
      "reply-1",
      { code: "thread_stale", message: "Molt thread not found" }
    );

    expect(next.history[0].error).toBe("Molt thread not found");
    expect(next.threadStale).toBe(true);
  });

  test("thread stale UI exposes a start new conversation action", () => {
    const chatContainer = source(
      "src/components/WorkspaceChat/ChatContainer/index.jsx"
    );

    expect(chatContainer).toContain("molt.chat.thread_stale_title");
    expect(chatContainer).toContain("molt.chat.thread_stale_action");
  });

  test("Molt offline preserves input for retry", () => {
    expect(shouldPreserveMoltInput({ code: "molt_offline" })).toBe(true);
  });

  test("required i18n keys exist", () => {
    const zh = source("src/locales/zh/common.js");
    const en = source("src/locales/en/common.js");
    const keys = [
      "molt.chat.mention_badge",
      "molt.chat.bubble_label",
      "molt.chat.offline_error",
      "molt.chat.thread_stale_title",
      "molt.chat.thread_stale_action",
      "molt.chat.multi_molt_warning",
      "molt.chat.send_error_generic",
    ];

    for (const key of keys) {
      expect(zh).toContain(key);
      expect(en).toContain(key);
    }
  });
});
