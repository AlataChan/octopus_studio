import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(__dirname, "../..");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");

describe("design tokens", () => {
  it("defines chat content width token (768px)", () => {
    expect(css).toMatch(/--chat-content-width:\s*768px/);
  });
  it("defines the documented z-index scale", () => {
    for (const [name, val] of [
      ["--z-sticky", "100"], ["--z-dropdown", "1000"], ["--z-overlay", "1300"],
      ["--z-modal", "1400"], ["--z-popover", "1500"], ["--z-toast", "1700"], ["--z-tooltip", "1800"],
    ]) expect(css).toMatch(new RegExp(`${name}:\\s*${val}`));
  });
  it("provides a .chat-column helper bound to the width token", () => {
    expect(css).toMatch(/\.chat-column\s*\{[^}]*max-width:\s*var\(--chat-content-width\)/s);
  });
});

const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const backdropSrc = () => fs.readFileSync(path.join(root, "src/components/Backdrop/index.jsx"), "utf8");
const modalSrc = fs.readFileSync(path.join(root, "src/components/ModalWrapper/index.jsx"), "utf8");
describe("shared backdrop + modal layering", () => {
  it("Backdrop returns null when closed and uses the overlay tier", () => {
    const s = backdropSrc();
    expect(s).toMatch(/if\s*\(\s*!open\s*\)\s*return null/);
    expect(s).toMatch(/fixed inset-0/);
    expect(s).toMatch(/z-overlay/);
  });
  it("ModalWrapper no longer uses the legacy z-99 and adopts the overlay tier", () => {
    expect(modalSrc).not.toMatch(/z-99/);
    expect(modalSrc).toMatch(/z-overlay/);
  });
});

describe("overlay offenders fixed", () => {
  it("SetupProvider drops the inner duplicate full-screen scrim", () => {
    const s = read("src/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/SetupProvider/index.jsx");
    // ModalWrapper already provides the scrim; inner must not add a second fixed inset-0 black layer
    expect(s).not.toMatch(/fixed inset-0[^"]*bg-black bg-opacity-50/);
  });
  it("AssistantSelector backdrop is the shared Backdrop, not a bare fixed inset-0 z-10", () => {
    const s = read("src/components/AssistantSelector/index.jsx");
    expect(s).toMatch(/import Backdrop from "@\/components\/Backdrop"/);
    expect(s).not.toMatch(/className="fixed inset-0 z-10"/);
  });
  it("no raw extreme z-index values remain in migrated overlays", () => {
    for (const p of [
      "src/components/Preloader.jsx",
      "src/components/WorkspaceChat/ChatContainer/DnDWrapper/index.jsx",
    ]) {
      const s = read(p);
      expect(s).not.toMatch(/z-\[9{4,}\]/); // z-[9999], z-[999999]
    }
  });
});

describe("unified content column + flat shell", () => {
  const cc = read("src/components/WorkspaceChat/ChatContainer/index.jsx");
  it("chat shell is a flat full-height panel (no floating rounded card)", () => {
    expect(cc).not.toMatch(/md:rounded-\[16px\]/);
    expect(cc).not.toMatch(/md:my-\[16px\]/);
  });
  it("header, message area and input region are constrained to the shared chat column", () => {
    // The .chat-column wrappers are split across ChatContainer (header) and
    // ChatHistory (message/input area): commit 12b262de moved the wrapper INTO
    // #chat-history so it stays a real scroll container. Assert the shared
    // column is applied across both files rather than re-nesting it in the
    // outer scroll parent (which reintroduced the scroll-failure bug).
    const chatHistory = read(
      "src/components/WorkspaceChat/ChatContainer/ChatHistory/index.jsx"
    );
    // Each region file applies the shared column: header lives in
    // ChatContainer, the scrollable message/input area in ChatHistory.
    expect(cc).toMatch(/chat-column/);
    expect(chatHistory).toMatch(/chat-column/);
  });
});

describe("header redesign", () => {
  const as = read("src/components/AssistantSelector/index.jsx");
  it("header row aligns to the chat column, not max-w-xl", () => {
    expect(as).not.toMatch(/w-full max-w-xl mx-auto/);
  });
  it("avatar is enlarged and name/role hierarchy preserved", () => {
    expect(as).toMatch(/w-9 h-9|w-10 h-10/);
  });
});

describe("composer redesign", () => {
  const pi = read("src/components/WorkspaceChat/ChatContainer/PromptInput/index.jsx");
  it("composer aligns to the chat column, dropping the conflicting 635px/max-w-xl widths", () => {
    expect(pi).not.toMatch(/md:w-\[635px\]/);
    expect(pi).not.toMatch(/max-w-xl/);
    expect(pi).toMatch(/chat-column|max-w-chat/);
  });
  it("toolbar no longer stretches with justify-between (left tools + right send grouped)", () => {
    // the main toolbar row should group actions, not push speech to the far edge
    expect(pi).toMatch(/justify-start|gap-x-2/);
  });
});

describe("flush column alignment + z-base token (terminal Minor fixes)", () => {
  const histSrc = read(
    "src/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage/index.jsx"
  );
  const asSrc = read("src/components/AssistantSelector/index.jsx");
  const twSrc = fs.readFileSync(path.join(root, "tailwind.config.js"), "utf8");

  it("HistoricalMessage: message row does NOT carry redundant max-w-chat mx-auto", () => {
    expect(histSrc).not.toMatch(/max-w-chat mx-auto/);
  });

  it("HistoricalMessage: message row does NOT carry extra horizontal px-4", () => {
    // Both the error path and normal path row divs must not have px-4 in the row
    expect(histSrc).not.toMatch(/py-8 px-4 w-full flex gap-x-5/);
  });

  it("AssistantSelector: display row does NOT carry px-3 alongside py-2", () => {
    // After fix the row uses py-2 without px-3 so the column gutter provides inset
    expect(asSrc).not.toMatch(/px-3 py-2/);
  });

  it('tailwind.config.js zIndex contains base: "var(--z-base)"', () => {
    expect(twSrc).toMatch(/base:\s*["']var\(--z-base\)["']/);
  });
});
