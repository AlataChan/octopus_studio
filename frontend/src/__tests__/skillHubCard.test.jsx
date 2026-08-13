import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SkillCard from "@/pages/SkillHub/components/SkillCard";

describe("SkillHub SkillCard", () => {
  it("renders the denser compact skill card layout", () => {
    const markup = renderToStaticMarkup(
      <SkillCard
        skill={{
          skillId: "excel-office",
          icon: "📈",
          name: "Excel 办公（分析/汇总/报表）",
          description:
            "围绕表格数据提供分析与汇总，支持指标口径、清洗规则、透视思路和报表结构整理。",
          category: "document-processing",
          sourceType: "builtin",
          tags: ["sheet", "pivot", "analysis", "reporting"],
        }}
        installed
        onView={() => {}}
        onInstall={() => {}}
        onUninstall={() => {}}
      />
    );

    expect(markup).toContain("p-3");
    expect(markup).toContain("w-10 h-10");
    expect(markup).toContain("line-clamp-2");
    expect(markup).toContain("leading-5");
    expect(markup).toContain("sheet");
    expect(markup).toContain("+3");
    expect(markup).not.toContain("pivot");
  });
});
