import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextualSaveBar from "@/components/ContextualSaveBar";

describe("shared dialog controls", () => {
  it("uses shared button styling in ConfirmDialog", () => {
    const markup = renderToStaticMarkup(
      <ConfirmDialog
        isOpen
        onClose={() => {}}
        onConfirm={() => {}}
        message="确认删除吗？"
        type="warning"
      />
    );

    expect(markup).toContain("bg-primary-button");
    expect(markup).toContain("theme-button-muted-text");
  });

  it("uses shared button styling in ContextualSaveBar", () => {
    const markup = renderToStaticMarkup(
      <ContextualSaveBar showing onSave={() => {}} onCancel={() => {}} />
    );

    expect(markup).toContain("bg-primary-button");
    expect(markup).toContain("border-theme-sidebar-border");
  });
});
