import { beforeEach, describe, expect, it, vi } from "vitest";

describe("request auth helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    global.window = {
      localStorage: {
        getItem: vi.fn((key) => {
          if (key === "anythingllm_authToken") return "token";
          if (key === "anythingllm_authSessionValidated") return "1";
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    };
  });

  it("requires an explicit validated marker before notification polling trusts local auth", async () => {
    const { hasValidatedLocalAuthSession } = await import("@/utils/request");

    expect(hasValidatedLocalAuthSession()).toBe(true);

    global.window.localStorage.getItem = vi.fn((key) => {
      if (key === "anythingllm_authToken") return "old-token";
      return null;
    });

    expect(hasValidatedLocalAuthSession()).toBe(false);
  });

  it("marks and clears the validated auth marker with the auth session", async () => {
    const { clearLocalAuthSession, markLocalAuthSessionValidated } =
      await import("@/utils/request");

    markLocalAuthSessionValidated();
    expect(global.window.localStorage.setItem).toHaveBeenCalledWith(
      "alata_authSessionValidated",
      "1"
    );

    clearLocalAuthSession();
    expect(global.window.localStorage.removeItem).toHaveBeenCalledWith(
      "alata_authSessionValidated"
    );
    expect(global.window.localStorage.removeItem).toHaveBeenCalledWith(
      "anythingllm_authSessionValidated"
    );
  });
});
