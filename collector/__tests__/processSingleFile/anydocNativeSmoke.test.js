const path = require("path");
const { toMarkdown } = require("@firecrawl/anydoc");

const FIXTURE_ROOT = path.resolve(__dirname, "../fixtures/anydoc");

describe("anydoc native integration", () => {
  test.each([
    {
      filename: "handmade-rich.docx",
      markers: ["Quarterly Widgets", "| Quarter | Widgets |", "- Plan"],
    },
    {
      filename: "handmade-links.pptx",
      markers: [
        "[Jump to the second slide](#slide-2)",
        "[External link](https://example.com/)",
      ],
    },
    {
      filename: "handmade-lists.odt",
      markers: [
        "Header without a marker",
        "- 10 ten via restart",
        "- 12 twelve continues lstA",
      ],
    },
    {
      filename: "pres.odp",
      markers: [
        "Deck Title Slide",
        "> Speaker note for the intro slide.",
        "| Region | Total |",
      ],
    },
    {
      filename: "handmade-features.epub",
      markers: [
        "# Feature Book",
        "| Tall | B1 |",
        "[the marked span](#oebps-ch2-xhtml-target-span)",
      ],
    },
  ])(
    "converts $filename to non-empty semantic GFM",
    async ({ filename, markers }) => {
      const markdown = await toMarkdown(path.join(FIXTURE_ROOT, filename));

      expect(markdown.trim()).not.toBe("");
      for (const marker of markers) {
        expect(markdown).toContain(marker);
      }
    }
  );
});
