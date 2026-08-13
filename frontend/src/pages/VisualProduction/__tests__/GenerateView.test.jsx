import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GenerateView from "../GenerateView";

vi.mock("@/models/visualProduction", () => ({
  default: {
    getConfig: vi.fn().mockResolvedValue({ routes: {}, budget: {} }),
    estimate: vi.fn().mockResolvedValue({ cost_cny: 0 }),
    submit: vi.fn(),
    getJob: vi.fn(),
    isReady: vi.fn().mockResolvedValue(false),
  },
}));

describe("GenerateView", () => {
  it("shows not-ready notice and disables submit when sidecar down", async () => {
    const markup = renderToStaticMarkup(<GenerateView initialReady={false} />);

    expect(markup).toMatch(/视觉服务未启动|not started|unavailable/i);
    expect(markup).toContain("<button");
    expect(markup).toContain("disabled");
    expect(markup).toMatch(/生成|Generate/i);
  });
});
