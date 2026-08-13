import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ModalWrapper from "@/components/ModalWrapper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modalWrapperSource = fs.readFileSync(
  path.resolve(__dirname, "../components/ModalWrapper/index.jsx"),
  "utf8"
);

describe("ModalWrapper layering", () => {
  it("renders an explicit overlay z-index for hit testing", () => {
    const markup = renderToStaticMarkup(
      <ModalWrapper isOpen noPortal>
        <button type="button">Hire</button>
      </ModalWrapper>
    );

    expect(markup).toContain('style="z-index:var(--z-overlay)"');
  });

  it("keeps both portal and noPortal overlay wrappers on the overlay tier", () => {
    expect(
      modalWrapperSource.match(/zIndex:\s*"var\(--z-overlay\)"/g) || []
    ).toHaveLength(2);
  });
});
