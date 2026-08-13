import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Button from "@/components/Button";
import CTAButton from "@/components/lib/CTAButton";

describe("Button", () => {
  it("renders a primary button with loading semantics", () => {
    const markup = renderToStaticMarkup(<Button loading>保存更改</Button>);

    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("bg-primary-button");
    expect(markup).toContain("text-[var(--theme-button-primary-text)]");
  });

  it('renders an anchor when as="a" and does not set disabled attribute', () => {
    const markup = renderToStaticMarkup(
      <Button as="a" href="/openclaw" variant="ghost" disabled>
        打开 Dashboard
      </Button>
    );

    expect(markup).toContain("<a");
    expect(markup).toContain('href="/openclaw"');
    expect(markup).toContain("bg-[var(--theme-button-ghost-bg)]");
    expect(markup).not.toContain('disabled=""');
  });

  it("updates CTAButton to reuse shared button styling without legacy offset", () => {
    const markup = renderToStaticMarkup(<CTAButton>保存</CTAButton>);

    expect(markup).toContain("bg-primary-button");
    expect(markup).toContain(
      "focus-visible:ring-[var(--theme-accent-primary)]"
    );
    expect(markup).not.toContain("-mr-8");
  });

  it("keeps secondary buttons theme-aware for light mode hover states", () => {
    const markup = renderToStaticMarkup(
      <Button variant="secondary">刷新</Button>
    );

    expect(markup).toContain(
      "hover:bg-[var(--theme-button-secondary-hover-bg)]"
    );
  });
});
