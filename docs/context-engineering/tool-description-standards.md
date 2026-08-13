# 工具描述规范化指南

## 概述

工具描述规范化通过统一的格式和渐进式披露机制，减少工具描述对上下文的占用，同时提高 LLM 对工具的理解和选择准确性。

## 工具分层架构

### 四层架构

| 层级 | 名称 | 说明 | 注入策略 |
|------|------|------|---------|
| Layer 1 | SYSTEM_TOOLS | 系统级工具 | 始终注入 |
| Layer 2 | OUTPUT_TOOLS | 输出级工具 | 始终注入 |
| Layer 3 | CONTEXT_TOOLS | 上下文工具 | 按需注入（对话 > 5 轮） |
| Layer 4 | BUSINESS_TOOLS | 业务工具 | 按配置注入 |

### 层级定义

```javascript
const TOOL_LAYERS = {
  SYSTEM: 1,    // 系统级：解决 LLM 固有限制
  OUTPUT: 2,    // 输出级：通用文档生成能力
  CONTEXT: 3,   // 上下文级：记忆和摘要管理
  BUSINESS: 4,  // 业务级：特定业务功能
};
```

### 各层工具列表

**Layer 1: 系统工具**
```javascript
const SYSTEM_TOOLS = ["datetime-info"];
```

**Layer 2: 输出工具**
```javascript
const OUTPUT_TOOLS = [
  "generate-excel-report",    // Excel 电子表格
  "generate-presentation",    // PowerPoint 演示文稿
  "generate-pdf-document",    // PDF 文档
  "generate-official-document", // Word 公文
  "save-file-to-browser",     // 文件下载
  "create-chart",             // 图表生成
];
```

**Layer 3: 上下文工具**
```javascript
const CONTEXT_TOOLS = [
  "memory",                   // RAG 记忆检索和存储
  "summarize-conversation",   // 对话摘要生成
  "chat-history",             // 对话历史查看
  "knowledge-graph",          // 知识图谱查询
];
```

## 工具元数据规范

### 元数据结构

```javascript
{
  layer: TOOL_LAYERS.SYSTEM,        // 工具层级
  category: "system",               // 分类
  shortDesc: "获取当前日期和时间",   // 短描述（用于列表展示）
  standardDesc: "获取当前的日期、时间和时区信息。当需要知道现在的时间或日期时使用。返回格式化的日期时间字符串。",
  verb: "获取",                     // 动词
  object: "当前日期和时间",          // 对象
  costLevel: "low",                 // Token 消耗等级: low | medium | high
  sideEffects: false,               // 是否有副作用
}
```

### 描述规范

每个工具描述应回答四个问题（WHAT-WHEN-INPUT-OUTPUT）：

```javascript
{
  name: "search-knowledge-base",
  description: `
    WHAT: 在本地知识库中搜索相关文档
    WHEN: 用户询问与已上传文档相关的问题时使用
    INPUT: query - 搜索查询
    OUTPUT: 返回相关文档片段列表
  `,
}
```

### 最佳实践

1. **简洁性**：每段描述 1-2 句
2. **一致性**：使用统一的术语和格式
3. **完整性**：包含必要的使用条件
4. **参数细节**：放在 `parameters` schema 中，不在 description 重复

## 使用方法

### 获取工具描述

```javascript
const { getToolDescription } = require("./server/utils/agents/aibitat/toolDescriptionStandards");

// 短描述
const short = getToolDescription("datetime-info", "short");
// "获取当前日期和时间"

// 标准描述
const standard = getToolDescription("datetime-info", "standard");
// "获取当前的日期、时间和时区信息。当需要知道现在的时间或日期时使用。返回格式化的日期时间字符串。"

// 详细描述
const detailed = getToolDescription("datetime-info", "detailed");
// 包含层级、分类、消耗等级等完整信息
```

### 按层级获取工具

```javascript
const { getToolsByLayer, TOOL_LAYERS } = require("./server/utils/agents/aibitat/toolDescriptionStandards");

// 获取系统工具
const systemTools = getToolsByLayer(TOOL_LAYERS.SYSTEM);
// ["datetime-info"]

// 获取上下文工具
const contextTools = getToolsByLayer(TOOL_LAYERS.CONTEXT);
// ["memory", "summarize-conversation", "chat-history", "knowledge-graph"]
```

### 渐进式工具选择

```javascript
const { selectToolsForContext } = require("./server/utils/agents/aibitat/toolDescriptionStandards");

const selectedTools = selectToolsForContext({
  availableTools: ["memory", "sql-agent", "web-browsing", "chat-history"],
  conversationLength: 8,  // 对话轮数
  recentToolCalls: ["sql-agent"],  // 最近使用的工具
  userIntent: "分析数据库数据",  // 用户意图
});

// 返回: ["datetime-info", "memory", "chat-history", "sql-agent", "web-browsing"]
// - 系统工具始终包含
// - 对话 > 5 轮，上下文工具自动包含
// - 根据意图包含相关业务工具
```

### 生成工具摘要

```javascript
const { generateToolsSummary } = require("./server/utils/agents/aibitat/toolDescriptionStandards");

// 紧凑格式（按分类分组）
const compact = generateToolsSummary(["datetime-info", "memory", "sql-agent"], "compact");
// [system]: 获取当前日期和时间
// [context]: 检索和存储记忆
// [data]: 执行 SQL 查询

// 标准格式
const standard = generateToolsSummary(["datetime-info", "memory"], "standard");
// - datetime-info: 获取当前的日期、时间和时区信息...
// - memory: 从长期记忆中检索相关信息或存储新的重要信息...
```

### 注册自定义工具

```javascript
const { registerToolMetadata, TOOL_LAYERS } = require("./server/utils/agents/aibitat/toolDescriptionStandards");

registerToolMetadata("my-custom-tool", {
  layer: TOOL_LAYERS.BUSINESS,
  category: "custom",
  shortDesc: "执行自定义操作",
  standardDesc: "执行特定的自定义业务操作。当需要处理特殊业务逻辑时使用。",
  verb: "执行",
  object: "自定义操作",
  costLevel: "medium",
  sideEffects: true,
});
```

## 工具属性

### 消耗等级 (costLevel)

| 等级 | 说明 | 示例工具 |
|------|------|---------|
| low | 低 token 消耗，快速响应 | datetime-info, chat-history |
| medium | 中等消耗，需要一定处理 | memory, sql-agent, create-chart |
| high | 高消耗，可能产生大量输出 | web-browsing, web-scraping |

### 副作用标志 (sideEffects)

| 值 | 说明 | 示例 |
|----|------|------|
| false | 只读操作，不修改状态 | datetime-info, chat-history, web-browsing |
| true | 会修改状态或产生持久化影响 | memory (存储), generate-* (生成文件) |

## 集成点

### 插件索引

```javascript
// server/utils/agents/aibitat/plugins/index.js

module.exports = {
  // 工具层级标识
  SYSTEM_TOOLS,   // Layer 1
  OUTPUT_TOOLS,   // Layer 2
  CONTEXT_TOOLS,  // Layer 3

  // 工具导出...
};
```

### AIbitat 工具注入

在 AIbitat 初始化时使用层级进行工具过滤：

```javascript
const { SYSTEM_TOOLS, OUTPUT_TOOLS } = require("./plugins");

// 始终注入的基础工具
const baseTools = [...SYSTEM_TOOLS, ...OUTPUT_TOOLS];

// 根据配置添加业务工具
const agentTools = [...baseTools, ...configuredBusinessTools];
```

## 最佳实践

### 1. 保持描述简洁

```javascript
// Good
standardDesc: "在知识库中搜索文档。当用户询问与上传文档相关的问题时使用。"

// Bad
standardDesc: "这个工具可以帮助你在本地知识库中进行语义搜索，它使用向量相似度算法来找到与用户查询最相关的文档片段，支持多种文档格式包括PDF、Word、Excel等，并且可以配置返回结果的数量和相似度阈值..."
```

### 2. 使用一致的术语

```javascript
// 统一使用"检索"而非"搜索/查找/获取"混用
verb: "检索"
object: "知识库文档"
```

### 3. 明确使用场景

```javascript
// 明确何时使用
standardDesc: "获取当前日期和时间。当需要知道现在的时间或进行时间相关计算时使用。"

// 明确何时不使用
standardDesc: "执行 SQL 查询。仅用于已配置的数据库连接，不支持动态连接。"
```

### 4. 参数细节放在 Schema

```javascript
// description 中不重复参数细节
parameters: {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "搜索查询文本",
    },
    limit: {
      type: "number",
      description: "返回结果数量上限",
      default: 10,
    },
  },
}
```

## 故障排查

### 工具选择不当

1. 检查工具描述是否清晰描述了使用场景
2. 确认层级分配是否合理
3. 查看 `selectToolsForContext` 的过滤逻辑

### 工具未注入

1. 确认工具在正确的层级
2. 检查对话长度是否达到上下文工具注入阈值
3. 验证用户意图关键词匹配

### 描述过长

1. 使用 `getToolDescription("tool", "short")` 获取简短版本
2. 将详细信息移到帮助文档
3. 参数说明放在 schema 中
