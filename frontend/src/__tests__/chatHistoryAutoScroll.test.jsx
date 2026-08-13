import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock(
  "@/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage",
  () => ({ default: () => null })
);
vi.mock(
  "@/components/WorkspaceChat/ChatContainer/ChatHistory/PromptReply",
  () => ({
    default: () => null,
  })
);
vi.mock(
  "@/components/WorkspaceChat/ChatContainer/ChatHistory/StatusResponse",
  () => ({ default: () => null })
);
vi.mock(
  "@/components/WorkspaceChat/ChatContainer/ChatHistory/FlowProgress",
  () => ({
    default: () => null,
  })
);
vi.mock(
  "@/components/WorkspaceChat/ChatContainer/ChatHistory/AgentTaskListMessage",
  () => ({ default: () => null })
);
vi.mock(
  "@/components/WorkspaceChat/ChatContainer/ChatHistory/Chartable",
  () => ({
    default: () => null,
  })
);
vi.mock("@/components/Modals/ManageWorkspace", () => ({
  default: () => null,
  useManageWorkspaceModal: () => ({
    showing: false,
    showModal: vi.fn(),
    hideModal: vi.fn(),
  }),
}));
vi.mock("@/hooks/useUser", () => ({ default: () => ({ user: null }) }));
vi.mock("@/hooks/useTextSize", () => ({
  default: () => ({ textSizeClass: "text-sm" }),
}));
vi.mock("@/hooks/useChatMessageAlignment", () => ({
  useChatMessageAlignment: () => ({ getMessageAlignment: () => "" }),
}));
vi.mock("@/models/appearance", () => ({
  default: {
    get: () => false,
    getSettings: () => ({ showScrollbar: true }),
  },
}));

import {
  getChatScrollState,
  isChatScrolledToBottom,
  shouldAutoScrollChat,
} from "@/components/WorkspaceChat/ChatContainer/ChatHistory";

const chatHistorySource = readFileSync(
  resolve("src/components/WorkspaceChat/ChatContainer/ChatHistory/index.jsx"),
  "utf8"
);

describe("chat history auto scroll", () => {
  it("treats subpixel scroll positions as being at the bottom", () => {
    expect(
      isChatScrolledToBottom({
        scrollHeight: 1234.5,
        scrollTop: 934.7,
        clientHeight: 298,
      })
    ).toBe(true);

    expect(
      isChatScrolledToBottom({
        scrollHeight: 1234.5,
        scrollTop: 929,
        clientHeight: 298,
      })
    ).toBe(false);
  });

  it("does not steal scroll while the user is away, then resumes when they return to bottom", () => {
    const away = getChatScrollState({
      scrollHeight: 1000,
      scrollTop: 450,
      clientHeight: 300,
      lastScrollTop: 700,
      isUserScrolling: false,
    });

    expect(away.isAtBottom).toBe(false);
    expect(away.isUserScrolling).toBe(true);
    expect(shouldAutoScrollChat({ ...away, isStreaming: false })).toBe(false);

    const backAtBottom = getChatScrollState({
      scrollHeight: 1000,
      scrollTop: 698.5,
      clientHeight: 300,
      lastScrollTop: away.lastScrollTop,
      isUserScrolling: away.isUserScrolling,
    });

    expect(backAtBottom.isAtBottom).toBe(true);
    expect(backAtBottom.isUserScrolling).toBe(false);
    expect(shouldAutoScrollChat({ ...backAtBottom, isStreaming: false })).toBe(
      true
    );
  });

  it("keeps following a streaming response even when the user is not at bottom", () => {
    expect(
      shouldAutoScrollChat({
        isAtBottom: false,
        isUserScrolling: true,
        isStreaming: true,
      })
    ).toBe(true);
  });

  it("auto-scrolls after streaming ends when the user is still at bottom", () => {
    expect(
      shouldAutoScrollChat({
        isAtBottom: true,
        isUserScrolling: false,
        isStreaming: false,
      })
    ).toBe(true);
  });

  it("memoizes the debounced scroll listener instead of recreating it every render", () => {
    expect(chatHistorySource).toMatch(
      /useMemo\(\s*\(\)\s*=>\s*debounce\(handleScroll,\s*100\),\s*\[\]\s*\)/s
    );
  });
});
