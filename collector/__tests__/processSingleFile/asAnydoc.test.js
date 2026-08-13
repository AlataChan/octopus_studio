const mockAsDocx = jest.fn();
const mockAsOfficeMime = jest.fn();
const mockAsEPub = jest.fn();
const mockAsPDF = jest.fn();
const mockAsXlsx = jest.fn();
const mockAsTxt = jest.fn();

jest.mock("@firecrawl/anydoc", () => ({ toMarkdown: jest.fn() }));
jest.mock("uuid", () => ({ v4: jest.fn() }));
jest.mock("slugify", () => ({ default: jest.fn() }));
jest.mock("../../utils/tokenizer", () => ({ tokenizeString: jest.fn() }));
jest.mock("../../utils/files", () => ({
  createdDate: jest.fn(),
  trashFile: jest.fn(),
  writeToServerDocuments: jest.fn(),
}));
jest.mock("../../processSingleFile/convert/asDocx.js", () => mockAsDocx);
jest.mock(
  "../../processSingleFile/convert/asOfficeMime.js",
  () => mockAsOfficeMime
);
jest.mock("../../processSingleFile/convert/asEPub.js", () => mockAsEPub);
jest.mock("../../processSingleFile/convert/asPDF/index.js", () => mockAsPDF);
jest.mock("../../processSingleFile/convert/asXlsx.js", () => mockAsXlsx);
jest.mock("../../processSingleFile/convert/asTxt.js", () => mockAsTxt);

const { toMarkdown } = require("@firecrawl/anydoc");
const { v4 } = require("uuid");
const { default: slugify } = require("slugify");
const { tokenizeString } = require("../../utils/tokenizer");
const {
  createdDate,
  trashFile,
  writeToServerDocuments,
} = require("../../utils/files");
const asAnydoc = require("../../processSingleFile/convert/asAnydoc");

const LEGACY_CASES = [
  [".docx", mockAsDocx],
  [".pptx", mockAsOfficeMime],
  [".odt", mockAsOfficeMime],
  [".odp", mockAsOfficeMime],
  [".epub", mockAsEPub],
];

function inputFor(extension = ".docx", overrides = {}) {
  return {
    fullFilePath: `/tmp/customer-upload${extension}`,
    filename: `customer-upload${extension}`,
    options: { parseOnly: true },
    metadata: {
      title: "Customer title",
      docAuthor: "Customer author",
      description: "Customer description",
      docSource: "Customer source",
      chunkSource: "Customer chunk",
    },
    ...overrides,
  };
}

describe("asAnydoc", () => {
  let consoleWarn;

  beforeEach(() => {
    toMarkdown.mockReset();
    v4.mockReset().mockReturnValue("uuid-1234");
    slugify.mockReset().mockImplementation((value) => `slug-${value}`);
    tokenizeString.mockReset().mockReturnValue(17);
    createdDate.mockReset().mockReturnValue("2026-08-11T00:00:00.000Z");
    trashFile.mockReset();
    writeToServerDocuments
      .mockReset()
      .mockImplementation(({ data }) => ({ ...data, persisted: true }));
    mockAsDocx.mockReset();
    mockAsOfficeMime.mockReset();
    mockAsEPub.mockReset();
    mockAsPDF.mockReset();
    mockAsXlsx.mockReset();
    mockAsTxt.mockReset();
    consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarn.mockRestore();
  });

  test("persists non-empty GFM unchanged with caller metadata", async () => {
    const gfm = "# 标题\n\n- item\n\n| A | B |  \n";
    const input = inputFor();
    toMarkdown.mockResolvedValue(gfm);

    const result = await asAnydoc(input);

    expect(toMarkdown).toHaveBeenCalledWith(input.fullFilePath);
    expect(writeToServerDocuments).toHaveBeenCalledWith({
      data: {
        id: "uuid-1234",
        url: `file://${input.fullFilePath}`,
        title: "Customer title",
        docAuthor: "Customer author",
        description: "Customer description",
        docSource: "Customer source",
        chunkSource: "Customer chunk",
        published: "2026-08-11T00:00:00.000Z",
        wordCount: gfm.split(" ").length,
        pageContent: gfm,
        token_count_estimate: 17,
      },
      filename: "slug-customer-upload.docx-uuid-1234",
      options: { parseOnly: true },
    });
    expect(trashFile).toHaveBeenCalledWith(input.fullFilePath);
    expect(writeToServerDocuments.mock.invocationCallOrder[0]).toBeLessThan(
      trashFile.mock.invocationCallOrder[0]
    );
    expect(result).toEqual({
      success: true,
      reason: null,
      documents: [
        expect.objectContaining({ pageContent: gfm, persisted: true }),
      ],
    });
  });

  test.each([
    [".docx", "docx file uploaded by the user."],
    [".pptx", "Office file uploaded by the user."],
    [".odt", "Office file uploaded by the user."],
    [".odp", "Office file uploaded by the user."],
    [".epub", "epub file uploaded by the user."],
  ])(
    "preserves the legacy docSource default for %s",
    async (extension, expected) => {
      toMarkdown.mockResolvedValue("content");

      await asAnydoc(
        inputFor(extension, {
          metadata: {},
        })
      );

      expect(writeToServerDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ docSource: expected }),
        })
      );
    }
  );

  test.each(LEGACY_CASES)(
    "falls back once to the mapped legacy converter for %s conversion errors",
    async (extension, legacyConverter) => {
      const input = inputFor(extension);
      const legacyResult = {
        success: true,
        reason: null,
        documents: [{ legacy: extension }],
      };
      toMarkdown.mockRejectedValue(
        new Error(`secret path and content: ${input.fullFilePath}`)
      );
      legacyConverter.mockResolvedValue(legacyResult);

      await expect(asAnydoc(input)).resolves.toBe(legacyResult);

      expect(legacyConverter).toHaveBeenCalledTimes(1);
      expect(legacyConverter).toHaveBeenCalledWith(input);
      expect(writeToServerDocuments).not.toHaveBeenCalled();
      expect(trashFile).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledWith(
        `[anydoc] extension=${extension} code=anydoc_conversion_failed`
      );
      expect(consoleWarn.mock.calls.flat().join(" ")).not.toContain("secret");
      expect(consoleWarn.mock.calls.flat().join(" ")).not.toContain(
        input.fullFilePath
      );
    }
  );

  test.each([
    [
      ".pdf",
      mockAsPDF,
      [{ pageContent: "page 1" }, { pageContent: "OCR page 2" }],
    ],
    [".xlsx", mockAsXlsx, [{ title: "Sheet A" }, { title: "Sheet B" }]],
    [".txt", mockAsTxt, [{ pageContent: "plain text" }]],
  ])(
    "delegates non-allowlisted %s directly and preserves legacy document semantics",
    async (extension, legacyConverter, documents) => {
      const input = inputFor(extension);
      const legacyResult = { success: true, reason: null, documents };
      toMarkdown.mockResolvedValue("# must not be used");
      legacyConverter.mockResolvedValue(legacyResult);

      await expect(asAnydoc(input)).resolves.toBe(legacyResult);

      expect(toMarkdown).not.toHaveBeenCalled();
      expect(legacyConverter).toHaveBeenCalledWith(input);
      expect(writeToServerDocuments).not.toHaveBeenCalled();
      expect(trashFile).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledWith(
        `[anydoc] extension=${extension} code=anydoc_extension_not_allowlisted`
      );
    }
  );

  test.each(["", "   \n\t"])(
    "falls back for empty output while preserving the original arguments",
    async (content) => {
      const input = inputFor(".docx");
      const legacyResult = {
        success: false,
        reason: "legacy empty",
        documents: [],
      };
      toMarkdown.mockResolvedValue(content);
      mockAsDocx.mockResolvedValue(legacyResult);

      await expect(asAnydoc(input)).resolves.toBe(legacyResult);

      expect(mockAsDocx).toHaveBeenCalledWith(input);
      expect(writeToServerDocuments).not.toHaveBeenCalled();
      expect(trashFile).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledWith(
        "[anydoc] extension=.docx code=anydoc_empty_output"
      );
    }
  );

  test("returns the legacy failure result unchanged", async () => {
    const input = inputFor(".epub");
    const legacyFailure = {
      success: false,
      reason: "legacy failed",
      documents: [],
    };
    toMarkdown.mockRejectedValue(new Error("conversion failed"));
    mockAsEPub.mockResolvedValue(legacyFailure);

    await expect(asAnydoc(input)).resolves.toBe(legacyFailure);
  });

  test("propagates a legacy converter exception unchanged", async () => {
    const input = inputFor(".docx");
    const legacyError = new Error("legacy exploded");
    toMarkdown.mockRejectedValue(new Error("conversion failed"));
    mockAsDocx.mockRejectedValue(legacyError);

    await expect(asAnydoc(input)).rejects.toBe(legacyError);
    expect(mockAsDocx).toHaveBeenCalledWith(input);
    expect(writeToServerDocuments).not.toHaveBeenCalled();
    expect(trashFile).not.toHaveBeenCalled();
  });

  test("propagates persistence failures without invoking legacy fallback", async () => {
    const input = inputFor(".docx");
    const persistenceError = new Error("persistence failed");
    toMarkdown.mockResolvedValue("# content");
    writeToServerDocuments.mockImplementation(() => {
      throw persistenceError;
    });

    await expect(asAnydoc(input)).rejects.toBe(persistenceError);

    expect(mockAsDocx).not.toHaveBeenCalled();
    expect(trashFile).not.toHaveBeenCalled();
  });

  test("propagates trash failures without invoking legacy fallback", async () => {
    const input = inputFor(".docx");
    const trashError = new Error("trash failed");
    toMarkdown.mockResolvedValue("# content");
    trashFile.mockImplementation(() => {
      throw trashError;
    });

    await expect(asAnydoc(input)).rejects.toBe(trashError);

    expect(writeToServerDocuments).toHaveBeenCalledTimes(1);
    expect(mockAsDocx).not.toHaveBeenCalled();
  });

  test("returns a safe failure when no legacy converter exists", async () => {
    const input = inputFor(".unsupported");
    toMarkdown.mockResolvedValue("# must not be used");

    await expect(asAnydoc(input)).resolves.toEqual({
      success: false,
      reason: "No legacy converter is available for fallback.",
      documents: [],
    });

    expect(writeToServerDocuments).not.toHaveBeenCalled();
    expect(trashFile).not.toHaveBeenCalled();
    expect(toMarkdown).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      "[anydoc] extension=unknown code=anydoc_extension_not_allowlisted"
    );
    expect(consoleWarn.mock.calls.flat().join(" ")).not.toContain(
      input.fullFilePath
    );
  });
});
