import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/workspace", () => ({
  default: {
    bySlug: vi.fn(),
    getSuggestedMessages: vi.fn(),
    fetchPfp: vi.fn(),
    chatHistory: vi.fn(),
    threads: {
      chatHistory: vi.fn(),
    },
  },
}));

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("workspaceChatLoader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("starts only workspace metadata and chat history requests on the critical path", async () => {
    const gate = deferred();
    const { default: Workspace } = await import("@/models/workspace");

    Workspace.bySlug.mockImplementation(() =>
      gate.promise.then(() => ({ slug: "alpha", name: "Alpha" }))
    );
    Workspace.chatHistory.mockImplementation(() =>
      gate.promise.then(() => [{ role: "assistant", content: "hello" }])
    );

    const { loadWorkspaceChatData } =
      await import("@/utils/workspaceChatLoader");

    const resultPromise = loadWorkspaceChatData({ slug: "alpha" });

    expect(Workspace.bySlug).toHaveBeenCalledWith("alpha");
    expect(Workspace.chatHistory).toHaveBeenCalledWith("alpha", undefined);
    expect(Workspace.getSuggestedMessages).not.toHaveBeenCalled();
    expect(Workspace.fetchPfp).not.toHaveBeenCalled();

    gate.resolve();

    await expect(resultPromise).resolves.toEqual({
      workspace: {
        slug: "alpha",
        name: "Alpha",
        suggestedMessages: [],
        pfpUrl: null,
      },
      history: [{ role: "assistant", content: "hello" }],
    });
  });

  it("loads suggested messages and profile picture as non-critical extras", async () => {
    const { default: Workspace } = await import("@/models/workspace");

    Workspace.getSuggestedMessages.mockResolvedValue(["What can you do?"]);
    Workspace.fetchPfp.mockResolvedValue("blob:pfp");

    const { loadWorkspaceChatExtras } =
      await import("@/utils/workspaceChatLoader");

    await expect(loadWorkspaceChatExtras({ slug: "alpha" })).resolves.toEqual({
      suggestedMessages: ["What can you do?"],
      pfpUrl: "blob:pfp",
    });
    expect(Workspace.getSuggestedMessages).toHaveBeenCalledWith("alpha");
    expect(Workspace.fetchPfp).toHaveBeenCalledWith("alpha");
  });

  it("loads thread history when a thread slug is provided", async () => {
    const { default: Workspace } = await import("@/models/workspace");

    Workspace.bySlug.mockResolvedValue({ slug: "alpha", name: "Alpha" });
    Workspace.threads.chatHistory.mockResolvedValue([
      { role: "user", content: "thread" },
    ]);

    const { loadWorkspaceChatData } =
      await import("@/utils/workspaceChatLoader");

    const result = await loadWorkspaceChatData({
      slug: "alpha",
      threadSlug: "thread-1",
    });

    expect(Workspace.chatHistory).not.toHaveBeenCalled();
    expect(Workspace.threads.chatHistory).toHaveBeenCalledWith(
      "alpha",
      "thread-1",
      undefined
    );
    expect(result.history).toEqual([{ role: "user", content: "thread" }]);
    expect(Workspace.getSuggestedMessages).not.toHaveBeenCalled();
    expect(Workspace.fetchPfp).not.toHaveBeenCalled();
  });

  it("does not merge late extras into a different workspace", async () => {
    const { mergeWorkspaceChatExtras } =
      await import("@/utils/workspaceChatLoader");

    const currentWorkspace = {
      slug: "beta",
      name: "Beta",
      suggestedMessages: [],
      pfpUrl: null,
    };

    expect(
      mergeWorkspaceChatExtras(currentWorkspace, "alpha", {
        suggestedMessages: ["stale"],
        pfpUrl: "blob:stale",
      })
    ).toBe(currentWorkspace);
  });

  it("merges late extras into the matching workspace", async () => {
    const { mergeWorkspaceChatExtras } =
      await import("@/utils/workspaceChatLoader");

    expect(
      mergeWorkspaceChatExtras(
        { slug: "alpha", name: "Alpha", suggestedMessages: [], pfpUrl: null },
        "alpha",
        {
          suggestedMessages: ["fresh"],
          pfpUrl: "blob:fresh",
        }
      )
    ).toEqual({
      slug: "alpha",
      name: "Alpha",
      suggestedMessages: ["fresh"],
      pfpUrl: "blob:fresh",
    });
  });
});
