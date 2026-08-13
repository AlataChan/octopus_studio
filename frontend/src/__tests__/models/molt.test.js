import { beforeEach, describe, expect, it, vi } from "vitest";
import Molt from "@/models/molt";

vi.mock("@/utils/request", () => ({
  baseHeaders: () => ({ Authorization: "Bearer token" }),
}));

describe("Molt model", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("loads status, capability, mission status, and archetypes", async () => {
    global.fetch
      .mockResolvedValueOnce({
        json: vi.fn(async () => ({ state: "CONNECTED" })),
      })
      .mockResolvedValueOnce({
        json: vi.fn(async () => ({ capability: { catalog: { tools: [] } } })),
      })
      .mockResolvedValueOnce({
        json: vi.fn(async () => ({ status: { state: "initialized" } })),
      })
      .mockResolvedValueOnce({
        json: vi.fn(async () => ({ archetypes: [{ id: "pm" }] })),
      });

    await expect(Molt.status()).resolves.toEqual({ state: "CONNECTED" });
    await expect(Molt.capability()).resolves.toEqual({
      capability: { catalog: { tools: [] } },
    });
    await expect(Molt.missionStatus()).resolves.toEqual({
      status: { state: "initialized" },
    });
    await expect(Molt.archetypes()).resolves.toEqual({
      archetypes: [{ id: "pm" }],
    });

    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/molt/status",
      "/api/molt/capability",
      "/api/molt/mission-control/status",
      "/api/molt/mission-control/archetypes",
    ]);
  });

  it("loads Molt agents with authenticated GET headers", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn(async () => ({
        success: true,
        agents: [{ id: "molt-matrix" }],
      })),
    });

    await expect(Molt.agents()).resolves.toEqual({
      success: true,
      agents: [{ id: "molt-matrix" }],
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/molt/agents", {
      method: "GET",
      headers: { Authorization: "Bearer token" },
    });
  });

  it("sends console chat messages to a Molt agent", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn(async () => ({
        success: true,
        answer: "Molt reply",
      })),
    });

    await expect(
      Molt.chatAgent("molt-matrix", "Introduce your workflow")
    ).resolves.toEqual({
      success: true,
      answer: "Molt reply",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/molt/agents/molt-matrix/chat",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "Introduce your workflow" }),
      }
    );
  });

  it("loads Molt KM status with authenticated GET headers", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn(async () => ({
        success: true,
        configured: true,
      })),
    });

    await expect(Molt.kmStatus()).resolves.toEqual({
      success: true,
      configured: true,
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/molt/km/status", {
      method: "GET",
      headers: { Authorization: "Bearer token" },
    });
  });

  it("uploads text files to Molt with JSON payload", async () => {
    const payload = {
      content: "hello molt",
      filename: "note.txt",
      agentId: "molt-matrix",
    };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn(async () => ({
        success: true,
        fileId: "file-1",
      })),
    });

    await expect(Molt.uploadTextFile(payload)).resolves.toEqual({
      success: true,
      fileId: "file-1",
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/molt/files/upload-text", {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  });

  it("normalizes failed Molt responses", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn(async () => ({ error: "Molt unavailable" })),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn(async () => ({ message: "Unauthorized" })),
      });

    await expect(Molt.agents()).resolves.toEqual({
      success: false,
      error: "Molt unavailable",
    });
    await expect(Molt.kmStatus()).resolves.toEqual({
      success: false,
      error: "Unauthorized",
    });
  });

  it("preserves failed status for workspace attach errors", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: vi.fn(async () => ({
        code: "WORKSPACE_ADMIN_REQUIRED",
        error: "Forbidden",
      })),
    });

    await expect(
      Molt.attachWorkspaceAgent("demo", { moltAgentId: "molt-matrix" })
    ).resolves.toEqual({
      success: false,
      error: "Forbidden",
      status: 403,
      code: "WORKSPACE_ADMIN_REQUIRED",
    });
  });
});
