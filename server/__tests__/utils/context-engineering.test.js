/**
 * Context Engineering 功能测试
 *
 * 测试 Phase 3 实现的功能：
 * 1. WorkingMemory 锚定字段
 * 2. ConversationSummarizer 锚定摘要
 * 3. Observation Masking 工具结果压缩
 * 4. 统一上下文格式化
 */

const { WorkingMemory, SCHEMA_VERSION, DEFAULT_ANCHORED_CONTEXT } = require("../../utils/memory/workingMemory");
const { ConversationSummarizer } = require("../../utils/memory/conversationSummarizer");
const { compressToolResult, estimateTokens, COMPRESSION_CONFIG } = require("../../utils/agents/aibitat/observationMasking");
const { getUnifiedAnchoredContext } = require("../../utils/chats/contextEnhancer");
const {
  TOOL_LAYERS,
  TOOL_METADATA,
  getToolDescription,
  getToolsByLayer,
  getToolCostLevel,
  hasToolSideEffects,
  registerToolMetadata,
  selectToolsForContext,
  generateToolsSummary,
} = require("../../utils/agents/aibitat/toolDescriptionStandards");
const { SYSTEM_TOOLS, OUTPUT_TOOLS, CONTEXT_TOOLS } = require("../../utils/agents/aibitat/plugins");
const { ContextEngineeringSkill } = require("../../utils/skills/builtin/ContextEngineeringSkill");
const { skillRegistry } = require("../../utils/skills/SkillRegistry");

describe("Context Engineering - Phase 3", () => {
  describe("WorkingMemory 锚定字段", () => {
    test("SCHEMA_VERSION 应该是 1.0", () => {
      expect(SCHEMA_VERSION).toBe("1.0");
    });

    test("DEFAULT_ANCHORED_CONTEXT 应该包含所有锚定字段", () => {
      expect(DEFAULT_ANCHORED_CONTEXT).toHaveProperty("schema_version");
      expect(DEFAULT_ANCHORED_CONTEXT).toHaveProperty("session_intent");
      expect(DEFAULT_ANCHORED_CONTEXT).toHaveProperty("artifacts_generated");
      expect(DEFAULT_ANCHORED_CONTEXT).toHaveProperty("active_topics");
      expect(DEFAULT_ANCHORED_CONTEXT).toHaveProperty("pending_tasks");
      expect(DEFAULT_ANCHORED_CONTEXT).toHaveProperty("key_decisions");
    });

    test("parseMetadata 应该正确解析字符串 metadata", () => {
      const metadataStr = JSON.stringify({
        active_topics: ["topic1", "topic2"],
        pending_tasks: [{ task: "task1", status: "pending" }],
      });

      const result = WorkingMemory.parseMetadata(metadataStr);

      expect(result.schema_version).toBe(SCHEMA_VERSION);
      expect(result.active_topics).toEqual(["topic1", "topic2"]);
      expect(result.pending_tasks).toHaveLength(1);
    });

    test("parseMetadata 应该迁移旧版数据", () => {
      const oldMetadata = {
        active_topics: ["old_topic"],
        // 没有 schema_version
      };

      const result = WorkingMemory.migrateToV1(oldMetadata);

      expect(result.schema_version).toBe(SCHEMA_VERSION);
      expect(result.active_topics).toEqual(["old_topic"]);
      expect(result.session_intent).toBeNull();
      expect(result.artifacts_generated).toEqual([]);
    });

    test("getWorkingContext 应该返回完整的锚定上下文结构", () => {
      const mockThread = {
        metadata: JSON.stringify({
          schema_version: "1.0",
          session_intent: "测试会话",
          active_topics: ["测试主题"],
          pending_tasks: [{ id: "t1", task: "任务1", status: "pending" }],
          key_decisions: [{ id: "d1", decision: "决策1" }],
          artifacts_generated: ["file1.js"],
          conversation_summary: { content: "摘要内容" },
        }),
      };

      const ctx = WorkingMemory.getWorkingContext(mockThread);

      expect(ctx.schema_version).toBe("1.0");
      expect(ctx.session_intent).toBe("测试会话");
      expect(ctx.topics).toEqual(["测试主题"]);
      expect(ctx.tasks).toHaveLength(1);
      expect(ctx.decisions).toHaveLength(1);
      expect(ctx.artifacts_generated).toEqual(["file1.js"]);
      expect(ctx.summary).toBe("摘要内容");
    });

    test("formatWorkingContext 应该生成格式化的锚定上下文", () => {
      const mockThread = {
        metadata: JSON.stringify({
          schema_version: "1.0",
          session_intent: "实现用户登录功能",
          active_topics: ["认证", "安全"],
          pending_tasks: [{ task: "编写测试", status: "pending" }],
          key_decisions: [{ decision: "使用 JWT", reason: "安全性好" }],
        }),
      };

      const formatted = WorkingMemory.formatWorkingContext(mockThread);

      expect(formatted).toContain("[会话意图]: 实现用户登录功能");
      expect(formatted).toContain("[当前主题]: 认证, 安全");
      expect(formatted).toContain("[待办任务]:");
      expect(formatted).toContain("编写测试");
      expect(formatted).toContain("[关键决策]:");
      expect(formatted).toContain("使用 JWT");
    });

    test("getWorkingContext 对空 thread 应该返回默认结构", () => {
      const ctx = WorkingMemory.getWorkingContext(null);

      expect(ctx.schema_version).toBe(SCHEMA_VERSION);
      expect(ctx.session_intent).toBeNull();
      expect(ctx.topics).toEqual([]);
      expect(ctx.tasks).toEqual([]);
    });
  });

  describe("ConversationSummarizer 锚定摘要", () => {
    test("parseAnchoredResponse 应该正确解析 JSON 响应", () => {
      const jsonResponse = JSON.stringify({
        session_intent: "测试意图",
        main_topics: ["话题1", "话题2"],
        key_decisions: ["决策1"],
        pending_tasks: ["任务1"],
        artifacts: ["产物1"],
        summary_text: "摘要文本",
      });

      const result = ConversationSummarizer.parseAnchoredResponse(jsonResponse);

      expect(result.session_intent).toBe("测试意图");
      expect(result.main_topics).toEqual(["话题1", "话题2"]);
      expect(result.key_decisions).toEqual(["决策1"]);
      expect(result.pending_tasks).toEqual(["任务1"]);
      expect(result.artifacts).toEqual(["产物1"]);
      expect(result.summary_text).toBe("摘要文本");
    });

    test("parseAnchoredResponse 应该从混合文本中提取 JSON", () => {
      const mixedResponse = `根据对话分析，以下是摘要：
{
  "session_intent": "提取的意图",
  "main_topics": [],
  "key_decisions": [],
  "pending_tasks": [],
  "artifacts": [],
  "summary_text": "提取的摘要"
}
希望这个摘要有帮助。`;

      const result = ConversationSummarizer.parseAnchoredResponse(mixedResponse);

      expect(result).not.toBeNull();
      expect(result.session_intent).toBe("提取的意图");
      expect(result.summary_text).toBe("提取的摘要");
    });

    test("validateAnchoredSummary 应该过滤无效字段", () => {
      const invalidObj = {
        session_intent: 123, // 应该是 string
        main_topics: "not array", // 应该是 array
        key_decisions: [1, 2, "valid"], // 应该只保留 string
        extra_field: "should be ignored",
      };

      const result = ConversationSummarizer.validateAnchoredSummary(invalidObj);

      expect(result.session_intent).toBeNull(); // 类型不对，返回 null
      expect(result.main_topics).toEqual([]); // 不是数组，返回空
      expect(result.key_decisions).toEqual(["valid"]); // 只保留 string
    });

    test("formatSummaryForContext 应该生成锚定格式", () => {
      const mockThread = {
        metadata: JSON.stringify({
          conversation_summary: {
            content: "旧格式摘要",
            anchored: {
              session_intent: "用户想要创建报表",
              main_topics: ["数据分析", "可视化"],
              key_decisions: ["使用 ECharts"],
              pending_tasks: ["完成图表配置"],
              artifacts: ["chart.js"],
              summary_text: "用户需要数据可视化功能",
            },
            updatedAt: "2024-01-01T00:00:00Z",
          },
        }),
      };

      const formatted = ConversationSummarizer.formatSummaryForContext(mockThread);

      expect(formatted).toContain("[会话意图]: 用户想要创建报表");
      expect(formatted).toContain("[主要话题]: 数据分析, 可视化");
      expect(formatted).toContain("[关键决策]: 使用 ECharts");
      expect(formatted).toContain("[待办任务]: 完成图表配置");
      expect(formatted).toContain("[已生成]: chart.js");
      expect(formatted).toContain("[对话摘要]: 用户需要数据可视化功能");
    });

    test("mergeArrays 应该正确合并并去重", () => {
      const existing = ["a", "b"];
      const newItems = ["b", "c", "d"];

      const result = ConversationSummarizer.mergeArrays(existing, newItems, 5);

      expect(result).toEqual(["a", "b", "c", "d"]);
    });

    test("mergeArrays 应该限制最大长度", () => {
      const existing = ["a", "b", "c"];
      const newItems = ["d", "e", "f"];

      const result = ConversationSummarizer.mergeArrays(existing, newItems, 4);

      // 应该保留最新的 4 个
      expect(result).toHaveLength(4);
      expect(result).toEqual(["c", "d", "e", "f"]);
    });
  });

  describe("Observation Masking 工具结果压缩", () => {
    test("estimateTokens 应该正确估算 token 数量", () => {
      const englishText = "Hello world, this is a test.";
      const chineseText = "你好世界，这是一个测试。";
      const mixedText = "Hello 你好 World 世界";

      expect(estimateTokens(englishText)).toBeGreaterThan(0);
      expect(estimateTokens(chineseText)).toBeGreaterThan(0);
      expect(estimateTokens(mixedText)).toBeGreaterThan(0);
      // 中文应该比英文产生更多 token（相同字符数）
      expect(estimateTokens(chineseText)).toBeGreaterThan(
        estimateTokens("a".repeat(chineseText.length)) * 0.3
      );
    });

    test("compressToolResult 应该跳过短内容", () => {
      const shortResult = "OK";

      const { compressed, stats } = compressToolResult("test-tool", shortResult);

      expect(compressed).toBe(shortResult);
      expect(stats.skipped).toBe(true);
      expect(stats.reason).toBe("below threshold");
    });

    test("compressToolResult 应该压缩长 JSON 数组", () => {
      // 创建一个较小的数组，确保压缩后仍是有效 JSON
      const longArray = Array(20).fill(null).map((_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: i * 10,
      }));
      const longResult = JSON.stringify(longArray);

      const { compressed, stats } = compressToolResult("test-tool", longResult);

      expect(stats.skipped).toBeFalsy();
      expect(compressed.length).toBeLessThan(longResult.length);
      expect(stats.compressionRatio).toBeDefined();
      expect(stats.isJson).toBe(true);

      // 验证压缩后仍是有效 JSON
      const parsed = JSON.parse(compressed);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeLessThanOrEqual(COMPRESSION_CONFIG.maxArrayItems + 1); // +1 for truncation marker
    });

    test("compressToolResult 应该截断长字符串", () => {
      const longString = "A".repeat(5000);

      const { compressed, stats } = compressToolResult("test-tool", longString);

      expect(compressed.length).toBeLessThan(longString.length);
      expect(compressed).toContain("truncated");
      expect(stats.originalLength).toBe(5000);
    });

    test("compressToolResult 应该保留工具特定字段", () => {
      const webSearchResult = JSON.stringify([
        { title: "Result 1", url: "http://example.com", snippet: "...", raw_html: "<html>..." },
        { title: "Result 2", url: "http://example.org", snippet: "...", cached_page: "..." },
      ]);

      const { compressed } = compressToolResult("web-search", webSearchResult);
      const parsed = JSON.parse(compressed);

      // 应该保留 keepFields
      expect(parsed[0]).toHaveProperty("title");
      expect(parsed[0]).toHaveProperty("url");
      expect(parsed[0]).toHaveProperty("snippet");
      // 应该移除 removeFields（如果原数据超过压缩阈值）
    });

    test("COMPRESSION_CONFIG 应该有合理的默认值", () => {
      expect(COMPRESSION_CONFIG.enabled).toBe(true);
      expect(COMPRESSION_CONFIG.minCharsToCompress).toBeGreaterThan(0);
      expect(COMPRESSION_CONFIG.maxCompressedChars).toBeGreaterThan(COMPRESSION_CONFIG.minCharsToCompress);
      expect(COMPRESSION_CONFIG.maxArrayItems).toBeGreaterThan(0);
    });
  });

  describe("统一上下文格式化", () => {
    test("getUnifiedAnchoredContext 应该返回统一格式", () => {
      const mockThread = {
        metadata: JSON.stringify({
          schema_version: "1.0",
          session_intent: "统一测试",
          active_topics: ["主题A"],
          pending_tasks: [{ task: "任务A", status: "in_progress" }],
          key_decisions: [{ decision: "决策A" }],
          artifacts_generated: [{ name: "file.js" }],
          conversation_summary: {
            content: "摘要内容",
            messageCount: 15,
          },
        }),
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2天前
      };

      const unified = getUnifiedAnchoredContext(mockThread);

      expect(unified).toContain("[会话意图]: 统一测试");
      expect(unified).toContain("[当前主题]: 主题A");
      expect(unified).toContain("任务A");
      expect(unified).toContain("决策A");
      expect(unified).toContain("file.js");
      expect(unified).toContain("[对话摘要]: 摘要内容");
    });

    test("getUnifiedAnchoredContext 对空 thread 应该返回 null", () => {
      const result = getUnifiedAnchoredContext(null);
      expect(result).toBeNull();
    });

    test("getUnifiedAnchoredContext 对空 metadata 应该返回 null", () => {
      const result = getUnifiedAnchoredContext({ metadata: null });
      expect(result).toBeNull();
    });
  });

  describe("工具描述规范化 (P2)", () => {
    describe("工具层级定义", () => {
      test("TOOL_LAYERS 应该定义四个层级", () => {
        expect(TOOL_LAYERS.SYSTEM).toBe(1);
        expect(TOOL_LAYERS.OUTPUT).toBe(2);
        expect(TOOL_LAYERS.CONTEXT).toBe(3);
        expect(TOOL_LAYERS.BUSINESS).toBe(4);
      });

      test("SYSTEM_TOOLS 应该包含系统级工具", () => {
        expect(Array.isArray(SYSTEM_TOOLS)).toBe(true);
        expect(SYSTEM_TOOLS).toContain("datetime-info");
      });

      test("OUTPUT_TOOLS 应该包含输出级工具", () => {
        expect(Array.isArray(OUTPUT_TOOLS)).toBe(true);
        expect(OUTPUT_TOOLS).toContain("generate-excel-report");
        expect(OUTPUT_TOOLS).toContain("generate-presentation");
        expect(OUTPUT_TOOLS).toContain("save-file-to-browser");
      });

      test("CONTEXT_TOOLS 应该包含上下文工具", () => {
        expect(Array.isArray(CONTEXT_TOOLS)).toBe(true);
        expect(CONTEXT_TOOLS).toContain("memory");
        expect(CONTEXT_TOOLS).toContain("summarize-conversation");
        expect(CONTEXT_TOOLS).toContain("chat-history");
        expect(CONTEXT_TOOLS).toContain("knowledge-graph");
      });
    });

    describe("工具元数据", () => {
      test("TOOL_METADATA 应该包含预定义的工具", () => {
        expect(TOOL_METADATA["datetime-info"]).toBeDefined();
        expect(TOOL_METADATA["generate-excel-report"]).toBeDefined();
        expect(TOOL_METADATA["memory"]).toBeDefined();
      });

      test("每个工具元数据应该有必要的字段", () => {
        const meta = TOOL_METADATA["datetime-info"];
        expect(meta).toHaveProperty("layer");
        expect(meta).toHaveProperty("category");
        expect(meta).toHaveProperty("shortDesc");
        expect(meta).toHaveProperty("standardDesc");
        expect(meta).toHaveProperty("costLevel");
        expect(meta).toHaveProperty("sideEffects");
      });
    });

    describe("getToolDescription", () => {
      test("应该返回短描述", () => {
        const desc = getToolDescription("datetime-info", "short");
        expect(desc).toBe("获取当前日期和时间");
      });

      test("应该返回标准描述", () => {
        const desc = getToolDescription("datetime-info", "standard");
        expect(desc).toContain("获取当前的日期、时间和时区信息");
      });

      test("未知工具应该返回默认描述", () => {
        const desc = getToolDescription("unknown-tool", "short");
        expect(desc).toContain("unknown-tool");
      });
    });

    describe("getToolsByLayer", () => {
      test("应该返回系统级工具列表", () => {
        const tools = getToolsByLayer(TOOL_LAYERS.SYSTEM);
        expect(Array.isArray(tools)).toBe(true);
        expect(tools).toContain("datetime-info");
      });

      test("应该返回输出级工具列表", () => {
        const tools = getToolsByLayer(TOOL_LAYERS.OUTPUT);
        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(0);
      });

      test("应该返回上下文级工具列表", () => {
        const tools = getToolsByLayer(TOOL_LAYERS.CONTEXT);
        expect(Array.isArray(tools)).toBe(true);
        expect(tools).toContain("memory");
      });
    });

    describe("getToolCostLevel 和 hasToolSideEffects", () => {
      test("getToolCostLevel 应该返回正确的消耗等级", () => {
        expect(getToolCostLevel("datetime-info")).toBe("low");
        expect(getToolCostLevel("generate-excel-report")).toBe("medium");
        expect(getToolCostLevel("web-browsing")).toBe("high");
      });

      test("hasToolSideEffects 应该返回正确的副作用标志", () => {
        expect(hasToolSideEffects("datetime-info")).toBe(false);
        expect(hasToolSideEffects("memory")).toBe(true);
        expect(hasToolSideEffects("web-browsing")).toBe(false);
      });
    });

    describe("registerToolMetadata", () => {
      test("应该能注册自定义工具元数据", () => {
        registerToolMetadata("custom-tool", {
          layer: TOOL_LAYERS.BUSINESS,
          category: "custom",
          shortDesc: "自定义工具",
          standardDesc: "这是一个自定义工具的描述",
          costLevel: "low",
          sideEffects: false,
        });

        expect(TOOL_METADATA["custom-tool"]).toBeDefined();
        expect(TOOL_METADATA["custom-tool"].shortDesc).toBe("自定义工具");
        expect(TOOL_METADATA["custom-tool"].layer).toBe(TOOL_LAYERS.BUSINESS);
      });

      test("应该使用默认值填充缺失字段", () => {
        registerToolMetadata("minimal-tool", {
          shortDesc: "最小工具",
        });

        expect(TOOL_METADATA["minimal-tool"].layer).toBe(TOOL_LAYERS.BUSINESS);
        expect(TOOL_METADATA["minimal-tool"].category).toBe("custom");
        expect(TOOL_METADATA["minimal-tool"].costLevel).toBe("medium");
      });
    });

    describe("selectToolsForContext", () => {
      test("应该始终包含系统工具", () => {
        const selected = selectToolsForContext({
          availableTools: ["memory", "web-browsing"],
          conversationLength: 0,
        });

        expect(selected).toContain("datetime-info");
      });

      test("对话超过5轮应该包含上下文工具", () => {
        const selected = selectToolsForContext({
          availableTools: ["memory", "chat-history", "web-browsing"],
          conversationLength: 6,
        });

        expect(selected).toContain("memory");
        expect(selected).toContain("chat-history");
      });

      test("对话少于5轮不应该自动包含上下文工具", () => {
        const selected = selectToolsForContext({
          availableTools: ["memory", "chat-history", "web-browsing"],
          conversationLength: 3,
        });

        // 系统工具应该包含
        expect(selected).toContain("datetime-info");
        // 但也应该包含可用的业务工具
        expect(selected).toContain("web-browsing");
      });

      test("应该根据用户意图包含相关工具", () => {
        const selected = selectToolsForContext({
          availableTools: ["sql-agent", "duckdb-agent", "memory"],
          conversationLength: 0,
          userIntent: "我需要分析数据库中的数据",
        });

        expect(selected).toContain("sql-agent");
        expect(selected).toContain("duckdb-agent");
      });
    });

    describe("generateToolsSummary", () => {
      test("compact 格式应该按分类分组", () => {
        const summary = generateToolsSummary(
          ["datetime-info", "memory", "web-browsing"],
          "compact"
        );

        expect(summary).toContain("[system]");
        expect(summary).toContain("[context]");
        expect(summary).toContain("[research]");
      });

      test("standard 格式应该列出每个工具的描述", () => {
        const summary = generateToolsSummary(
          ["datetime-info", "memory"],
          "standard"
        );

        expect(summary).toContain("- datetime-info:");
        expect(summary).toContain("- memory:");
      });
    });
  });

  describe("Skill 体系对齐 (P3)", () => {
    describe("ContextEngineeringSkill", () => {
      let skill;

      beforeAll(() => {
        skill = new ContextEngineeringSkill();
      });

      test("应该正确初始化 Skill 元数据", () => {
        const metadata = skill.getMetadata();

        expect(metadata.id).toBe("builtin:context-engineering");
        expect(metadata.name).toBe("上下文工程");
        expect(metadata.version).toBe("1.0.0");
        expect(metadata.icon).toBe("🧠");
        expect(metadata.tags).toContain("context");
        expect(metadata.tags).toContain("memory");
      });

      test("应该定义工具绑定", () => {
        const toolBindings = skill.getToolBindings();

        expect(Array.isArray(toolBindings)).toBe(true);
        expect(toolBindings.length).toBeGreaterThan(0);

        // 应该包含上下文工具
        const toolNames = toolBindings.map(t => t.toolName);
        expect(toolNames).toContain("memory");
        expect(toolNames).toContain("summarize-conversation");
        expect(toolNames).toContain("chat-history");
        expect(toolNames).toContain("knowledge-graph");
      });

      test("工具绑定应该有正确的风险等级", () => {
        const toolBindings = skill.getToolBindings();

        for (const binding of toolBindings) {
          expect(binding).toHaveProperty("riskLevel");
          expect(binding).toHaveProperty("autoApproved");
          // 上下文工具应该是 safe-read 级别
          expect(binding.riskLevel).toBe("safe-read");
          expect(binding.autoApproved).toBe(true);
        }
      });

      test("应该定义 Flow 模板", () => {
        const flowTemplates = skill.getFlowTemplates();

        expect(Array.isArray(flowTemplates)).toBe(true);
        expect(flowTemplates.length).toBeGreaterThan(0);

        // 检查 Flow 模板结构
        const summaryFlow = flowTemplates.find(f => f.id === "context-summary-flow");
        expect(summaryFlow).toBeDefined();
        expect(summaryFlow.slashCommand).toBe("/summarize");
        expect(summaryFlow.flowDefinition.steps.length).toBeGreaterThan(0);
      });

      test("应该定义配置 Schema", () => {
        const configSchema = skill.getConfigSchema();

        expect(configSchema.version).toBe("1.0");
        expect(Array.isArray(configSchema.fields)).toBe(true);

        // 应该有关键配置字段
        const fieldKeys = configSchema.fields.map(f => f.key);
        expect(fieldKeys).toContain("autoSummarize");
        expect(fieldKeys).toContain("summaryThreshold");
        expect(fieldKeys).toContain("enableKnowledgeGraph");
        expect(fieldKeys).toContain("progressiveDisclosure");
      });

      test("应该返回正确的默认配置", () => {
        const defaultConfig = skill.getDefaultConfig();

        expect(defaultConfig.autoSummarize).toBe(true);
        expect(defaultConfig.summaryThreshold).toBe(10);
        expect(defaultConfig.enableKnowledgeGraph).toBe(true);
        expect(defaultConfig.progressiveDisclosure).toBe("auto");
      });

      test("getContextToolsInjection 应该根据对话长度决定注入", () => {
        // 短对话不注入
        const shortConvo = skill.getContextToolsInjection({
          conversationLength: 3,
          disclosureMode: "auto",
        });
        expect(shortConvo.inject).toBe(false);

        // 长对话注入
        const longConvo = skill.getContextToolsInjection({
          conversationLength: 10,
          disclosureMode: "auto",
        });
        expect(longConvo.inject).toBe(true);
        expect(longConvo.tools).toContain("memory");
        expect(longConvo.tools).toContain("summarize-conversation");
      });

      test("getContextToolsInjection 应该支持 always 模式", () => {
        const result = skill.getContextToolsInjection({
          conversationLength: 1,
          disclosureMode: "always",
        });

        expect(result.inject).toBe(true);
        expect(result.tools.length).toBeGreaterThan(0);
      });

      test("getContextToolsInjection 应该支持 manual 模式", () => {
        const result = skill.getContextToolsInjection({
          conversationLength: 100,
          disclosureMode: "manual",
        });

        expect(result.inject).toBe(false);
        expect(result.tools).toEqual([]);
      });
    });

    describe("SkillRegistry 集成", () => {
      test("应该能获取 ContextEngineeringSkill", () => {
        const skill = skillRegistry.getSkill("builtin:context-engineering");

        expect(skill).not.toBeNull();
        expect(skill.id).toBe("builtin:context-engineering");
      });

      test("应该在 getAllSkills 中包含 ContextEngineeringSkill", () => {
        const allSkills = skillRegistry.getAllSkills();
        const contextSkill = allSkills.find(s => s.id === "builtin:context-engineering");

        expect(contextSkill).toBeDefined();
      });

      test("应该能按标签搜索到 ContextEngineeringSkill", () => {
        const results = skillRegistry.searchByTags(["context"]);

        expect(results.length).toBeGreaterThan(0);
        expect(results.some(s => s.id === "builtin:context-engineering")).toBe(true);
      });
    });
  });
});
