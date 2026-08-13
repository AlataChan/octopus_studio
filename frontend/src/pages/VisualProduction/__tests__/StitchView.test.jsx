import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StitchView from "../StitchView";

vi.mock("@/models/visualProduction", () => ({
  default: {
    listJobs: vi.fn().mockResolvedValue({ jobs: [] }),
    stitch: vi.fn(),
    title: vi.fn(),
    resultUrl: (path) => path,
  },
}));

describe("StitchView", () => {
  it("disables stitch when no completed videos", () => {
    const markup = renderToStaticMarkup(<StitchView initialJobs={[]} />);

    expect(markup).toMatch(/拼接|stitch/i);
    expect(markup).toContain("<button");
    expect(markup).toContain("disabled");
  });
});
