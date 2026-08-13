import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import "@/i18n";
import UnsupportedBlock from "@/pages/Admin/AgentBuilder/Block/UnsupportedBlock";
import BlockList from "@/pages/Admin/AgentBuilder/BlockList";

vi.mock("react-tooltip", () => ({
  Tooltip: () => null,
}));

const noop = () => {};

describe("AgentBuilder unsupported blocks", () => {
  it("renders the unsupported block placeholder with original data summary", () => {
    const markup = renderToStaticMarkup(
      <UnsupportedBlock
        blockType="website"
        blockData={{
          url: "https://legacy.example.com",
          selector: "#main",
        }}
      />
    );

    expect(markup).toContain("此版本不支持的块类型");
    expect(markup).toContain("website");
    expect(markup).toContain("保留原始数据");
    expect(markup).toContain("https://legacy.example.com");
  });

  it("does not expose editing controls", () => {
    const markup = renderToStaticMarkup(
      <UnsupportedBlock blockType="code" blockData={{ code: "return 1;" }} />
    );

    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain("<select");
    expect(markup).not.toContain("<button");
  });

  it("renders a legacy website block through BlockList without crashing", () => {
    const blocks = [
      {
        id: "flow_info",
        type: "flowInfo",
        config: { name: "Legacy Flow", description: "Contains old blocks" },
        isExpanded: false,
      },
      {
        id: "start",
        type: "start",
        config: { variables: [] },
        isExpanded: false,
      },
      {
        id: "block_1",
        type: "website",
        config: { url: "https://legacy.example.com", directOutput: true },
        isExpanded: true,
      },
      {
        id: "finish",
        type: "finish",
        config: {},
        isExpanded: false,
      },
    ];

    const markup = renderToStaticMarkup(
      <BlockList
        blocks={blocks}
        updateBlockConfig={noop}
        removeBlock={noop}
        toggleBlockExpansion={noop}
        renderVariableSelect={noop}
        onDeleteVariable={noop}
        moveBlock={noop}
        refs={{}}
      />
    );

    expect(markup).toContain("此版本不支持的块类型");
    expect(markup).toContain("website");
    expect(markup).toContain("https://legacy.example.com");
    expect(markup).not.toContain('aria-label="Toggle direct output"');
  });
});
