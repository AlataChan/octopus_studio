import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AssistantCard from "@/pages/AssistantLibrary/AssistantCard";

describe("AssistantLibrary AssistantCard", () => {
  it("renders a denser second-pass marketplace card layout", () => {
    const markup = renderToStaticMarkup(
      <AssistantCard
        assistant={{
          id: "assistant-1",
          name: "AI公文助手",
          employeeName: "露娜 Luna",
          employeeTitle: "AI公文写作专员",
          employeeBio:
            "精通各类公文写作规范，能够快速起草标准格式的公文，并提供格式审核和润色建议。",
          category: "文秘专员",
          skills: ["builtin:docx", "builtin:internal-comms", "builtin:policy"],
          certifications: ["公文认证", "写作认证"],
        }}
        isHired
        onClick={() => {}}
      />
    );

    expect(markup).toContain("p-3");
    expect(markup).toContain("w-10 h-10");
    expect(markup).toContain("line-clamp-2");
    expect(markup).toContain("leading-5");
    expect(markup).toContain("builtin:docx");
    expect(markup).toContain("+4");
    expect(markup).not.toContain("builtin:internal-comms");
    expect(markup).not.toContain("border-t border-theme-border");
    expect(markup).not.toContain("min-h-[320px]");
  });
});
