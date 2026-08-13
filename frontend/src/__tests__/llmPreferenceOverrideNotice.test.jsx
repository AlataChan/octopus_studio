import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import LLMProviderOverrideNotice from "@/components/LLMSelection/LLMProviderOverrideNotice";
import System from "@/models/system";
import en from "@/locales/en/common.js";
import zh from "@/locales/zh/common.js";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key, fallback) => fallback ?? _key,
  }),
}));

const llmPreferenceSource = () =>
  readFileSync(
    resolve("src/pages/GeneralSettings/LLMPreference/index.jsx"),
    "utf8"
  );

function installBrowserGlobals() {
  const store = new Map();
  global.window = {
    location: { origin: "http://localhost:3000" },
    localStorage: {
      getItem: vi.fn((key) => store.get(key) ?? null),
      setItem: vi.fn((key, value) => store.set(key, String(value))),
      removeItem: vi.fn((key) => store.delete(key)),
    },
    dispatchEvent: vi.fn(),
  };
  global.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
}

describe("LLM provider override notice", () => {
  beforeEach(() => {
    installBrowserGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
    delete global.window;
    delete global.CustomEvent;
  });

  it("renders a warning banner with workspace names when overrides exist", () => {
    const markup = renderToStaticMarkup(
      <LLMProviderOverrideNotice
        overrides={[
          {
            id: 1,
            name: "Alata",
            chatProvider: "deepseek",
            agentProvider: null,
          },
          {
            id: 2,
            name: "Support Ops",
            chatProvider: null,
            agentProvider: "openai",
          },
        ]}
      />
    );

    expect(markup).toContain('data-testid="llm-provider-override-notice"');
    expect(markup).toContain("Alata");
    expect(markup).toContain("Support Ops");
    expect(markup).toContain("Chat Settings");
  });

  it("does not render a banner when overrides are empty", () => {
    const markup = renderToStaticMarkup(
      <LLMProviderOverrideNotice overrides={[]} />
    );

    expect(markup).toBe("");
  });

  it("falls back to an empty override list when the endpoint fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(System.llmProviderOverrides()).resolves.toEqual({
      overrides: [],
    });
  });

  it("wires the LLM preference page to fetch overrides without blocking render", () => {
    const source = llmPreferenceSource();

    expect(source).toContain("LLMProviderOverrideNotice");
    expect(source).toContain("System.llmProviderOverrides()");
    expect(source).toContain("setProviderOverrides");
    expect(source).toContain("llm.system_default_notice");
    expect(source).toMatch(/try\s*{[\s\S]*System\.llmProviderOverrides\(\)/);
    expect(source).toMatch(
      /catch\s*\([^)]*\)\s*{[\s\S]*setProviderOverrides\(\[\]\)/
    );
  });

  it("defines override notice copy in English and Chinese locales", () => {
    expect(en.llm.system_default_notice).toContain("system default");
    expect(en.llm.override_notice.title).toContain("workspace");
    expect(en.llm.override_notice.action).toContain("Chat Settings");

    expect(zh.llm.system_default_notice).toContain("系统默认");
    expect(zh.llm.override_notice.title).toContain("工作区");
    expect(zh.llm.override_notice.action).toContain("聊天设置");
  });
});
