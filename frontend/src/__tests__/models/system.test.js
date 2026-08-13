import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

global.fetch = vi.fn();

describe("System model", () => {
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reuses cached setup settings during rapid route transitions", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            MultiUserMode: true,
            RequiresAuth: true,
            LLMProvider: "openai",
            VectorDB: "lancedb",
          },
        }),
    });

    const { default: System } = await import("@/models/system");

    const first = await System.keys();
    const second = await System.keys();

    expect(first).toEqual(second);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("/api/setup-complete");
  });

  it("serves multi-user mode from cached setup settings without another request", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            MultiUserMode: false,
            RequiresAuth: true,
          },
        }),
    });

    const { default: System } = await import("@/models/system");

    await System.keys();
    global.fetch.mockClear();

    const isMultiUserMode = await System.isMultiUserMode();

    expect(isMultiUserMode).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("emits a setup settings change event after system settings updates", async () => {
    const dispatchEvent = vi.fn();
    global.window.dispatchEvent = dispatchEvent;
    global.CustomEvent = class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({ newValues: { LLMProvider: "openai" } }),
    });

    const { default: System } = await import("@/models/system");
    await System.updateSystem({ LLMProvider: "openai" });

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: System.setupSettingsChangedEvent,
        detail: { reason: "system-update" },
      })
    );
  });

  it("caches an empty support email response so settings navigation does not refetch", async () => {
    const storage = new Map();
    global.window.localStorage = {
      getItem: vi.fn((key) => storage.get(key) ?? null),
      setItem: vi.fn((key, value) => storage.set(key, value)),
      removeItem: vi.fn((key) => storage.delete(key)),
    };
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({ supportEmail: "" }),
    });

    const { default: System } = await import("@/models/system");

    await expect(System.fetchSupportEmail()).resolves.toEqual({
      email: "",
      error: null,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(storage.get(System.cacheKeys.supportEmail))
    ).toMatchObject({
      email: "",
      lastFetched: 1_000,
    });

    global.fetch.mockClear();
    now.mockReturnValue(2_000);

    await expect(System.fetchSupportEmail()).resolves.toEqual({
      email: "",
      error: null,
    });
    expect(global.fetch).not.toHaveBeenCalled();

    now.mockRestore();
  });

  it("refetches an empty support email after the empty-cache TTL expires", async () => {
    const storage = new Map();
    global.window.localStorage = {
      getItem: vi.fn((key) => storage.get(key) ?? null),
      setItem: vi.fn((key, value) => storage.set(key, value)),
      removeItem: vi.fn((key) => storage.delete(key)),
    };
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({ supportEmail: "" }),
    });

    const { default: System } = await import("@/models/system");

    await System.fetchSupportEmail();
    global.fetch.mockClear();
    now.mockReturnValue(86_402_000);

    await System.fetchSupportEmail();

    expect(global.fetch).toHaveBeenCalledTimes(1);

    now.mockRestore();
  });
});
