/**
 * Chunk Highlighter - 原文定位高亮工具
 *
 * 用于基于 chunkId 定位原文片段并生成高亮信息
 *
 * @module chats/chunkHighlighter
 */

/**
 * 高亮类型
 */
const HIGHLIGHT_TYPES = {
  CITATION: "citation", // 引用高亮
  EVIDENCE: "evidence", // 证据高亮
  RISK: "risk", // 风险高亮
  MATCH: "match", // 匹配高亮
};

/**
 * 从 source 中提取定位信息
 * @param {Object} source - 源文档对象
 * @returns {Object} 定位信息
 */
function extractLocationInfo(source) {
  return {
    chunkId: source.chunkId || source.metadata?.chunkId || null,
    docId: source.docId || source.metadata?.docId || null,
    docPath: source.docPath || source.metadata?.docPath || null,
    startOffset: source.startOffset || source.metadata?.startOffset || null,
    endOffset: source.endOffset || source.metadata?.endOffset || null,
    pageNumber: source.pageNumber || source.metadata?.pageNumber || null,
    lineNumber: source.lineNumber || source.metadata?.lineNumber || null,
  };
}

/**
 * 生成高亮标记
 * @param {Object} options - 配置选项
 * @param {string} options.text - 要高亮的文本
 * @param {string} options.type - 高亮类型
 * @param {Object} options.location - 定位信息
 * @param {string} options.label - 标签（如引用编号）
 * @returns {Object} 高亮标记对象
 */
function createHighlightMarker(options = {}) {
  const {
    text,
    type = HIGHLIGHT_TYPES.CITATION,
    location = {},
    label = "",
  } = options;

  return {
    id: `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    text: text?.substring(0, 500) || "",
    type,
    label,
    location: {
      chunkId: location.chunkId,
      docId: location.docId,
      docPath: location.docPath,
      startOffset: location.startOffset,
      endOffset: location.endOffset,
      pageNumber: location.pageNumber,
      lineNumber: location.lineNumber,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * 从 sources 数组生成高亮标记列表
 * @param {Array} sources - 源文档数组
 * @param {string} type - 高亮类型
 * @returns {Array} 高亮标记列表
 */
function generateHighlightsFromSources(
  sources = [],
  type = HIGHLIGHT_TYPES.CITATION
) {
  if (!sources || sources.length === 0) return [];

  return sources.map((source, index) => {
    const location = extractLocationInfo(source);
    return createHighlightMarker({
      text: source.text || source.content || "",
      type,
      location,
      label: `[${index + 1}]`,
    });
  });
}

/**
 * 在文本中查找并标记匹配片段
 * @param {string} fullText - 完整文本
 * @param {string} searchText - 要查找的文本
 * @param {Object} options - 配置选项
 * @returns {Object|null} 匹配结果 { startOffset, endOffset, context }
 */
function findTextInDocument(fullText, searchText, options = {}) {
  if (!fullText || !searchText) return null;

  const { caseSensitive = false, contextLength = 50 } = options;

  const searchIn = caseSensitive ? fullText : fullText.toLowerCase();
  const searchFor = caseSensitive ? searchText : searchText.toLowerCase();

  const startOffset = searchIn.indexOf(searchFor);
  if (startOffset === -1) return null;

  const endOffset = startOffset + searchText.length;

  // 提取上下文
  const contextStart = Math.max(0, startOffset - contextLength);
  const contextEnd = Math.min(fullText.length, endOffset + contextLength);
  const context = fullText.substring(contextStart, contextEnd);

  return {
    startOffset,
    endOffset,
    context,
    prefix: fullText.substring(contextStart, startOffset),
    match: fullText.substring(startOffset, endOffset),
    suffix: fullText.substring(endOffset, contextEnd),
  };
}

/**
 * 生成前端可用的高亮数据
 * @param {Array} highlights - 高亮标记列表
 * @returns {Object} 前端高亮数据
 */
function formatHighlightsForFrontend(highlights = []) {
  return {
    highlights: highlights.map((h) => ({
      id: h.id,
      type: h.type,
      label: h.label,
      text: h.text,
      location: h.location,
    })),
    summary: {
      total: highlights.length,
      byType: highlights.reduce((acc, h) => {
        acc[h.type] = (acc[h.type] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

/**
 * 根据 chunkId 获取原文定位 URL
 * @param {Object} location - 定位信息
 * @param {string} baseUrl - 基础 URL
 * @returns {string} 定位 URL
 */
function generateLocationUrl(location, baseUrl = "") {
  if (!location) return "";

  const params = new URLSearchParams();

  if (location.docId) params.set("docId", location.docId);
  if (location.chunkId) params.set("chunkId", location.chunkId);
  if (location.pageNumber) params.set("page", location.pageNumber);
  if (location.lineNumber) params.set("line", location.lineNumber);
  if (location.startOffset) params.set("start", location.startOffset);
  if (location.endOffset) params.set("end", location.endOffset);

  return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
}

module.exports = {
  HIGHLIGHT_TYPES,
  extractLocationInfo,
  createHighlightMarker,
  generateHighlightsFromSources,
  findTextInDocument,
  formatHighlightsForFrontend,
  generateLocationUrl,
};
