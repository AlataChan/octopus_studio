import { beforeEach, describe, expect, it, vi } from "vitest";

global.fetch = vi.fn();

describe("ImGateway frontend model", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.window = {
      localStorage: {
        getItem: vi.fn((key) =>
          key === "anythingllm_authToken" ? "test-token" : null
        ),
        setItem: vi.fn(),
      },
    };
  });

  it("lists runtimes from the control-plane API", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          runtimes: [{ id: "gw_local_1", status: "active" }],
        }),
    });

    const { default: ImGateway } = await import("@/models/imGateway");
    const result = await ImGateway.runtimes();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/im-gateway/runtimes",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
    expect(result.runtimes).toEqual([{ id: "gw_local_1", status: "active" }]);
  });

  it("creates a runtime and returns the bootstrap token", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          runtime: { id: "gw_local_1", status: "offline" },
          bootstrapToken: "bootstrap-token",
        }),
    });

    const { default: ImGateway } = await import("@/models/imGateway");
    const result = await ImGateway.createRuntime({
      id: "gw_local_1",
      name: "Local Gateway",
      mode: "embedded",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/im-gateway/runtimes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          id: "gw_local_1",
          name: "Local Gateway",
          mode: "embedded",
        }),
      })
    );
    expect(result.bootstrapToken).toBe("bootstrap-token");
  });

  it("fetches admin config snapshot for a runtime", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          snapshot: {
            runtimeId: "rt-test-1",
            revision: 3,
            accounts: [{ provider: "feishu", accountId: "acc-1" }],
            bindings: [
              {
                id: 1,
                provider: "feishu",
                accountId: "acc-1",
                workspaceId: "1",
                enabled: true,
              },
            ],
          },
        }),
    });

    const { default: ImGateway } = await import("@/models/imGateway");
    const result = await ImGateway.runtimeConfig("rt-test-1");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/im-gateway/runtimes/rt-test-1/config-admin"),
      expect.objectContaining({ method: "GET" })
    );
    expect(result.success).toBe(true);
    expect(result.snapshot.runtimeId).toBe("rt-test-1");
    expect(result.snapshot.accounts).toHaveLength(1);
    expect(result.snapshot.bindings).toHaveLength(1);
  });
});
