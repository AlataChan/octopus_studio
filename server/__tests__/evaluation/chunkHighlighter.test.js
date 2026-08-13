/* eslint-env jest */
const {
  HIGHLIGHT_TYPES,
  extractLocationInfo,
  createHighlightMarker,
  generateHighlightsFromSources,
  findTextInDocument,
  formatHighlightsForFrontend,
  generateLocationUrl,
} = require("../../utils/chats/chunkHighlighter");

describe("ChunkHighlighter", () => {
  describe("extractLocationInfo", () => {
    it("应从 source 中提取定位信息", () => {
      const source = {
        chunkId: "chunk-123",
        docId: "doc-456",
        docPath: "/docs/test.pdf",
        startOffset: 100,
        endOffset: 200,
      };

      const location = extractLocationInfo(source);

      expect(location.chunkId).toBe("chunk-123");
      expect(location.docId).toBe("doc-456");
      expect(location.docPath).toBe("/docs/test.pdf");
      expect(location.startOffset).toBe(100);
      expect(location.endOffset).toBe(200);
    });

    it("应从 metadata 中提取定位信息", () => {
      const source = {
        metadata: {
          chunkId: "chunk-789",
          pageNumber: 5,
        },
      };

      const location = extractLocationInfo(source);

      expect(location.chunkId).toBe("chunk-789");
      expect(location.pageNumber).toBe(5);
    });

    it("缺失字段应返回 null", () => {
      const location = extractLocationInfo({});

      expect(location.chunkId).toBeNull();
      expect(location.docId).toBeNull();
    });
  });

  describe("createHighlightMarker", () => {
    it("应创建高亮标记", () => {
      const marker = createHighlightMarker({
        text: "高亮文本",
        type: HIGHLIGHT_TYPES.CITATION,
        label: "[1]",
        location: { chunkId: "chunk-1" },
      });

      expect(marker.id).toBeDefined();
      expect(marker.text).toBe("高亮文本");
      expect(marker.type).toBe(HIGHLIGHT_TYPES.CITATION);
      expect(marker.label).toBe("[1]");
      expect(marker.location.chunkId).toBe("chunk-1");
    });

    it("应截断过长文本", () => {
      const longText = "a".repeat(1000);
      const marker = createHighlightMarker({ text: longText });

      expect(marker.text.length).toBe(500);
    });
  });

  describe("generateHighlightsFromSources", () => {
    it("空数组应返回空数组", () => {
      expect(generateHighlightsFromSources([])).toEqual([]);
      expect(generateHighlightsFromSources(null)).toEqual([]);
    });

    it("应为每个 source 生成高亮标记", () => {
      const sources = [
        { text: "文本1", chunkId: "chunk-1" },
        { text: "文本2", chunkId: "chunk-2" },
      ];

      const highlights = generateHighlightsFromSources(sources);

      expect(highlights).toHaveLength(2);
      expect(highlights[0].label).toBe("[1]");
      expect(highlights[1].label).toBe("[2]");
    });
  });

  describe("findTextInDocument", () => {
    const fullText = "这是一段完整的文档内容，包含多个段落和关键信息。";

    it("应找到匹配文本", () => {
      const result = findTextInDocument(fullText, "关键信息");

      expect(result).not.toBeNull();
      expect(result.match).toBe("关键信息");
      expect(result.startOffset).toBeGreaterThan(0);
    });

    it("未找到时返回 null", () => {
      const result = findTextInDocument(fullText, "不存在的文本");
      expect(result).toBeNull();
    });

    it("应提取上下文", () => {
      const result = findTextInDocument(fullText, "关键信息", { contextLength: 10 });

      expect(result.prefix).toBeDefined();
      expect(result.suffix).toBeDefined();
      expect(result.context).toContain("关键信息");
    });

    it("应支持大小写不敏感", () => {
      const text = "Hello World";
      const result = findTextInDocument(text, "hello", { caseSensitive: false });

      expect(result).not.toBeNull();
      expect(result.match).toBe("Hello");
    });
  });

  describe("formatHighlightsForFrontend", () => {
    it("应格式化高亮数据", () => {
      const highlights = [
        { id: "1", type: HIGHLIGHT_TYPES.CITATION, label: "[1]", text: "文本1", location: {} },
        { id: "2", type: HIGHLIGHT_TYPES.EVIDENCE, label: "[2]", text: "文本2", location: {} },
        { id: "3", type: HIGHLIGHT_TYPES.CITATION, label: "[3]", text: "文本3", location: {} },
      ];

      const result = formatHighlightsForFrontend(highlights);

      expect(result.highlights).toHaveLength(3);
      expect(result.summary.total).toBe(3);
      expect(result.summary.byType[HIGHLIGHT_TYPES.CITATION]).toBe(2);
      expect(result.summary.byType[HIGHLIGHT_TYPES.EVIDENCE]).toBe(1);
    });
  });

  describe("generateLocationUrl", () => {
    it("应生成定位 URL", () => {
      const location = {
        docId: "doc-123",
        chunkId: "chunk-456",
        pageNumber: 5,
      };

      const url = generateLocationUrl(location, "/viewer");

      expect(url).toContain("docId=doc-123");
      expect(url).toContain("chunkId=chunk-456");
      expect(url).toContain("page=5");
    });

    it("空定位应返回空字符串", () => {
      expect(generateLocationUrl(null)).toBe("");
      expect(generateLocationUrl({})).toBe("");
    });
  });
});

