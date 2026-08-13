import { beforeEach, describe, expect, it, vi } from "vitest";

global.fetch = vi.fn();

describe("OpenClaw frontend model", () => {
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

  function mockFetch(data, ok = true) {
    global.fetch.mockResolvedValueOnce({
      ok,
      json: () => Promise.resolve(data),
    });
  }

  it("checks install status", async () => {
    mockFetch({
      success: true,
      installed: true,
      path: "/usr/local/bin/alata-im-gateway",
      mode: "global",
    });
    const { default: OpenClaw } = await import("@/models/openClaw");
    const result = await OpenClaw.checkInstalled();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/openclaw/install/check"),
      expect.objectContaining({ method: "GET" })
    );
    expect(result.installed).toBe(true);
    expect(result.mode).toBe("global");
  });

  it("gets gateway status", async () => {
    mockFetch({
      success: true,
      status: "running",
      port: 18790,
      pid: 12345,
    });
    const { default: OpenClaw } = await import("@/models/openClaw");
    const result = await OpenClaw.getStatus();

    expect(result.status).toBe("running");
    expect(result.port).toBe(18790);
  });

  it("starts gateway with port", async () => {
    mockFetch({ success: true, message: "Gateway started on port 18790" });
    const { default: OpenClaw } = await import("@/models/openClaw");
    const result = await OpenClaw.startGateway(18790);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/openclaw/gateway/start"),
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.port).toBe(18790);
    expect(result.success).toBe(true);
  });

  it("stops gateway", async () => {
    mockFetch({ success: true, message: "Gateway stopped" });
    const { default: OpenClaw } = await import("@/models/openClaw");
    const result = await OpenClaw.stopGateway();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/openclaw/gateway/stop"),
      expect.objectContaining({ method: "POST" })
    );
    expect(result.success).toBe(true);
  });

  it("syncs provider config", async () => {
    mockFetch({ success: true, authToken: "abc123", port: 18790 });
    const { default: OpenClaw } = await import("@/models/openClaw");
    const result = await OpenClaw.syncConfig("openai", "gpt-4o");

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.provider).toBe("openai");
    expect(body.model).toBe("gpt-4o");
    expect(result.success).toBe(true);
  });

  it("gets dashboard URL", async () => {
    mockFetch({ url: "http://localhost:18790?token=abc" });
    const { default: OpenClaw } = await import("@/models/openClaw");
    const result = await OpenClaw.getDashboardUrl();

    expect(result.url).toContain("localhost:18790");
  });

  it("gets the saved gateway config summary", async () => {
    mockFetch({
      success: true,
      config: {
        provider: "openai",
        model: "gpt-4o-mini",
        hasApiKey: true,
      },
    });
    const { default: OpenClaw } = await import("@/models/openClaw");
    const result = await OpenClaw.getConfig();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/openclaw/config"),
      expect.objectContaining({ method: "GET" })
    );
    expect(result.config.provider).toBe("openai");
    expect(result.config.hasApiKey).toBe(true);
  });

  it("handles network error gracefully", async () => {
    global.fetch.mockRejectedValueOnce(new Error("Network failure"));
    const { default: OpenClaw } = await import("@/models/openClaw");
    const result = await OpenClaw.checkInstalled();

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network failure");
  });
});
