import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAssistantSelectionAfterLoad } from "@/components/AssistantSelector";

const assistants = [
  { id: "assistant-default", enabled: true },
  { id: "assistant-target", enabled: true },
];

function readSource(path) {
  return readFileSync(resolve(path), "utf8");
}

describe("assistant selector route sync", () => {
  test("preserves the route-selected assistant after async assistant loading", () => {
    const selection = getAssistantSelectionAfterLoad({
      assistants,
      selectedAssistantId: "assistant-target",
      didAutoSelect: false,
    });

    expect(selection).toEqual({
      shouldSelect: false,
      nextAssistantId: "assistant-target",
      didAutoSelect: false,
    });
  });

  test("normalizes id types when comparing URL-selected assistant ids", () => {
    const selection = getAssistantSelectionAfterLoad({
      assistants: [{ id: 7, enabled: true }],
      selectedAssistantId: "7",
      didAutoSelect: false,
    });

    expect(selection.shouldSelect).toBe(false);
    expect(selection.nextAssistantId).toBe("7");
  });

  test("auto-selects the first assistant once for a fresh workspace", () => {
    const selection = getAssistantSelectionAfterLoad({
      assistants,
      selectedAssistantId: null,
      didAutoSelect: false,
    });

    expect(selection).toEqual({
      shouldSelect: true,
      nextAssistantId: "assistant-default",
      didAutoSelect: true,
    });
  });

  test("does not reselect a default after the user explicitly clears selection", () => {
    const selection = getAssistantSelectionAfterLoad({
      assistants,
      selectedAssistantId: null,
      didAutoSelect: true,
    });

    expect(selection.shouldSelect).toBe(false);
  });

  test("chat container consumes assistantId from immutable location.search", () => {
    const chatContainer = readSource(
      "src/components/WorkspaceChat/ChatContainer/index.jsx"
    );

    expect(chatContainer).toContain("new URLSearchParams(location.search)");
    expect(chatContainer).toContain("location.search");
    expect(chatContainer).not.toContain('searchParams.delete("assistantId")');
  });
});
