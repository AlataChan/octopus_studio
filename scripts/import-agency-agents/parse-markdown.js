const fs = require("fs");
const yaml = require("js-yaml");

/**
 * Parse a markdown file with optional YAML frontmatter.
 *
 * @param {string} filePath
 * @returns {{frontmatter: Object, body: string}}
 */
function parseMarkdown(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }

  try {
    return {
      frontmatter: yaml.load(match[1]) || {},
      body: match[2].trim(),
    };
  } catch (error) {
    console.warn(`[agency-importer] Failed to parse frontmatter: ${error.message}`);
    return { frontmatter: {}, body: match[2].trim() };
  }
}

module.exports = { parseMarkdown };
