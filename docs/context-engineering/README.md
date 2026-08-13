# Context Engineering 文档库

> Alata Studio 上下文工程能力的技术文档与最佳实践指南

## 概述

Context Engineering（上下文工程）是一套系统化管理 LLM 注意力预算的技术框架。本文档库提供了 Alata Studio 实现上下文工程的完整指南。

## 核心概念

### 四桶策略 (Four-Bucket Framework)

| 策略 | 含义 | 实现模块 |
|------|------|---------|
| **Write** | 保存上下文到外部 | WorkingMemory, RAG Memory, Knowledge Graph |
| **Select** | 拉取相关上下文 | Hybrid Retrieval, Graph Context, Memory Search |
| **Compress** | 压缩 token 保留信息 | Anchored Summarization, Observation Masking |
| **Isolate** | 跨 Agent 隔离上下文 | Subflow, State Schemas, Tool Permission Gateway |

## 文档结构

```
docs/context-engineering/
├── README.md                    # 本文档
├── anchored-summarization.md    # 锚定摘要指南
├── observation-masking.md       # 工具结果压缩指南
├── tool-description-standards.md # 工具描述规范
├── context-engineering-skill.md # Context Engineering Skill 使用指南
└── api-reference.md             # API 参考
```

## 快速开始

### 1. 锚定摘要

锚定摘要确保关键信息在长对话中不丢失：

```javascript
const { WorkingMemory } = require("./server/utils/memory/workingMemory");

// 获取统一的锚定上下文
const ctx = WorkingMemory.getWorkingContext(thread);
console.log(ctx.session_intent);  // 会话意图
console.log(ctx.decisions);       // 关键决策
console.log(ctx.tasks);           // 待办任务
```

### 2. 工具结果压缩

减少大型工具输出对上下文的占用：

```javascript
const { compressToolResult } = require("./server/utils/agents/aibitat/observationMasking");

const { compressed, stats } = compressToolResult("sql-agent", largeResult);
console.log(`压缩率: ${stats.compressionRatio}`);
```

### 3. 渐进式工具披露

根据对话上下文动态注入工具：

```javascript
const { selectToolsForContext } = require("./server/utils/agents/aibitat/toolDescriptionStandards");

const tools = selectToolsForContext({
  availableTools: ["memory", "sql-agent", "web-browsing"],
  conversationLength: 8,  // 超过 5 轮自动注入上下文工具
  userIntent: "分析数据库数据",
});
```

## 相关模块

| 模块 | 位置 | 功能 |
|------|------|------|
| WorkingMemory | `server/utils/memory/workingMemory.js` | 工作记忆管理 |
| ConversationSummarizer | `server/utils/memory/conversationSummarizer.js` | 对话摘要生成 |
| ObservationMasking | `server/utils/agents/aibitat/observationMasking.js` | 工具结果压缩 |
| ToolDescriptionStandards | `server/utils/agents/aibitat/toolDescriptionStandards.js` | 工具描述规范 |
| ContextEngineeringSkill | `server/utils/skills/builtin/ContextEngineeringSkill.js` | 上下文工程 Skill |
| ContextEnhancer | `server/utils/chats/contextEnhancer.js` | 统一上下文增强 |

## 版本历史

- **v1.0** (2026-01-01): 初始版本
  - 锚定摘要对齐（Schema v1.0）
  - 工具结果压缩（Observation Masking）
  - 工具描述规范化（四层架构）
  - Context Engineering Skill

## 参考资料

- [Context Engineering 策略方案](../CONTEXT_ENGINEERING_STRATEGY.md)
- [Agent-Skills-for-Context-Engineering](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering)
