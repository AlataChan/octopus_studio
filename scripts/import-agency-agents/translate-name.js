const fs = require("fs");
const path = require("path");

const CACHE_PATH = path.resolve(__dirname, ".translation-cache.json");

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

function sanitizeTranslation(input, fallback) {
  const cleaned = String(input || "")
    .trim()
    .replace(/^["']|["']$/g, "");

  const chineseMatch = cleaned.match(/[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9·\s-]*/);
  if (!chineseMatch) return fallback;

  return chineseMatch[0].trim() || fallback;
}

/**
 * Translate a role name to concise Chinese with a simple local cache.
 *
 * @param {string} englishName
 * @param {(prompt: string) => Promise<string>} [llmCaller]
 * @returns {Promise<string>}
 */
async function translateName(englishName, llmCaller) {
  const source = String(englishName || "").trim() || "Unnamed";
  const cache = loadCache();

  if (cache[source]) {
    return cache[source];
  }

  if (!llmCaller) {
    cache[source] = source;
    saveCache(cache);
    return cache[source];
  }

  try {
    const prompt = [
      "You are a professional translator.",
      "Translate the following AI agent role name to natural, concise Chinese (2-6 Chinese characters ideally).",
      "Output ONLY the Chinese translation, no explanations, no quotes, no English.",
      "",
      `Input: ${source}`,
      "Output:",
    ].join("\n");

    cache[source] = sanitizeTranslation(await llmCaller(prompt), source);
  } catch {
    cache[source] = source;
  }

  saveCache(cache);
  return cache[source];
}

module.exports = { CACHE_PATH, translateName, loadCache, saveCache };
