import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "../..");
const modalSource = fs.readFileSync(
  path.join(
    projectRoot,
    "src/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/index.jsx"
  ),
  "utf8"
);
const sidePanelSource = fs.readFileSync(
  path.join(
    projectRoot,
    "src/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/LLMSelector/index.jsx"
  ),
  "utf8"
);

describe("LLM selector layout", () => {
  it("uses a bounded viewport-aware height instead of a fixed tall panel", () => {
    expect(modalSource).not.toContain("h-[500px]");
    expect(modalSource).toContain('height: "min(360px, calc(100vh - 290px))"');
    expect(modalSource).toContain("overflow-hidden flex");
  });

  it("keeps provider and model panes independently scrollable", () => {
    expect(modalSource).toContain("min-h-0 overflow-y-auto");
    expect(sidePanelSource).toContain("min-h-0 flex-1");
    expect(sidePanelSource).toContain("overflow-y-auto");
  });
});
