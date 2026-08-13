import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMetricsDisabledResult,
  KNOWLEDGE_MODE_VALUE_KEY,
} from "@/pages/Admin/Observability";
import Metrics from "@/models/metrics";

describe("AdminObservability chart config", () => {
  it("uses the count field returned by the API for pie chart values", () => {
    expect(KNOWLEDGE_MODE_VALUE_KEY).toBe("count");
  });

  it("recognizes the gated metrics experiment response as disabled", () => {
    expect(
      isMetricsDisabledResult({
        success: false,
        disabled: true,
        code: "EXPERIMENTS_ADMIN_DISABLED",
      })
    ).toBe(true);
  });
});

describe("Metrics API", () => {
  const originalFetch = global.fetch;
  const originalWindow = global.window;

  beforeEach(() => {
    global.window = {
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    };
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.window = originalWindow;
  });

  it("returns a disabled state for the gated metrics 404", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          success: false,
          error: "Experiments admin not enabled",
          code: "EXPERIMENTS_ADMIN_DISABLED",
        }),
    });

    await expect(
      Metrics.getChatStats({
        startDate: "2026-06-01T00:00:00.000Z",
        endDate: "2026-06-24T00:00:00.000Z",
      })
    ).resolves.toMatchObject({
      success: false,
      disabled: true,
      code: "EXPERIMENTS_ADMIN_DISABLED",
    });
  });
});
