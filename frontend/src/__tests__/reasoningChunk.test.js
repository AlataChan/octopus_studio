/**
 * Tests for reasoningChunk socket event handling and rendering.
 *
 * Uses static source analysis (consistent with workspaceChatEventWiring.test.js)
 * plus extracted-logic behavioral tests that don't require browser globals.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const agentSource = readFileSync(
  resolve("src/utils/chat/agent.js"),
  "utf8"
);
const chatHistorySource = readFileSync(
  resolve(
    "src/components/WorkspaceChat/ChatContainer/ChatHistory/index.jsx"
  ),
  "utf8"
);
const agentProcessGroupSource = readFileSync(
  resolve(
    "src/components/WorkspaceChat/ChatContainer/ChatHistory/AgentProcessGroup/index.jsx"
  ),
  "utf8"
);

// ─── Static source analysis ───────────────────────────────────────────────────

describe("agent.js — reasoningChunk in handledEvents", () => {
  it("includes reasoningChunk in the handledEvents list", () => {
    expect(agentSource).toContain('"reasoningChunk"');
  });

  it("handles reasoningChunk type with a dedicated if-block before the fallthrough guard", () => {
    // The handler must appear before the `handledEvents.includes` guard so that
    // truncated:true events (payload === undefined) are not silently dropped.
    const handlerIdx = agentSource.indexOf('data.type === "reasoningChunk"');
    const guardIdx = agentSource.indexOf(
      "if (!handledEvents.includes(data.type) || payload == null) return;"
    );
    expect(handlerIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(handlerIdx).toBeLessThan(guardIdx);
  });

  it("coalesces chunks by appending to the last reasoningChunk message (findLastIndex pattern)", () => {
    expect(agentSource).toMatch(/findLastIndex[\s\S]*reasoningChunk/);
  });

  it("handles the truncated marker and appends a truncation note", () => {
    expect(agentSource).toContain("data.truncated");
    expect(agentSource).toContain("推理已截断");
  });
});

// ─── ChatHistory buildMessages folding ────────────────────────────────────────

describe("ChatHistory buildMessages — reasoningChunk folds into processGroup", () => {
  it("detects reasoningChunk type and calls ensureProcessGroup", () => {
    // The source must contain a branch that checks for reasoningChunk and
    // pushes a { kind: "reasoning", payload } item onto the process group.
    expect(chatHistorySource).toMatch(/type === "reasoningChunk"/);
    expect(chatHistorySource).toContain('kind: "reasoning"');
  });

  it("uses ensureProcessGroup() for reasoning items (same pattern as statusResponse)", () => {
    expect(chatHistorySource).toMatch(
      /reasoningChunk[\s\S]{0,200}ensureProcessGroup/
    );
  });
});

// ─── AgentProcessGroup rendering ─────────────────────────────────────────────

describe("AgentProcessGroup — renders reasoning items", () => {
  it("renders a ReasoningBlock component for kind=reasoning items", () => {
    expect(agentProcessGroupSource).toContain('item.kind === "reasoning"');
    expect(agentProcessGroupSource).toContain("ReasoningBlock");
  });

  it("ReasoningBlock is default-collapsed (useState(false))", () => {
    expect(agentProcessGroupSource).toContain("useState(false)");
  });

  it("ReasoningBlock passes truncated prop from item payload", () => {
    expect(agentProcessGroupSource).toContain("item.payload?.truncated");
  });

  it("displays 💭 推理 label via i18n key reasoning_section", () => {
    expect(agentProcessGroupSource).toContain("reasoning_section");
  });
});

// ─── i18n keys ────────────────────────────────────────────────────────────────

describe("i18n — reasoning keys present in both locales", () => {
  const enLocale = readFileSync(
    resolve("src/locales/en/common.js"),
    "utf8"
  );
  const zhLocale = readFileSync(
    resolve("src/locales/zh/common.js"),
    "utf8"
  );

  it("en locale has reasoning_section key", () => {
    expect(enLocale).toContain("reasoning_section");
  });

  it("zh locale has reasoning_section key with 推理", () => {
    expect(zhLocale).toContain("reasoning_section");
    expect(zhLocale).toContain("推理");
  });

  it("en locale has reasoning_truncated key", () => {
    expect(enLocale).toContain("reasoning_truncated");
  });

  it("zh locale has reasoning_truncated key", () => {
    expect(zhLocale).toContain("reasoning_truncated");
  });
});

// ─── Behavioral: coalescing logic (extracted, no browser globals needed) ─────

/**
 * Extract and exercise the coalescing logic in isolation.
 * We replicate the core pattern from handleSocketResponse for reasoningChunk
 * to verify chunks accumulate into one item rather than producing N items.
 */
function simulateReasoningChunkHandler(events) {
  // Minimal simulation of the setChatHistory reducer used in agent.js
  let history = [];

  const REASONING_UUID_PREFIX = "reasoning-stream-";
  let uuidCounter = 0;
  const mockV4 = () => `uuid-${++uuidCounter}`;

  for (const data of events) {
    const payload = data.content ?? data.data;

    // Mirror the handler logic from agent.js
    history = (() => {
      const prev = history;
      const lastReasoningIndex = prev.findLastIndex(
        (msg) =>
          msg.type === "reasoningChunk" &&
          msg.uuid?.startsWith(REASONING_UUID_PREFIX)
      );

      if (data.truncated) {
        const truncationNote = "（推理已截断）";
        if (lastReasoningIndex >= 0) {
          const updated = [...prev];
          updated[lastReasoningIndex] = {
            ...updated[lastReasoningIndex],
            content: (updated[lastReasoningIndex].content || "") + truncationNote,
            truncated: true,
          };
          return updated;
        }
        return [
          ...prev,
          {
            uuid: `${REASONING_UUID_PREFIX}${mockV4()}`,
            type: "reasoningChunk",
            content: truncationNote,
            truncated: true,
            role: "assistant",
            sources: [],
            closed: true,
            error: null,
            animate: false,
            pending: false,
          },
        ];
      }

      const chunkText = payload ?? "";
      if (lastReasoningIndex >= 0) {
        const updated = [...prev];
        updated[lastReasoningIndex] = {
          ...updated[lastReasoningIndex],
          content: (updated[lastReasoningIndex].content || "") + chunkText,
        };
        return updated;
      }

      return [
        ...prev,
        {
          uuid: `${REASONING_UUID_PREFIX}${mockV4()}`,
          type: "reasoningChunk",
          content: chunkText,
          role: "assistant",
          sources: [],
          closed: true,
          error: null,
          animate: false,
          pending: false,
        },
      ];
    })();
  }

  return history;
}

describe("reasoningChunk coalescing logic (behavioral)", () => {
  it("produces exactly one chat-history item for a sequence of chunks", () => {
    const events = [
      { type: "reasoningChunk", content: "First " },
      { type: "reasoningChunk", content: "Second " },
      { type: "reasoningChunk", content: "Third." },
    ];

    const result = simulateReasoningChunkHandler(events);

    const reasoningItems = result.filter((m) => m.type === "reasoningChunk");
    expect(reasoningItems).toHaveLength(1);
    expect(reasoningItems[0].content).toBe("First Second Third.");
  });

  it("appends truncation note to the accumulated message", () => {
    const events = [
      { type: "reasoningChunk", content: "Partial reasoning" },
      { type: "reasoningChunk", truncated: true },
    ];

    const result = simulateReasoningChunkHandler(events);

    const reasoningItems = result.filter((m) => m.type === "reasoningChunk");
    expect(reasoningItems).toHaveLength(1);
    expect(reasoningItems[0].content).toContain("Partial reasoning");
    expect(reasoningItems[0].content).toContain("推理已截断");
    expect(reasoningItems[0].truncated).toBe(true);
  });

  it("creates a standalone truncated item when no prior chunk exists", () => {
    const events = [{ type: "reasoningChunk", truncated: true }];

    const result = simulateReasoningChunkHandler(events);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("reasoningChunk");
    expect(result[0].content).toContain("推理已截断");
    expect(result[0].truncated).toBe(true);
  });

  it("assigns uuid with reasoning-stream- prefix", () => {
    const events = [{ type: "reasoningChunk", content: "hello" }];
    const result = simulateReasoningChunkHandler(events);
    expect(result[0].uuid).toMatch(/^reasoning-stream-/);
  });
});
