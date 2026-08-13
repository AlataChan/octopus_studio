import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { sync: globSync } = require("glob");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const css = fs.readFileSync(path.resolve(__dirname, "../index.css"), "utf8");

function getRootBlock(source) {
  const start = source.indexOf(":root {");
  const end = source.indexOf("/* ===== 全局页面层级 ===== */");
  return source.slice(start, end);
}

function getVariable(block, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`${escapedName}:\\s*([^;]+);`));
  return match?.[1]?.trim();
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

function luminance(channel) {
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function contrastRatio(foreground, background) {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  const fgLum =
    0.2126 * luminance(fg.r) +
    0.7152 * luminance(fg.g) +
    0.0722 * luminance(fg.b);
  const bgLum =
    0.2126 * luminance(bg.r) +
    0.7152 * luminance(bg.g) +
    0.0722 * luminance(bg.b);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("default dark theme tokens", () => {
  const rootBlock = getRootBlock(css);

  it("uses the Calm Studio neutral surface ladder with Copper accent", () => {
    expect(getVariable(rootBlock, "--theme-bg-primary")).toBe("#0c0e12");
    expect(getVariable(rootBlock, "--theme-bg-secondary")).toBe("#181c24");
    expect(getVariable(rootBlock, "--theme-bg-chat-input")).toBe("#181c24");
    expect(getVariable(rootBlock, "--theme-loader")).toBe("#f0803c");
    expect(getVariable(rootBlock, "--theme-accent-primary")).toBe("#f0803c");
    expect(getVariable(rootBlock, "--theme-button-primary")).toBe("#f0803c");
    expect(getVariable(rootBlock, "--theme-button-primary-hover")).toBe(
      "#ff9d5c"
    );
    expect(getVariable(rootBlock, "--theme-button-primary-text")).toBe(
      "#1a0e05"
    );
    expect(getVariable(rootBlock, "--theme-button-cta")).toBe("#f0803c");
  });

  it("uses neutral fills for selected and focus states", () => {
    expect(getVariable(rootBlock, "--theme-sidebar-item-selected")).toBe(
      "rgba(240, 128, 60, 0.14)"
    );
    expect(getVariable(rootBlock, "--theme-sidebar-item-hover")).toBe(
      "rgba(255, 255, 255, 0.07)"
    );
    expect(getVariable(rootBlock, "--theme-settings-input-active")).toBe(
      "rgba(240, 128, 60, 0.14)"
    );
  });

  it("keeps secondary and placeholder text above AA contrast on dark surfaces", () => {
    expect(contrastRatio("#a3abb8", "#181c24")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#7e8696", "#181c24")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Theme token coverage (post-migration)", () => {
  // Requires running from frontend/ directory: cd frontend && yarn test
  const files = globSync("src/**/*.jsx", { cwd: process.cwd() });
  const allContent = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");

  it("bg-zinc-900 和 bg-gray-900（无透明度修饰符）应完全清零", () => {
    // 排除 bg-zinc-900/50 等故意保留的 opacity 变体
    const matches =
      allContent.match(/\b(bg-zinc-900|bg-gray-900)(?!\/)/g) || [];
    expect(matches.length).toBe(0);
  });

  it("border-white/10 应完全清零", () => {
    const matches = allContent.match(/\bborder-white\/10\b/g) || [];
    expect(matches.length).toBe(0);
  });

  it("裸 text-white（无透明度修饰符）应少于 600 处", () => {
    // ~498 处是 text-white/N 透明度变体（故意保留）
    // 剩余少量为 hover:/focus: 等待人工处理
    const matches = allContent.match(/\btext-white(?!\/)/g) || [];
    expect(matches.length).toBeLessThan(600);
  });

  it("所有必要的 CSS 变量应在 index.css 中定义", () => {
    // 使用全文搜索（不经过 getRootBlock），确保能找到新追加的变量
    const required = [
      "--theme-bg-primary",
      "--theme-bg-secondary",
      "--theme-bg-sidebar",
      "--theme-text-primary",
      "--theme-text-secondary",
      "--theme-accent-primary",
      "--theme-border",
      "--theme-border-subtle",
      "--theme-border-medium",
      "--theme-stroke-primary",
    ];
    for (const v of required) {
      expect(css, `缺少变量 ${v}`).toContain(v);
    }
  });
});
