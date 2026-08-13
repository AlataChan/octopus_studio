const mockAsDocx = jest.fn();

jest.mock("@firecrawl/anydoc", () => {
  throw new Error("native binding failed to load: /secret/path");
});
jest.mock("uuid", () => ({ v4: jest.fn() }));
jest.mock("slugify", () => ({ default: jest.fn() }));
jest.mock("../../utils/tokenizer", () => ({ tokenizeString: jest.fn() }));
jest.mock("../../utils/files", () => ({
  createdDate: jest.fn(),
  trashFile: jest.fn(),
  writeToServerDocuments: jest.fn(),
}));
jest.mock("../../processSingleFile/convert/asDocx.js", () => mockAsDocx);

const { trashFile, writeToServerDocuments } = require("../../utils/files");

test("falls back when loading the anydoc native package throws", async () => {
  const input = {
    fullFilePath: "/tmp/customer-upload.docx",
    filename: "customer-upload.docx",
    options: { parseOnly: true },
    metadata: {},
  };
  const legacyResult = {
    success: true,
    reason: null,
    documents: [{ legacy: true }],
  };
  mockAsDocx.mockResolvedValue(legacyResult);
  const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});

  try {
    const asAnydoc = require("../../processSingleFile/convert/asAnydoc");

    await expect(asAnydoc(input)).resolves.toBe(legacyResult);
    expect(mockAsDocx).toHaveBeenCalledWith(input);
    expect(writeToServerDocuments).not.toHaveBeenCalled();
    expect(trashFile).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      "[anydoc] extension=.docx code=anydoc_conversion_failed"
    );
    expect(consoleWarn.mock.calls.flat().join(" ")).not.toContain("secret");
  } finally {
    consoleWarn.mockRestore();
  }
});
