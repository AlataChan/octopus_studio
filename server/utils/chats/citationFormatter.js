/**
 * Citation Formatter - 引用格式化工具
 *
 * 用于在报告/文档末尾生成规范的参考来源章节
 *
 * @module chats/citationFormatter
 */

/**
 * 引用格式类型
 */
const CITATION_FORMATS = {
  MARKDOWN: "markdown",
  HTML: "html",
  PLAIN: "plain",
};

/**
 * 从 sources 数组中提取引用信息
 * @param {Array} sources - 检索到的源文档数组
 * @returns {Array} 格式化的引用列表
 */
function extractCitations(sources = []) {
  if (!sources || sources.length === 0) return [];

  return sources.map((source, index) => ({
    index: index + 1,
    title: source.title || source.metadata?.title || `来源 ${index + 1}`,
    path: source.docPath || source.metadata?.docPath || source.url || "",
    score: source.score || source.metadata?.score || null,
    chunkId: source.chunkId || source.metadata?.chunkId || null,
    excerpt: source.text?.substring(0, 200) || "",
  }));
}

/**
 * 生成 Markdown 格式的参考来源章节
 * @param {Array} citations - 引用列表
 * @param {Object} options - 配置选项
 * @returns {string} Markdown 格式的参考来源章节
 */
function formatCitationsMarkdown(citations, options = {}) {
  if (!citations || citations.length === 0) return "";

  const {
    title = "参考来源",
    showScore = false,
    showExcerpt = false,
  } = options;

  let output = `\n\n---\n\n## ${title}\n\n`;

  citations.forEach((citation) => {
    output += `**[${citation.index}]** ${citation.title}`;

    if (citation.path) {
      output += `\n   - 路径: \`${citation.path}\``;
    }

    if (showScore && citation.score !== null) {
      output += `\n   - 相关度: ${(citation.score * 100).toFixed(1)}%`;
    }

    if (showExcerpt && citation.excerpt) {
      output += `\n   - 摘要: ${citation.excerpt}...`;
    }

    output += "\n\n";
  });

  return output;
}

/**
 * 生成 HTML 格式的参考来源章节
 * @param {Array} citations - 引用列表
 * @param {Object} options - 配置选项
 * @returns {string} HTML 格式的参考来源章节
 */
function formatCitationsHTML(citations, options = {}) {
  if (!citations || citations.length === 0) return "";

  const { title = "参考来源", showScore = false } = options;

  let output = `<hr><h2>${title}</h2><ol class="citations-list">`;

  citations.forEach((citation) => {
    output += `<li id="citation-${citation.index}">`;
    output += `<strong>${citation.title}</strong>`;

    if (citation.path) {
      output += `<br><small>路径: <code>${citation.path}</code></small>`;
    }

    if (showScore && citation.score !== null) {
      output += `<br><small>相关度: ${(citation.score * 100).toFixed(1)}%</small>`;
    }

    output += "</li>";
  });

  output += "</ol>";
  return output;
}

/**
 * 在文本中插入引用标记
 * @param {string} text - 原始文本
 * @param {Array} sources - 源文档数组
 * @returns {Object} { text: 带引用标记的文本, citations: 引用列表 }
 */
function insertCitationMarkers(text, sources = []) {
  if (!text || !sources || sources.length === 0) {
    return { text, citations: [] };
  }

  const citations = extractCitations(sources);
  let markedText = text;

  // 简单策略：在文本末尾添加引用标记
  // 更复杂的实现可以基于语义匹配在相关段落插入
  const citationRefs = citations.map((c) => `[${c.index}]`).join(" ");

  if (!markedText.includes("[来源") && !markedText.includes("[1]")) {
    markedText += ` ${citationRefs}`;
  }

  return { text: markedText, citations };
}

/**
 * 为响应添加参考来源章节
 * @param {string} responseText - 响应文本
 * @param {Array} sources - 源文档数组
 * @param {Object} options - 配置选项
 * @returns {string} 带参考来源章节的完整响应
 */
function appendCitationSection(responseText, sources = [], options = {}) {
  const { format = CITATION_FORMATS.MARKDOWN, ...formatOptions } = options;

  const citations = extractCitations(sources);

  if (citations.length === 0) return responseText;

  let citationSection;
  switch (format) {
    case CITATION_FORMATS.HTML:
      citationSection = formatCitationsHTML(citations, formatOptions);
      break;
    case CITATION_FORMATS.PLAIN:
      citationSection = citations
        .map((c) => `[${c.index}] ${c.title} - ${c.path}`)
        .join("\n");
      break;
    case CITATION_FORMATS.MARKDOWN:
    default:
      citationSection = formatCitationsMarkdown(citations, formatOptions);
  }

  return responseText + citationSection;
}

module.exports = {
  CITATION_FORMATS,
  extractCitations,
  formatCitationsMarkdown,
  formatCitationsHTML,
  insertCitationMarkers,
  appendCitationSection,
};
