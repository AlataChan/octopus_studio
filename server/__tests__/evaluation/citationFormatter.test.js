/* eslint-env jest */
const {
  CITATION_FORMATS,
  extractCitations,
  formatCitationsMarkdown,
  formatCitationsHTML,
  insertCitationMarkers,
  appendCitationSection,
} = require("../../utils/chats/citationFormatter");

describe("CitationFormatter", () => {
  const mockSources = [
    {
      title: "产品手册",
      docPath: "/docs/product-manual.pdf",
      score: 0.85,
      text: "这是产品手册的内容摘要，包含产品功能介绍和使用说明。",
    },
    {
      title: "技术文档",
      metadata: { docPath: "/docs/tech-spec.md", score: 0.72 },
      text: "技术规格说明文档。",
    },
    {
      url: "https://example.com/guide",
      text: "在线指南内容。",
    },
  ];

  describe("extractCitations", () => {
    it("空数组应返回空数组", () => {
      expect(extractCitations([])).toEqual([]);
      expect(extractCitations(null)).toEqual([]);
    });

    it("应正确提取引用信息", () => {
      const citations = extractCitations(mockSources);

      expect(citations).toHaveLength(3);
      expect(citations[0].index).toBe(1);
      expect(citations[0].title).toBe("产品手册");
      expect(citations[0].path).toBe("/docs/product-manual.pdf");
      expect(citations[0].score).toBe(0.85);
    });

    it("应处理缺失字段", () => {
      const citations = extractCitations(mockSources);

      expect(citations[2].title).toBe("来源 3");
      expect(citations[2].path).toBe("https://example.com/guide");
    });
  });

  describe("formatCitationsMarkdown", () => {
    it("空引用应返回空字符串", () => {
      expect(formatCitationsMarkdown([])).toBe("");
    });

    it("应生成正确的 Markdown 格式", () => {
      const citations = extractCitations(mockSources);
      const markdown = formatCitationsMarkdown(citations);

      expect(markdown).toContain("## 参考来源");
      expect(markdown).toContain("**[1]** 产品手册");
      expect(markdown).toContain("路径: `/docs/product-manual.pdf`");
    });

    it("应支持自定义标题", () => {
      const citations = extractCitations(mockSources);
      const markdown = formatCitationsMarkdown(citations, { title: "References" });

      expect(markdown).toContain("## References");
    });

    it("应支持显示相关度", () => {
      const citations = extractCitations(mockSources);
      const markdown = formatCitationsMarkdown(citations, { showScore: true });

      expect(markdown).toContain("相关度: 85.0%");
    });
  });

  describe("formatCitationsHTML", () => {
    it("空引用应返回空字符串", () => {
      expect(formatCitationsHTML([])).toBe("");
    });

    it("应生成正确的 HTML 格式", () => {
      const citations = extractCitations(mockSources);
      const html = formatCitationsHTML(citations);

      expect(html).toContain("<h2>参考来源</h2>");
      expect(html).toContain('<li id="citation-1">');
      expect(html).toContain("<strong>产品手册</strong>");
    });
  });

  describe("insertCitationMarkers", () => {
    it("无源文档时返回原文本", () => {
      const result = insertCitationMarkers("原始文本", []);

      expect(result.text).toBe("原始文本");
      expect(result.citations).toEqual([]);
    });

    it("应在文本末尾添加引用标记", () => {
      const result = insertCitationMarkers("这是回答内容。", mockSources);

      expect(result.text).toContain("[1]");
      expect(result.text).toContain("[2]");
      expect(result.text).toContain("[3]");
      expect(result.citations).toHaveLength(3);
    });

    it("已有引用标记时不重复添加", () => {
      const result = insertCitationMarkers("这是回答内容 [来源1]。", mockSources);

      expect(result.text).toBe("这是回答内容 [来源1]。");
    });
  });

  describe("appendCitationSection", () => {
    it("无源文档时返回原文本", () => {
      const result = appendCitationSection("原始文本", []);
      expect(result).toBe("原始文本");
    });

    it("应添加 Markdown 格式的参考来源章节", () => {
      const result = appendCitationSection("这是报告内容。", mockSources);

      expect(result).toContain("这是报告内容。");
      expect(result).toContain("## 参考来源");
      expect(result).toContain("**[1]** 产品手册");
    });

    it("应支持 HTML 格式", () => {
      const result = appendCitationSection("这是报告内容。", mockSources, {
        format: CITATION_FORMATS.HTML,
      });

      expect(result).toContain("<h2>参考来源</h2>");
    });

    it("应支持纯文本格式", () => {
      const result = appendCitationSection("这是报告内容。", mockSources, {
        format: CITATION_FORMATS.PLAIN,
      });

      expect(result).toContain("[1] 产品手册 - /docs/product-manual.pdf");
    });
  });
});

