import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StatusBadge from "@/components/StatusBadge";

describe("StatusBadge", () => {
  it("maps running-like values to success styling", () => {
    const markup = renderToStaticMarkup(<StatusBadge value="healthy" />);

    expect(markup).toContain("healthy");
    expect(markup).toContain("bg-emerald-500/10");
    expect(markup).toContain("border-emerald-500/20");
    expect(markup).toContain("light:text-emerald-700");
  });

  it("maps degraded values to warning styling", () => {
    const markup = renderToStaticMarkup(<StatusBadge value="degraded" />);

    expect(markup).toContain("degraded");
    expect(markup).toContain("bg-amber-500/10");
  });

  it("maps error values to error styling", () => {
    const markup = renderToStaticMarkup(<StatusBadge value="error" />);

    expect(markup).toContain("error");
    expect(markup).toContain("bg-red-500/10");
    expect(markup).toContain("border-red-500/20");
  });

  it("falls back to neutral styling for unknown values", () => {
    const markup = renderToStaticMarkup(<StatusBadge value="mystery" />);

    expect(markup).toContain("mystery");
    expect(markup).toContain("bg-slate-500/10");
  });
});
