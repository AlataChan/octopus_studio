import { beforeEach, describe, expect, it, vi } from "vitest";

global.fetch = vi.fn();

describe("WorkspaceAssistant model", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.window = {
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    };
  });

  it("dedupes concurrent list requests for the same workspace", async () => {
    let resolveFetch;
    global.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { default: WorkspaceAssistant } =
      await import("@/models/workspaceAssistant");

    const first = WorkspaceAssistant.list("alpha");
    const second = WorkspaceAssistant.list("alpha");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/workspace/alpha/assistants",
      expect.objectContaining({
        method: "GET",
      })
    );

    resolveFetch({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { assistants: [{ id: "assistant-1", enabled: true }] },
        }),
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        success: true,
        data: { assistants: [{ id: "assistant-1", enabled: true }] },
      },
      {
        success: true,
        data: { assistants: [{ id: "assistant-1", enabled: true }] },
      },
    ]);
  });

  it("reuses a warm assistants list during rapid chat initialization", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { assistants: [{ id: "assistant-1", enabled: true }] },
        }),
    });

    const { default: WorkspaceAssistant } =
      await import("@/models/workspaceAssistant");

    const first = await WorkspaceAssistant.list("alpha");
    const second = await WorkspaceAssistant.list("alpha");

    expect(first).toEqual(second);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
