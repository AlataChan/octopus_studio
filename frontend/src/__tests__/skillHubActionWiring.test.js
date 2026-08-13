import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const frontendRoot = resolve(import.meta.dirname, "..");

function readFrontendFile(relativePath) {
  return readFileSync(resolve(frontendRoot, relativePath), "utf8");
}

describe("SkillHub action wiring", () => {
  it("keeps the Skill detail validate and footer cancel actions wired", () => {
    const source = readFrontendFile("pages/SkillHub/SkillDetail.jsx");

    expect(source).toMatch(
      /<Button[\s\S]*?onClick=\{handleValidate\}[\s\S]*?title="校验 Skill（写入 valid\/invalid 状态）"/
    );
    expect(source).toMatch(
      /<Button[\s\S]{0,120}?onClick=\{\(\) => setUpgradeOpen\(false\)\}[\s\S]{0,120}?variant="sidebar"[\s\S]{0,80}?>\s*取消\s*<\/Button>/
    );
  });

  it("keeps the SkillHub upgrade modal footer cancel wired", () => {
    const source = readFrontendFile("pages/SkillHub/index.jsx");

    expect(source).toMatch(
      /<Button[\s\S]{0,120}?onClick=\{\(\) => setUpgradeOpen\(false\)\}[\s\S]{0,120}?variant="sidebar"[\s\S]{0,80}?>\s*取消\s*<\/Button>/
    );
  });
});
