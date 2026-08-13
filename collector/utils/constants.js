const path = require("path");

const ANYDOC_FILE_EXTENSIONS = Object.freeze([
  ".docx",
  ".pptx",
  ".odt",
  ".odp",
  ".epub",
]);
const ANYDOC_ENABLED_VALUES = Object.freeze(["1", "true", "yes", "on"]);

function isDesktopRuntime() {
  return process.env.ANYTHING_LLM_RUNTIME === "desktop";
}

// In production, the server writes uploads into a collector hotdir that is resolved
// relative to STORAGE_DIR (server storage) so that server + collector can share files
// in container/Electron environments. Keep dev behavior unchanged.
const WATCH_DIRECTORY =
  process.env.NODE_ENV === "development"
    ? path.resolve(__dirname, "../hotdir")
    : process.env.STORAGE_DIR
      ? isDesktopRuntime()
        ? path.resolve(process.env.STORAGE_DIR, "../collector/hotdir")
        : path.resolve(process.env.STORAGE_DIR, "../../collector/hotdir")
      : path.resolve(__dirname, "../hotdir");

const ACCEPTED_MIMES = {
  "text/plain": [".txt", ".md", ".org", ".adoc", ".rst"],
  "text/html": [".html"],
  "text/csv": [".csv"],
  "application/json": [".json"],
  // TODO: Create asDoc.js that works for standard MS Word files.
  // "application/msword": [".doc"],

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],

  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],

  "application/vnd.oasis.opendocument.text": [".odt"],
  "application/vnd.oasis.opendocument.presentation": [".odp"],

  "application/pdf": [".pdf"],
  "application/mbox": [".mbox"],

  "audio/wav": [".wav"],
  "audio/mpeg": [".mp3"],

  "video/mp4": [".mp4"],
  "video/mpeg": [".mpeg"],
  "application/epub+zip": [".epub"],
  "image/png": [".png"],
  "image/jpeg": [".jpg"],
  "image/jpg": [".jpg"],
  "image/webp": [".webp"],
};

const SUPPORTED_FILETYPE_CONVERTERS = {
  ".txt": "./convert/asTxt.js",
  ".md": "./convert/asTxt.js",
  ".org": "./convert/asTxt.js",
  ".adoc": "./convert/asTxt.js",
  ".rst": "./convert/asTxt.js",
  ".csv": "./convert/asTxt.js",
  ".json": "./convert/asTxt.js",

  ".html": "./convert/asTxt.js",
  ".pdf": "./convert/asPDF/index.js",

  ".docx": "./convert/asDocx.js",
  // TODO: Create asDoc.js that works for standard MS Word files.
  // ".doc": "./convert/asDoc.js",

  ".pptx": "./convert/asOfficeMime.js",

  ".odt": "./convert/asOfficeMime.js",
  ".odp": "./convert/asOfficeMime.js",

  ".xlsx": "./convert/asXlsx.js",

  ".mbox": "./convert/asMbox.js",

  ".epub": "./convert/asEPub.js",

  ".mp3": "./convert/asAudio.js",
  ".wav": "./convert/asAudio.js",
  ".mp4": "./convert/asAudio.js",
  ".mpeg": "./convert/asAudio.js",

  ".png": "./convert/asImage.js",
  ".jpg": "./convert/asImage.js",
  ".jpeg": "./convert/asImage.js",
  ".webp": "./convert/asImage.js",
};

function isAnydocEnabled(value) {
  return (
    typeof value === "string" &&
    ANYDOC_ENABLED_VALUES.includes(value.toLowerCase())
  );
}

function resolveFileTypeConverter(extension, env = process.env) {
  const legacyConverter = SUPPORTED_FILETYPE_CONVERTERS[extension];
  if (!legacyConverter) return undefined;

  if (
    isAnydocEnabled(env?.ANYDOC_ENABLED) &&
    ANYDOC_FILE_EXTENSIONS.includes(extension)
  ) {
    return "./convert/asAnydoc.js";
  }

  return legacyConverter;
}

module.exports = {
  ANYDOC_FILE_EXTENSIONS,
  SUPPORTED_FILETYPE_CONVERTERS,
  WATCH_DIRECTORY,
  ACCEPTED_MIMES,
  isAnydocEnabled,
  resolveFileTypeConverter,
};
