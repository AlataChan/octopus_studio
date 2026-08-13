# 工具结果压缩指南 (Observation Masking)

## 概述

Observation Masking 是一种工具结果压缩技术，用于减少大型工具输出对 LLM 上下文窗口的占用。通过智能压缩，可以将工具结果的 token 消耗降低 50-80%。

## 核心原理

### 压缩流程

```
工具执行 → 结果返回 → 阈值检查 → 压缩处理 → 注入上下文
                           ↓
                    < 阈值：原样返回
                    > 阈值：压缩后返回
```

### 压缩策略

1. **JSON 数组截断**：保留前 N 个元素，添加截断标记
2. **字段过滤**：移除冗余字段，保留关键信息
3. **长字符串截断**：超长文本截断并添加说明
4. **工具特定规则**：不同工具使用不同压缩策略

## 配置参数

```javascript
const COMPRESSION_CONFIG = {
  enabled: true,                    // 是否启用压缩
  minCharsToCompress: 500,          // 触发压缩的最小字符数
  maxCompressedChars: 2000,         // 压缩后的最大字符数
  maxArrayItems: 10,                // JSON 数组保留的最大元素数
  maxObjectDepth: 3,                // JSON 对象的最大嵌套深度
  defaultKeepFields: ["id", "name", "title", "value", "status"],
  defaultRemoveFields: ["raw", "html", "content", "body", "data"],
};
```

## 使用方法

### 基本使用

```javascript
const { compressToolResult, COMPRESSION_CONFIG } = require("./server/utils/agents/aibitat/observationMasking");

// 压缩工具结果
const { compressed, stats } = compressToolResult("sql-agent", largeResult);

console.log(compressed);           // 压缩后的结果
console.log(stats.originalLength); // 原始长度
console.log(stats.compressedLength); // 压缩后长度
console.log(stats.compressionRatio); // 压缩比（如 "60.5%"）
console.log(stats.isJson);         // 是否为 JSON
console.log(stats.skipped);        // 是否跳过压缩
```

### 创建压缩中间件

```javascript
const { createCompressionMiddleware } = require("./server/utils/agents/aibitat/observationMasking");

// 创建中间件
const middleware = createCompressionMiddleware({
  enabled: true,
  minCharsToCompress: 1000,  // 自定义阈值
});

// 应用到工具执行链
const compressedResult = middleware("tool-name", rawResult);
```

### Token 估算

```javascript
const { estimateTokens } = require("./server/utils/agents/aibitat/observationMasking");

const tokens = estimateTokens(text);
console.log(`预估 token 数: ${tokens}`);
```

## 工具特定规则

### 内置规则

```javascript
const TOOL_COMPRESSION_RULES = {
  "sql-agent": {
    maxArrayItems: 20,
    keepFields: ["column_name", "data_type", "is_nullable"],
    removeFields: ["raw_result", "execution_plan"],
  },
  "web-search": {
    maxArrayItems: 5,
    keepFields: ["title", "url", "snippet"],
    removeFields: ["raw_html", "cached_page", "full_content"],
  },
  "web-scraping": {
    maxArrayItems: 10,
    keepFields: ["selector", "text", "href"],
    removeFields: ["html", "raw", "styles"],
  },
  "knowledge-graph": {
    maxArrayItems: 15,
    keepFields: ["id", "label", "type", "properties"],
    removeFields: ["embedding", "vector", "raw_data"],
  },
};
```

### 自定义规则

```javascript
const { TOOL_COMPRESSION_RULES } = require("./server/utils/agents/aibitat/observationMasking");

// 添加自定义工具规则
TOOL_COMPRESSION_RULES["custom-tool"] = {
  maxArrayItems: 25,
  keepFields: ["id", "name", "result"],
  removeFields: ["debug", "trace", "metadata"],
};
```

## 压缩示例

### SQL 查询结果

**压缩前** (2000+ tokens):
```json
[
  {"id": 1, "name": "Product A", "price": 99.99, "raw_data": "...", "created_at": "2024-01-01"},
  {"id": 2, "name": "Product B", "price": 149.99, "raw_data": "...", "created_at": "2024-01-02"},
  // ... 100 more items
]
```

**压缩后** (~200 tokens):
```json
[
  {"id": 1, "name": "Product A", "price": 99.99},
  {"id": 2, "name": "Product B", "price": 149.99},
  // ... 8 more items
  {"_truncated": true, "_originalCount": 102, "_message": "结果已截断，显示前 10 条"}
]
```

### 网页抓取结果

**压缩前**:
```json
{
  "title": "Example Page",
  "url": "https://example.com",
  "html": "<html>...</html>",  // 大量 HTML
  "text": "Page content..."
}
```

**压缩后**:
```json
{
  "title": "Example Page",
  "url": "https://example.com",
  "text": "Page content... [truncated after 2000 chars]"
}
```

## 集成点

### AIbitat 工具执行

压缩已集成到 AIbitat 的工具执行流程中：

```javascript
// server/utils/agents/aibitat/index.js

// 异步工具执行后
const { compressed: compressedResult } = COMPRESSION_CONFIG.enabled
  ? compressToolResult(name, result)
  : { compressed: result };

// 同步工具执行后
const { compressed: compressedResult } = COMPRESSION_CONFIG.enabled
  ? compressToolResult(name, result)
  : { compressed: result };
```

### 手动集成

如果需要在其他位置使用：

```javascript
const { compressToolResult } = require("./server/utils/agents/aibitat/observationMasking");

// 在工具结果返回后、注入上下文前调用
function handleToolResult(toolName, result) {
  const { compressed, stats } = compressToolResult(toolName, result);

  if (!stats.skipped) {
    console.log(`[${toolName}] 压缩: ${stats.originalLength} -> ${stats.compressedLength} (${stats.compressionRatio})`);
  }

  return compressed;
}
```

## 性能影响

### 压缩效果统计

| 工具类型 | 平均压缩率 | 处理时间 |
|---------|-----------|---------|
| SQL 查询 | 60-80% | < 10ms |
| 网页抓取 | 70-90% | < 20ms |
| 知识图谱 | 50-70% | < 15ms |
| 文档读取 | 60-85% | < 25ms |

### 注意事项

1. **信息损失**：压缩会丢失部分详细信息，确保保留关键字段
2. **JSON 有效性**：压缩后必须保持 JSON 格式有效
3. **可追溯性**：压缩结果包含原始数据的元信息

## 故障排查

### 压缩后数据无效

```javascript
// 检查压缩结果是否为有效 JSON
try {
  JSON.parse(compressed);
} catch (e) {
  console.error("压缩结果 JSON 解析失败:", e);
  // 回退到原始结果
  return original;
}
```

### 压缩未触发

检查条件：
1. `COMPRESSION_CONFIG.enabled` 是否为 `true`
2. 结果长度是否超过 `minCharsToCompress`
3. 工具名称是否正确传递

### 关键信息丢失

调整工具特定规则的 `keepFields`：

```javascript
TOOL_COMPRESSION_RULES["my-tool"].keepFields.push("important_field");
```

## 最佳实践

1. **定期评估压缩效果**：监控压缩率和信息完整性
2. **按工具调优规则**：不同工具需要保留不同字段
3. **设置合理阈值**：避免过度压缩导致信息丢失
4. **保留审计信息**：在压缩结果中包含原始数据的元信息
