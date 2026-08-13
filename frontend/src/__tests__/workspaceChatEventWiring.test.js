import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const chatContainerSource = readFileSync(
  resolve("src/components/WorkspaceChat/ChatContainer/index.jsx"),
  "utf8"
);
const workspaceChatPageSource = readFileSync(
  resolve("src/pages/WorkspaceChat/index.jsx"),
  "utf8"
);

describe("workspace chat event wiring", () => {
  it("exports a submit event constant for cross-panel chat submissions", () => {
    expect(chatContainerSource).toContain(
      "export const WORKSPACE_CHAT_SUBMIT_EVENT"
    );
  });

  it("listens for the submit event and routes it through sendCommand", () => {
    expect(chatContainerSource).toMatch(
      /window\.addEventListener\(\s*WORKSPACE_CHAT_SUBMIT_EVENT,\s*handleWorkspaceChatSubmit/s
    );
    expect(chatContainerSource).toMatch(
      /sendCommand\(\{\s*text:\s*detail\.message,\s*autoSubmit:\s*detail\.autoSubmit \?\? true,\s*attachments:\s*detail\.attachments \?\? \[\]/s
    );
  });

  it("marks workspace chat route transitions as loading before fetching new thread data", () => {
    expect(workspaceChatPageSource).toMatch(
      /setLoading\(true\);[\s\S]*loadWorkspaceChatData\(\{ slug, threadSlug \}\)/
    );
  });

  it("loads non-critical workspace chat extras after the critical route data", () => {
    expect(workspaceChatPageSource).toMatch(
      /loadWorkspaceChatData\(\{ slug, threadSlug \}\)[\s\S]*setLoading\(false\)[\s\S]*loadWorkspaceChatExtras\(\{ slug \}\)/
    );
  });

  it("guards late workspace chat extras against stale route updates", () => {
    expect(workspaceChatPageSource).toMatch(/if \(isCancelled\) return;/);
    expect(workspaceChatPageSource).toMatch(
      /mergeWorkspaceChatExtras\(\s*currentWorkspace,\s*loadedWorkspace\.slug,\s*extras\s*\)/
    );
  });

  it("syncs local chat history when route-loaded thread history changes", () => {
    expect(chatContainerSource).toMatch(
      /setChatHistory\(\s*Array\.isArray\(knownHistory\)\s*\?\s*knownHistory\s*:\s*\[\]\s*\)/
    );
    expect(chatContainerSource).toMatch(
      /\[workspace\?\.slug,\s*threadSlug,\s*knownHistory\]/
    );
  });
});
