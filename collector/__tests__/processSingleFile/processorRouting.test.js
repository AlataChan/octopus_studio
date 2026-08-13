const {
  ANYDOC_FILE_EXTENSIONS,
  SUPPORTED_FILETYPE_CONVERTERS,
  isAnydocEnabled,
  resolveFileTypeConverter,
} = require("../../utils/constants");

describe("anydoc processor routing", () => {
  const allowlistedExtensions = [".docx", ".pptx", ".odt", ".odp", ".epub"];

  test("exports the fixed frozen five-format allowlist", () => {
    expect(ANYDOC_FILE_EXTENSIONS).toEqual(allowlistedExtensions);
    expect(Object.isFrozen(ANYDOC_FILE_EXTENSIONS)).toBe(true);
    expect(() => ANYDOC_FILE_EXTENSIONS.push(".pdf")).toThrow(TypeError);
  });

  test.each(["1", "true", "TRUE", "yes", "YeS", "on", "ON"])(
    "accepts the explicit truthy flag value %s",
    (value) => {
      expect(isAnydocEnabled(value)).toBe(true);
    }
  );

  test.each([
    undefined,
    null,
    "",
    "0",
    "false",
    "arbitrary",
    " true ",
    true,
    1,
  ])("rejects every non-approved flag value %p", (value) => {
    expect(isAnydocEnabled(value)).toBe(false);
  });

  test.each(allowlistedExtensions)(
    "keeps %s on its legacy converter when the flag is absent or false",
    (extension) => {
      expect(resolveFileTypeConverter(extension, {})).toBe(
        SUPPORTED_FILETYPE_CONVERTERS[extension]
      );
      expect(
        resolveFileTypeConverter(extension, { ANYDOC_ENABLED: "false" })
      ).toBe(SUPPORTED_FILETYPE_CONVERTERS[extension]);
    }
  );

  test.each(
    allowlistedExtensions.flatMap((extension) =>
      ["1", "true", "TRUE", "yes", "on"].map((flag) => [extension, flag])
    )
  )("routes %s through anydoc for flag %s", (extension, flag) => {
    expect(resolveFileTypeConverter(extension, { ANYDOC_ENABLED: flag })).toBe(
      "./convert/asAnydoc.js"
    );
  });

  test.each([
    [".xlsx", "./convert/asXlsx.js"],
    [".pdf", "./convert/asPDF/index.js"],
    [".txt", "./convert/asTxt.js"],
    [".mbox", "./convert/asMbox.js"],
    [".png", "./convert/asImage.js"],
  ])("keeps %s on its legacy converter when enabled", (extension, expected) => {
    expect(
      resolveFileTypeConverter(extension, { ANYDOC_ENABLED: "true" })
    ).toBe(expected);
  });

  test("cannot expand the allowlist through environment input", () => {
    expect(
      resolveFileTypeConverter(".pdf", {
        ANYDOC_ENABLED: "true",
        ANYDOC_FILE_EXTENSIONS: ".pdf",
      })
    ).toBe("./convert/asPDF/index.js");
    expect(
      resolveFileTypeConverter(".unsupported", {
        ANYDOC_ENABLED: "true",
        ANYDOC_FILE_EXTENSIONS: ".unsupported",
      })
    ).toBeUndefined();
  });
});
