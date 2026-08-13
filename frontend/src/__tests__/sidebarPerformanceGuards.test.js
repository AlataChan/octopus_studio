import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (relativePath) =>
  readFileSync(resolve(relativePath), "utf8");

const activeWorkspacesSource = readSource(
  "src/components/Sidebar/ActiveWorkspaces/index.jsx"
);
const threadContainerSource = readSource(
  "src/components/Sidebar/ActiveWorkspaces/ThreadContainer/index.jsx"
);
const threadItemSource = readSource(
  "src/components/Sidebar/ActiveWorkspaces/ThreadContainer/ThreadItem/index.jsx"
);
const searchBoxSource = readSource(
  "src/components/Sidebar/SearchBox/index.jsx"
);
const keyboardShortcutsSource = readSource("src/utils/keyboardShortcuts.js");
const userCardSource = readSource("src/components/Sidebar/UserCard/index.jsx");
const canViewChatHistorySource = readSource(
  "src/components/CanViewChatHistory/index.jsx"
);
const newWorkspaceModalSource = readSource(
  "src/components/Modals/NewWorkspace.jsx"
);
const chatHistorySource = readSource(
  "src/components/WorkspaceChat/ChatContainer/ChatHistory/index.jsx"
);

describe("sidebar performance guards", () => {
  it("does not eagerly import the manage workspace modal on every page load", () => {
    expect(activeWorkspacesSource).not.toMatch(
      /from\s+["']\.\.\/\.\.\/Modals\/ManageWorkspace["']/
    );
    expect(activeWorkspacesSource).toMatch(
      /import\(\s*["']\.\.\/\.\.\/Modals\/ManageWorkspace["']\s*\)/
    );
  });

  it("defers drag-and-drop workspace ordering dependencies until needed", () => {
    expect(activeWorkspacesSource).not.toMatch(
      /from\s+["']@hello-pangea\/dnd["']/
    );
    expect(activeWorkspacesSource).toMatch(
      /import\(\s*["']@hello-pangea\/dnd["']\s*\)/
    );
  });

  it("uses React Router navigation for workspace links instead of document navigation", () => {
    expect(activeWorkspacesSource).not.toMatch(
      /<a\s+[^>]*href=\{isActive\s*\?\s*null\s*:\s*paths\.workspace\.chat/
    );
  });

  it("uses SPA navigation for thread create, delete, and switching flows", () => {
    expect(threadContainerSource).not.toMatch(
      /window\.location\.(href|replace)\s*=\s*paths/
    );
    expect(threadContainerSource).not.toMatch(
      /window\.location\.replace\(\s*paths/
    );
    expect(threadItemSource).not.toMatch(
      /window\.location\.(href|replace)\s*=\s*paths/
    );
    expect(threadItemSource).not.toMatch(/window\.location\.replace\(\s*paths/);
  });

  it("updates sidebar thread state after creating a thread instead of waiting for refresh", () => {
    expect(threadContainerSource).toContain("appendThreadIfMissing");
    expect(threadContainerSource).toContain("onThreadCreated={addThread}");
    expect(threadContainerSource).toMatch(/finally\s*\{\s*setLoading\(false\)/);
  });

  it("labels the workspace section and exposes workspace graph navigation", () => {
    expect(activeWorkspacesSource).toContain("工作区");
    expect(activeWorkspacesSource).toContain("知识图谱");
    expect(activeWorkspacesSource).toContain(
      "paths.workspace.graph(workspace.slug)"
    );
  });

  it("does not force document navigation from sidebar search results", () => {
    expect(searchBoxSource).not.toMatch(/reloadDocument=\{true\}/);
  });

  it("routes keyboard shortcuts through React Router navigation", () => {
    expect(keyboardShortcutsSource).not.toMatch(
      /window\.location\.href\s*=\s*paths/
    );
    expect(keyboardShortcutsSource).toMatch(/useNavigate/);
  });

  it("keeps logout as an explicit full reload to clear auth state", () => {
    expect(userCardSource).toMatch(/intentional full reload/);
    expect(userCardSource).toMatch(
      /window\.location\.replace\(paths\.login\(true\)\)/
    );
  });

  it("keeps other app route transitions inside the SPA", () => {
    for (const source of [
      canViewChatHistorySource,
      newWorkspaceModalSource,
      chatHistorySource,
    ]) {
      expect(source).not.toMatch(/window\.location\.href\s*=\s*paths/);
      expect(source).not.toMatch(/window\.location\.replace\(\s*paths/);
    }
  });
});
