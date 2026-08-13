/**
 * Memory RAG 插件测试
 *
 * 测试 RAG 检索和 Citation 存储机制
 */

const { memory } = require("../../../utils/agents/aibitat/plugins/memory");

// Mock 依赖
jest.mock("../../../utils/helpers", () => ({
  getVectorDbClass: jest.fn(),
  getLLMProvider: jest.fn(),
}));

const { getVectorDbClass, getLLMProvider } = require("../../../utils/helpers");

describe("Memory RAG Plugin", () => {
  let mockAibitat;
  let pluginInstance;
  let mockVectorDB;
  let mockLLMConnector;

  beforeEach(() => {
    // 重置 mock
    jest.clearAllMocks();

    // Mock VectorDB
    mockVectorDB = {
      performSimilaritySearch: jest.fn(),
      addDocumentToNamespace: jest.fn(),
    };
    getVectorDbClass.mockReturnValue(mockVectorDB);

    // Mock LLM Provider
    mockLLMConnector = {};
    getLLMProvider.mockReturnValue(mockLLMConnector);

    // Mock Aibitat 实例
    mockAibitat = {
      introspect: jest.fn(),
      handlerProps: {
        invocation: {
          workspace: {
            slug: "test-workspace",
            chatProvider: "openai",
            chatModel: "gpt-4",
            topN: 4,
            vectorSearchMode: "default",
          },
        },
        log: jest.fn(),
      },
      _knowledgeSources: [],
      function: jest.fn((config) => {
        // 保存 handler 以便测试
        pluginInstance = config;
        // 绑定 super 引用
        pluginInstance.super = mockAibitat;
      }),
    };

    // 初始化插件
    const plugin = memory.plugin();
    plugin.setup(mockAibitat);
  });

  describe("插件初始化", () => {
    test("应正确注册 function", () => {
      expect(mockAibitat.function).toHaveBeenCalled();
      expect(pluginInstance.name).toBe("rag-memory");
    });

    test("应包含正确的 description", () => {
      expect(pluginInstance.description).toContain("Search against local documents");
    });

    test("应定义正确的 parameters schema", () => {
      expect(pluginInstance.parameters.properties.action.enum).toEqual(["search", "store"]);
      expect(pluginInstance.parameters.properties.content.type).toBe("string");
    });
  });

  describe("search 功能", () => {
    test("搜索成功时应返回上下文并存储 sources", async () => {
      const mockSources = [
        {
          id: "doc-1",
          title: "测试文档",
          text: "这是测试内容",
          chunkSource: "file://test.pdf",
          score: 0.95,
        },
      ];

      mockVectorDB.performSimilaritySearch.mockResolvedValue({
        contextTexts: ["这是相关的上下文内容"],
        sources: mockSources,
      });

      // 初始化 tracker
      pluginInstance.tracker = { isDuplicate: () => false, trackRun: jest.fn() };

      const result = await pluginInstance.search("测试查询");

      expect(result).toContain("Additional context for query");
      expect(mockAibitat._knowledgeSources.length).toBe(1);
      expect(mockAibitat._knowledgeSources[0].title).toBe("测试文档");
    });

    test("无结果时应返回提示信息", async () => {
      mockVectorDB.performSimilaritySearch.mockResolvedValue({
        contextTexts: [],
        sources: [],
      });

      pluginInstance.tracker = { isDuplicate: () => false, trackRun: jest.fn() };

      const result = await pluginInstance.search("无结果的查询");

      expect(result).toContain("no additional context found");
    });

    test("应正确格式化 sources 字段", async () => {
      const rawSources = [
        {
          vectorId: "vec-1",
          metadata: { title: "元数据标题", chunkSource: "file://meta.pdf" },
          pageContent: "页面内容",
          _distance: 0.1,
        },
      ];

      mockVectorDB.performSimilaritySearch.mockResolvedValue({
        contextTexts: ["内容"],
        sources: rawSources,
      });

      pluginInstance.tracker = { isDuplicate: () => false, trackRun: jest.fn() };

      await pluginInstance.search("查询");

      const formattedSource = mockAibitat._knowledgeSources[0];
      expect(formattedSource.id).toBe("vec-1");
      expect(formattedSource.title).toBe("元数据标题");
      expect(formattedSource.text).toBe("页面内容");
      expect(formattedSource.chunkSource).toBe("file://meta.pdf");
    });

    test("搜索出错时应返回错误信息", async () => {
      mockVectorDB.performSimilaritySearch.mockRejectedValue(new Error("DB 连接失败"));

      pluginInstance.tracker = { isDuplicate: () => false, trackRun: jest.fn() };

      const result = await pluginInstance.search("查询");

      expect(result).toContain("error was raised");
      expect(result).toContain("DB 连接失败");
    });
  });

  describe("store 功能", () => {
    test("存储成功时应返回成功信息", async () => {
      mockVectorDB.addDocumentToNamespace.mockResolvedValue({ error: null });

      pluginInstance.tracker = { isDuplicate: () => false, trackRun: jest.fn() };

      const result = await pluginInstance.store("要存储的内容");

      expect(result).toContain("successfully embedded");
      expect(mockVectorDB.addDocumentToNamespace).toHaveBeenCalledWith(
        "test-workspace",
        expect.objectContaining({
          pageContent: "要存储的内容",
          docAuthor: "@agent",
        }),
        null
      );
    });

    test("存储失败时应返回错误信息", async () => {
      mockVectorDB.addDocumentToNamespace.mockResolvedValue({ error: "存储失败" });

      pluginInstance.tracker = { isDuplicate: () => false, trackRun: jest.fn() };

      const result = await pluginInstance.store("内容");

      expect(result).toContain("failed to be embedded");
    });
  });

  describe("handler 重复调用检测", () => {
    test("重复调用应返回忽略信息", async () => {
      pluginInstance.tracker = {
        isDuplicate: () => true,
        trackRun: jest.fn(),
      };

      const result = await pluginInstance.handler({ action: "search", content: "重复" });

      expect(result).toContain("duplicated call");
    });
  });
});

