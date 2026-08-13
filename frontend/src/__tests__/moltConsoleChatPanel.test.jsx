import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import MoltAgentChatPanel, {
  sendConsoleMessage,
} from "@/pages/Admin/SgaSettings/MoltAgentChatPanel";

const root = process.cwd();

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const translations = {
  "molt.console.chat.title": "Chat with {{agent}}",
  "molt.console.chat.send": "Send",
  "molt.console.chat.loading": "Sending...",
  "molt.console.chat.error": "Unable to chat with this Molt agent.",
  "molt.console.chat.placeholder": "Ask this Molt agent a question...",
  "molt.console.chat.close": "Close",
  "molt.console.agents.chat_action": "Chat",
};

function t(key, values = {}) {
  return (translations[key] || key).replace("{{agent}}", values.agent);
}

describe("Molt console chat panel", () => {
  test("panel renders selected agent name and id", () => {
    const markup = renderToStaticMarkup(
      <MoltAgentChatPanel
        agentId="molt-matrix"
        agentName="Matrix Coordinator"
        onClose={() => {}}
        t={t}
      />
    );

    expect(markup).toContain("Chat with Matrix Coordinator");
    expect(markup).toContain("molt-matrix");
    expect(markup).toContain("Ask this Molt agent a question...");
  });

  test("send helper calls Molt.chatConsoleAgent with agent id and message", async () => {
    const chatConsoleAgent = vi.fn(async () => ({
      success: true,
      answer: "Molt answer",
    }));

    const result = await sendConsoleMessage({
      agentId: "molt-matrix",
      message: "Introduce your workflow",
      chatConsoleAgent,
    });

    expect(chatConsoleAgent).toHaveBeenCalledWith(
      "molt-matrix",
      "Introduce your workflow"
    );
    expect(result.clearInput).toBe(true);
  });

  test("successful response produces user and assistant bubbles", async () => {
    const result = await sendConsoleMessage({
      agentId: "molt-matrix",
      message: "hello",
      chatConsoleAgent: vi.fn(async () => ({
        success: true,
        answer: "Molt answer",
      })),
    });
    const markup = renderToStaticMarkup(
      <MoltAgentChatPanel
        agentId="molt-matrix"
        agentName="Matrix Coordinator"
        initialMessages={result.messages}
        onClose={() => {}}
        t={t}
      />
    );

    expect(markup).toContain("hello");
    expect(markup).toContain("Molt answer");
    expect(markup).toContain("Assistant");
  });

  test("failed response returns friendly error and keeps input", async () => {
    const result = await sendConsoleMessage({
      agentId: "missing-agent",
      message: "hello",
      chatConsoleAgent: vi.fn(async () => ({
        success: false,
        code: "agent_not_found",
        error: { message: "Agent not found" },
      })),
    });

    expect(result.error).toContain("Agent not found");
    expect(result.clearInput).toBe(false);
    expect(result.messages).toEqual([]);
  });

  test("network error returns friendly error and keeps input", async () => {
    const result = await sendConsoleMessage({
      agentId: "molt-matrix",
      message: "hello",
      chatConsoleAgent: vi.fn(async () => {
        throw new Error("Network down");
      }),
    });

    expect(result.error).toContain("Network down");
    expect(result.clearInput).toBe(false);
  });

  test("loading state disables send button", () => {
    const markup = renderToStaticMarkup(
      <MoltAgentChatPanel
        agentId="molt-matrix"
        agentName="Matrix Coordinator"
        isSendingForTest
        onClose={() => {}}
        t={t}
      />
    );

    expect(markup).toContain("Sending...");
    expect(markup).toContain('disabled=""');
  });

  test("panel exposes a close button wired to onClose", () => {
    const markup = renderToStaticMarkup(
      <MoltAgentChatPanel
        agentId="molt-matrix"
        agentName="Matrix Coordinator"
        onClose={() => {}}
        t={t}
      />
    );

    expect(markup).toContain("Close");
    expect(markup).toContain('aria-label="Close"');
  });

  test("defines required chat and action translation keys", () => {
    const zh = source("src/locales/zh/common.js");
    const en = source("src/locales/en/common.js");
    const keys = [
      "molt.console.agents.chat_action",
      "molt.console.chat.title",
      "molt.console.chat.send",
      "molt.console.chat.loading",
      "molt.console.chat.error",
      "molt.console.chat.placeholder",
      "molt.console.chat.close",
    ];

    for (const key of keys) {
      expect(zh).toContain(key);
      expect(en).toContain(key);
    }
  });

  test("console agents section wires the Chat action", () => {
    const page = source("src/pages/Admin/SgaSettings/index.jsx");

    expect(page).toContain("MoltAgentChatPanel");
    expect(page).toContain("setSelectedAgent");
    expect(page).toContain("molt.console.agents.chat_action");
  });
});
