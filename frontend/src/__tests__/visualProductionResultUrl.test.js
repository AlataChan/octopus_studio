import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VisualProduction from "@/models/visualProduction";

const originalFetch = global.fetch;
const originalWindow = global.window;

// Regression guard for the doubled "results/results/" 404 bug: result entries
// are stored as "<jobId>/results/<file>", but the sidecar route re-inserts the
// "results" segment itself, so the URL must carry "<jobId>/<file>".
describe("VisualProduction.resultUrl", () => {
  it("strips the /results/ marker so the sidecar path is not doubled", () => {
    const url = VisualProduction.resultUrl("job-123/results/result-01.png");
    expect(url).toBe("/api/visual/results/job-123/result-01.png");
    expect(url).not.toContain("results/results");
  });

  it("encodes each path segment", () => {
    const url = VisualProduction.resultUrl("job 1/results/a b.png");
    expect(url).toBe("/api/visual/results/job%201/a%20b.png");
  });

  it("passes through a path with no marker unchanged (still encoded)", () => {
    const url = VisualProduction.resultUrl("job-9/result-02.png");
    expect(url).toBe("/api/visual/results/job-9/result-02.png");
  });
});

describe("VisualProduction response handling", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    global.window = {
      localStorage: {
        getItem: vi.fn(() => null),
      },
      sessionStorage: {
        getItem: vi.fn(() => null),
      },
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.window = originalWindow;
    vi.restoreAllMocks();
  });

  it("throws a structured error when a JSON endpoint returns non-ok", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: () =>
        Promise.resolve({
          error: "visual sidecar unavailable",
          detail: "down",
        }),
    });

    await expect(
      VisualProduction.submit({ task: "image" })
    ).rejects.toMatchObject({
      message: "visual sidecar unavailable",
      status: 503,
      payload: { error: "visual sidecar unavailable", detail: "down" },
    });
  });

  it("keeps isReady boolean-only on non-ok responses", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: "down" }),
    });

    await expect(VisualProduction.isReady()).resolves.toBe(false);
  });
});

describe("VisualProduction.downloadResult", () => {
  const originalUrl = global.URL;
  const originalDocument = global.document;

  beforeEach(() => {
    const anchor = {
      click: vi.fn(),
      remove: vi.fn(),
    };
    const storage = new Map([["alata_authToken", "token-123"]]);

    global.window = {
      localStorage: {
        getItem: vi.fn((key) => storage.get(key) ?? null),
      },
      sessionStorage: {
        getItem: vi.fn(() => null),
      },
    };
    global.document = {
      createElement: vi.fn(() => anchor),
      body: {
        appendChild: vi.fn(),
      },
    };
    global.URL = {
      createObjectURL: vi.fn(() => "blob:visual-result"),
      revokeObjectURL: vi.fn(),
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["result"])),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.window = originalWindow;
    global.URL = originalUrl;
    global.document = originalDocument;
    vi.restoreAllMocks();
  });

  it("downloads result blobs with the auth header", async () => {
    await VisualProduction.downloadResult(
      "job-123/results/out.png",
      "download.png"
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/visual/results/job-123/out.png",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
        }),
      })
    );
    const anchor = global.document.createElement.mock.results[0].value;
    expect(anchor.href).toBe("blob:visual-result");
    expect(anchor.download).toBe("download.png");
    expect(anchor.click).toHaveBeenCalled();
    expect(anchor.remove).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:visual-result"
    );
  });
});
