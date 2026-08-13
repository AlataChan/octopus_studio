import { beforeEach, describe, expect, it, vi } from "vitest";

global.fetch = vi.fn();

describe("NotificationAPI", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.window = {
      localStorage: {
        getItem: vi.fn((key) => {
          if (key === "anythingllm_authToken") return "stale-token";
          return null;
        }),
        removeItem: vi.fn(),
      },
    };
  });

  it("clears stale auth state when unread-count returns 401", async () => {
    global.fetch.mockResolvedValue({
      status: 401,
      json: vi.fn(),
    });

    const { default: NotificationAPI } = await import("@/models/notification");
    const result = await NotificationAPI.getUnreadCount();

    expect(result).toEqual({
      success: false,
      unauthorized: true,
      error: "Unauthorized",
      count: 0,
    });
    expect(global.window.localStorage.removeItem).toHaveBeenCalledWith(
      "alata_authToken"
    );
    expect(global.window.localStorage.removeItem).toHaveBeenCalledWith(
      "alata_user"
    );
    expect(global.window.localStorage.removeItem).toHaveBeenCalledWith(
      "alata_authTimestamp"
    );
    expect(global.window.localStorage.removeItem).toHaveBeenCalledWith(
      "alata_authSessionValidated"
    );
    expect(global.window.localStorage.removeItem).toHaveBeenCalledWith(
      "anythingllm_authToken"
    );
    expect(global.window.localStorage.removeItem).toHaveBeenCalledWith(
      "anythingllm_user"
    );
    expect(global.window.localStorage.removeItem).toHaveBeenCalledWith(
      "anythingllm_authTimestamp"
    );
    expect(global.window.localStorage.removeItem).toHaveBeenCalledWith(
      "anythingllm_authSessionValidated"
    );
  });
});
