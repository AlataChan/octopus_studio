const path = require("path");
const { v4 } = require("uuid");
const { default: slugify } = require("slugify");
const {
  createdDate,
  trashFile,
  writeToServerDocuments,
} = require("../../utils/files");
const { tokenizeString } = require("../../utils/tokenizer");
const {
  ANYDOC_FILE_EXTENSIONS,
  SUPPORTED_FILETYPE_CONVERTERS,
} = require("../../utils/constants");

const LEGACY_DEFAULTS = Object.freeze({
  ".docx": Object.freeze({
    docAuthor: "no author found",
    description: "No description found.",
    docSource: "docx file uploaded by the user.",
  }),
  ".pptx": Object.freeze({
    docAuthor: "no author found",
    description: "No description found.",
    docSource: "Office file uploaded by the user.",
  }),
  ".odt": Object.freeze({
    docAuthor: "no author found",
    description: "No description found.",
    docSource: "Office file uploaded by the user.",
  }),
  ".odp": Object.freeze({
    docAuthor: "no author found",
    description: "No description found.",
    docSource: "Office file uploaded by the user.",
  }),
  ".epub": Object.freeze({
    docAuthor: "Unknown",
    description: "Unknown",
    docSource: "epub file uploaded by the user.",
  }),
});

async function fallbackToLegacy(input, extension, code) {
  const logExtension = Object.prototype.hasOwnProperty.call(
    SUPPORTED_FILETYPE_CONVERTERS,
    extension
  )
    ? extension
    : "unknown";
  console.warn(`[anydoc] extension=${logExtension} code=${code}`);

  const legacyPath = SUPPORTED_FILETYPE_CONVERTERS[extension];
  if (!legacyPath) {
    return {
      success: false,
      reason: "No legacy converter is available for fallback.",
      documents: [],
    };
  }

  const legacyConverter = require(path.resolve(__dirname, "..", legacyPath));
  return await legacyConverter(input);
}

async function asAnydoc(input = {}) {
  const {
    fullFilePath = "",
    filename = "",
    options = {},
    metadata = {},
  } = input;
  const extension = path.extname(fullFilePath).toLowerCase();

  if (!ANYDOC_FILE_EXTENSIONS.includes(extension)) {
    return await fallbackToLegacy(
      input,
      extension,
      "anydoc_extension_not_allowlisted"
    );
  }

  let content;

  try {
    const { toMarkdown } = require("@firecrawl/anydoc");
    content = await toMarkdown(fullFilePath);
  } catch {
    return await fallbackToLegacy(input, extension, "anydoc_conversion_failed");
  }

  if (typeof content !== "string" || !content.trim()) {
    return await fallbackToLegacy(input, extension, "anydoc_empty_output");
  }

  const defaults = LEGACY_DEFAULTS[extension] || LEGACY_DEFAULTS[".pptx"];
  const data = {
    id: v4(),
    url: "file://" + fullFilePath,
    title: metadata.title || filename,
    docAuthor: metadata.docAuthor || defaults.docAuthor,
    description: metadata.description || defaults.description,
    docSource: metadata.docSource || defaults.docSource,
    chunkSource: metadata.chunkSource || "",
    published: createdDate(fullFilePath),
    wordCount: content.split(" ").length,
    pageContent: content,
    token_count_estimate: tokenizeString(content),
  };

  const document = writeToServerDocuments({
    data,
    filename: `${slugify(filename)}-${data.id}`,
    options: { parseOnly: options.parseOnly },
  });
  trashFile(fullFilePath);
  return { success: true, reason: null, documents: [document] };
}

module.exports = asAnydoc;
