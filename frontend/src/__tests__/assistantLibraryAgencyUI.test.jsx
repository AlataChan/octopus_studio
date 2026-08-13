import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AssistantCard from "@/pages/AssistantLibrary/AssistantCard";
import AssistantDetail from "@/pages/AssistantLibrary/AssistantDetail";
import SourceBadge from "@/pages/AssistantLibrary/SourceBadge";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/useUser", () => ({
  default: () => ({
    user: { role: "admin" },
  }),
}));

vi.mock("@/components/ModalWrapper", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("@/models/workspace", () => ({
  default: {
    all: vi.fn(async () => []),
    bySlug: vi.fn(async () => null),
  },
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assistantLibraryPageSource = fs.readFileSync(
  path.resolve(__dirname, "../pages/AssistantLibrary/index.jsx"),
  "utf8"
);

describe("AssistantCard with agency-agents fields", () => {
  it("renders emoji fallback when avatarUrl is missing", () => {
    const markup = renderToStaticMarkup(
      <AssistantCard
        assistant={{
          name: "后端架构师",
          employeeName: "后端架构师",
          employeeBio: "测试",
          icon: "🏗️",
          color: "#FF6B6B",
        }}
        onClick={() => {}}
      />
    );

    expect(markup).toContain("🏗️");
    expect(markup).toContain("#FF6B6B20");
    expect(markup).toContain("#FF6B6B");
  });

  it("renders vibe as subtitle when present", () => {
    const markup = renderToStaticMarkup(
      <AssistantCard
        assistant={{
          name: "测试",
          employeeName: "测试",
          vibe: "Turns ideas into reality",
          employeeBio: "测试简介",
        }}
        onClick={() => {}}
      />
    );

    expect(markup).toContain("Turns ideas into reality");
    expect(markup).toContain("italic");
  });
});

describe("SourceBadge", () => {
  it("renders nothing when source.type is not markdown", () => {
    const markup = renderToStaticMarkup(
      <SourceBadge source={{ type: "builtin" }} />
    );

    expect(markup).toBe("");
  });

  it("renders agency-agents badge when markdown source exists", () => {
    const markup = renderToStaticMarkup(
      <SourceBadge
        source={{
          type: "markdown",
          url: "https://github.com/msitarzewski/agency-agents/blob/main/foo.md",
          license: "MIT",
          commit: "abc123def456",
        }}
      />
    );

    expect(markup).toContain("agency-agents");
    expect(markup).toContain("MIT");
    expect(markup).toContain("@abc123d");
  });
});

describe("AssistantDetail source badge integration", () => {
  it("renders source badge in the detail drawer for markdown agents", () => {
    const markup = renderToStaticMarkup(
      <AssistantDetail
        assistant={{
          id: "assistant-1",
          employeeName: "后端架构师",
          employeeTitle: "engineering 专家",
          employeeBio: "负责系统设计",
          source: {
            type: "markdown",
            url: "https://github.com/msitarzewski/agency-agents/blob/main/foo.md",
            license: "MIT",
            commit: "abc123def456",
          },
        }}
        onClose={() => {}}
      />
    );

    expect(markup).toContain("agency-agents");
    expect(markup).toContain("@abc123d");
  });
});

describe("AssistantLibrary community placeholder", () => {
  it("includes a disabled community coming soon control", () => {
    expect(assistantLibraryPageSource).toContain("社区");
    expect(assistantLibraryPageSource).toContain("Coming Soon");
    expect(assistantLibraryPageSource).toContain(
      "社区 agent 市场即将上线 (M2)"
    );
  });
});
