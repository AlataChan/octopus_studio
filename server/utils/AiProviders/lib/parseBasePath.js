function parseOpenAiCompatibleBasePath(providedBasePath = "") {
  if (!providedBasePath || typeof providedBasePath !== "string")
    return providedBasePath;

  return providedBasePath
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions\/?$/i, "");
}

module.exports = {
  parseOpenAiCompatibleBasePath,
};
