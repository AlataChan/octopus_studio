import { beforeEach, describe, expect, it, vi } from "vitest";

global.fetch = vi.fn();

describe("validateSessionTokenForUser", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.window = {
      localStorage: {
        getItem: vi.fn((key) => {
          if (key === "anythingllm_authToken") return "cached-token";
          if (key === "anythingllm_authTimestamp") {
            return String(Date.now() - 60_000);
          }
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    };
  });

  it("skips token revalidation while the cached auth window is still fresh", async () => {
    const { default: validateSessionTokenForUser } =
      await import("@/utils/session");

    const isValid = await validateSessionTokenForUser();

    expect(isValid).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
