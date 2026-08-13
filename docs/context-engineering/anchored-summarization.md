# 锚定摘要指南 (Anchored Summarization)

## 概述

锚定摘要是一种结构化的对话摘要方法，通过预定义的"锚点字段"确保关键信息在长对话中不丢失。

## 核心概念

### 锚定字段 (Anchored Fields)

| 字段 | 类型 | 说明 |
|------|------|------|
| `session_intent` | string | 用户的核心会话意图 |
| `active_topics` | string[] | 当前讨论的主题 |
| `pending_tasks` | object[] | 待完成的任务列表 |
| `key_decisions` | object[] | 已做出的关键决策 |
| `artifacts_generated` | string[] | 生成的产物（文件、报表等） |
| `schema_version` | string | 数据版本号（当前为 "1.0"） |

### Schema 版本化

所有锚定上下文数据都带有版本号，确保向后兼容：

```javascript
const { SCHEMA_VERSION, DEFAULT_ANCHORED_CONTEXT } = require("./server/utils/memory/workingMemory");

// 当前版本
console.log(SCHEMA_VERSION); // "1.0"

// 默认结构
console.log(DEFAULT_ANCHORED_CONTEXT);
// {
//   schema_version: "1.0",
//   session_intent: null,
//   artifacts_generated: [],
//   active_topics: [],
//   pending_tasks: [],
//   key_decisions: [],
// }
```

## 使用方法

### 1. 获取工作上下文

```javascript
const { WorkingMemory } = require("./server/utils/memory/workingMemory");

// 从 thread 获取结构化上下文
const ctx = WorkingMemory.getWorkingContext(thread);

console.log(ctx.session_intent);       // "帮助用户分析销售数据"
console.log(ctx.topics);               // ["销售分析", "数据可视化"]
console.log(ctx.tasks);                // [{ task: "生成月度报表", status: "pending" }]
console.log(ctx.decisions);            // [{ decision: "使用柱状图", reason: "更直观" }]
console.log(ctx.artifacts_generated);  // ["sales_report.xlsx"]
```

### 2. 格式化上下文输出

```javascript
// 生成人类可读的锚定上下文
const formatted = WorkingMemory.formatWorkingContext(thread);

// 输出示例：
// [会话意图]: 帮助用户分析销售数据
// [当前主题]: 销售分析, 数据可视化
// [待办任务]:
// - 生成月度报表 (待处理)
// [关键决策]:
// - 使用柱状图: 更直观
```

### 3. 更新锚定字段

```javascript
// 更新会话意图
await WorkingMemory.updateSessionIntent(thread, "优化数据库查询性能");

// 添加生成产物
await WorkingMemory.addArtifact(thread, {
  name: "query_optimization_report.pdf",
  type: "document",
  createdAt: new Date().toISOString(),
});

// 添加待办任务
await WorkingMemory.addPendingTask(thread, "review_indexes", {
  task: "检查索引使用情况",
  status: "pending",
  priority: "high",
});

// 记录关键决策
await WorkingMemory.addKeyDecision(thread, {
  decision: "添加复合索引",
  reason: "查询模式分析显示多列查询频繁",
  timestamp: new Date().toISOString(),
});
```

### 4. 统一上下文注入

```javascript
const { getUnifiedAnchoredContext } = require("./server/utils/chats/contextEnhancer");

// 获取统一格式的锚定上下文（用于 system prompt 注入）
const anchoredContext = getUnifiedAnchoredContext(thread);

// 注入到 system prompt
const systemPrompt = `
你是一个智能助手。

## 会话上下文
${anchoredContext}

## 指令
请根据上下文继续对话。
`;
```

## 摘要生成

### 锚定摘要模板

ConversationSummarizer 使用结构化模板生成摘要：

```javascript
const { ConversationSummarizer } = require("./server/utils/memory/conversationSummarizer");

// 生成锚定摘要
const summary = await ConversationSummarizer.generateAnchoredSummary(
  messages,
  llmProvider,
  {
    existingSummary: previousSummary,
    thread: thread,
  }
);

// 返回结构：
// {
//   session_intent: "用户想要...",
//   main_topics: ["话题1", "话题2"],
//   key_decisions: ["决策1", "决策2"],
//   pending_tasks: ["任务1", "任务2"],
//   artifacts: ["产物1"],
//   summary_text: "对话摘要内容..."
// }
```

### 自动摘要触发

摘要在以下条件下自动更新：

1. **对话轮数**：超过 10 轮对话
2. **对话时长**：超过 24 小时
3. **手动触发**：调用 `/summarize` 命令

```javascript
const { shouldInjectSummary } = require("./server/utils/chats/contextEnhancer");

if (shouldInjectSummary(thread)) {
  // 注入摘要到上下文
}
```

## 数据迁移

### 旧版数据兼容

系统自动处理旧版 metadata 的迁移：

```javascript
// 旧版数据（无 schema_version）
const oldMetadata = {
  active_topics: ["old_topic"],
  pending_tasks: [{ task: "old_task" }],
};

// 自动迁移到 v1.0
const migrated = WorkingMemory.migrateToV1(oldMetadata);
// {
//   schema_version: "1.0",
//   session_intent: null,
//   active_topics: ["old_topic"],
//   pending_tasks: [{ task: "old_task" }],
//   key_decisions: [],
//   artifacts_generated: [],
// }
```

## 最佳实践

### 1. 及时更新意图

在对话方向发生显著变化时更新 `session_intent`：

```javascript
// 用户从"查询数据"转向"导出报表"
if (detectIntentChange(newMessage)) {
  await WorkingMemory.updateSessionIntent(thread, extractNewIntent(newMessage));
}
```

### 2. 保持任务状态同步

任务完成后及时标记：

```javascript
await WorkingMemory.updateTaskStatus(thread, taskId, "completed");
```

### 3. 记录重要决策

所有影响后续对话的决策都应记录：

```javascript
await WorkingMemory.addKeyDecision(thread, {
  decision: "使用 PostgreSQL 而非 MySQL",
  reason: "项目需要 JSONB 支持",
  timestamp: new Date().toISOString(),
});
```

### 4. 避免信息过载

- `active_topics` 限制在 5 个以内
- `pending_tasks` 优先显示高优先级
- `key_decisions` 只保留最近 10 个

## 故障排查

### 摘要未生成

1. 检查 LLM provider 是否正确配置
2. 确认对话长度是否达到阈值
3. 查看 `ConversationSummarizer.checkAndUpdateSummary` 日志

### 字段丢失

1. 检查 `schema_version` 是否正确
2. 确认 `parseMetadata` 解析成功
3. 验证 JSON 格式是否有效

### 迁移失败

1. 检查原始 metadata 格式
2. 确认 `migrateToV1` 函数正常执行
3. 查看错误日志定位问题字段
