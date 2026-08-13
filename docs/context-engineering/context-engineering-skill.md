# Context Engineering Skill Usage Guide

## Overview

Context Engineering Skill is a built-in Skill in Alata Studio that provides intelligent context management capabilities, including conversation summaries, working memory, knowledge graphs, and related features.

## Features

| Feature | Description |
|------|------|
| Anchored summaries | Structured conversation summaries that preserve key information |
| Working memory | Manages pending tasks, key decisions, and active topics |
| Knowledge graph | Retrieves related concepts and relationships |
| Conversation history | Views and reviews conversation records |
| Progressive disclosure | Dynamically injects tools based on conversation context |

## Quick Start

### Get the Skill

```javascript
const { skillRegistry } = require("./server/utils/skills/SkillRegistry");

const contextSkill = skillRegistry.getSkill("builtin:context-engineering");
console.log(contextSkill.name); // "Context Engineering"
```

### View Metadata

```javascript
const metadata = contextSkill.getMetadata();
// {
//   id: "builtin:context-engineering",
//   name: "Context Engineering",
//   description: "Provides intelligent context management capabilities...",
//   version: "1.0.0",
//   category: "utility",
//   tags: ["context", "memory", "summary", "knowledge-graph", "working-memory"],
//   icon: "🧠"
// }
```

## Tool Bindings

The Skill provides the following tools:

| Tool | Risk Level | Auto-Approved | Description |
|------|---------|---------|------|
| memory | safe-read | Yes | Retrieves and stores long-term memory |
| summarize-conversation | safe-read | Yes | Generates conversation summaries |
| chat-history | safe-read | Yes | Gets conversation history |
| knowledge-graph | safe-read | Yes | Queries the knowledge graph |
| structured-output | safe-read | Yes | Controls structured output |

### Get Tool Bindings

```javascript
const toolBindings = contextSkill.getToolBindings();

for (const binding of toolBindings) {
  console.log(`${binding.toolName}: ${binding.riskLevel} (autoApproved: ${binding.autoApproved})`);
}
// memory: safe-read (autoApproved: true)
// summarize-conversation: safe-read (autoApproved: true)
// ...
```

## Flow Templates

The Skill provides three predefined Flows:

### 1. Context Summary (/summarize)

Generates an anchored summary of the current conversation.

```javascript
const flowTemplates = contextSkill.getFlowTemplates();
const summaryFlow = flowTemplates.find(f => f.slashCommand === "/summarize");

console.log(summaryFlow.name); // "Context Summary"
console.log(summaryFlow.flowDefinition.steps.length); // 2 steps
```

**Execution steps**:
1. `analyze`: analyze conversation context and extract key information
2. `format`: format the summary output

### 2. Knowledge Retrieval (/knowledge)

Retrieves related information from the knowledge graph.

**Execution steps**:
1. `search`: search the knowledge graph
2. `explain`: explain search results

### 3. Memory Recall (/recall)

Reviews previous conversation records and important information.

**Execution steps**:
1. `search-memory`: search long-term memory
2. `get-history`: get conversation history
3. `synthesize`: synthesize memory information

## Configuration Options

### Configuration Schema

```javascript
const configSchema = contextSkill.getConfigSchema();

// Configuration fields:
// - autoSummarize: whether to generate summaries automatically
// - summaryThreshold: number of conversation turns that triggers summarization
// - enableKnowledgeGraph: whether to enable the knowledge graph
// - memoryRetentionDays: number of days to retain memory
// - progressiveDisclosure: disclosure mode (auto/always/manual)
// - anchoredFields: anchored field selection
```

### Default Configuration

```javascript
const defaultConfig = contextSkill.getDefaultConfig();
// {
//   autoSummarize: true,
//   summaryThreshold: 10,
//   enableKnowledgeGraph: true,
//   memoryRetentionDays: 30,
//   progressiveDisclosure: "auto",
//   anchoredFields: ["session_intent", "key_decisions", "pending_tasks", ...]
// }
```

### Custom Configuration

```javascript
const customConfig = {
  autoSummarize: true,
  summaryThreshold: 5,  // Trigger summaries earlier
  progressiveDisclosure: "always",  // Always inject context tools
};

const validation = contextSkill.validateConfig(customConfig);
if (validation.valid) {
  // Apply configuration
} else {
  console.error("Configuration error:", validation.errors);
}
```

## Progressive Disclosure

### Injection Strategy

```javascript
// Get tool injection configuration
const injection = contextSkill.getContextToolsInjection({
  conversationLength: 8,
  disclosureMode: "auto",
});

if (injection.inject) {
  console.log("Tools to inject:", injection.tools);
  // ["memory", "summarize-conversation", "chat-history", "knowledge-graph"]
}
```

### Disclosure Modes

| Mode | Description |
|------|------|
| auto | Automatically decide based on conversation length (default) |
| always | Always inject all context tools |
| manual | Inject only when the user explicitly requests it |

### Auto Mode Logic

```
Conversation turns <= 5: do not inject context tools
Conversation turns > 5:  inject memory, summarize-conversation, chat-history, knowledge-graph
```

## Integration with Other Systems

### Integration with WorkingMemory

```javascript
const { WorkingMemory } = require("./server/utils/memory/workingMemory");

// The Skill's tools work together with WorkingMemory
// memory tool read/write operations update WorkingMemory's anchored fields
```

### Integration with ConversationSummarizer

```javascript
const { ConversationSummarizer } = require("./server/utils/memory/conversationSummarizer");

// The summarize-conversation tool calls ConversationSummarizer
// Generates anchored summaries and synchronizes them to WorkingMemory
```

### Integration with AIbitat

```javascript
// The Skill's tool bindings can be used directly for AIbitat tool injection
const tools = contextSkill.getToolBindings().map(b => b.toolName);
// Inject into the agent's tool list
```

## Usage Scenarios

### Scenario 1: Long Conversation Management

When a conversation exceeds 10 turns, automatically generate summaries to prevent context loss:

```javascript
// Configuration
{
  autoSummarize: true,
  summaryThreshold: 10,
}

// Effect: automatically updates the anchored summary every 10 conversation turns
```

### Scenario 2: Knowledge-Intensive Tasks

Scenarios that require frequent knowledge graph queries:

```javascript
// Configuration
{
  enableKnowledgeGraph: true,
  progressiveDisclosure: "always",
}

// Effect: the knowledge graph query tool is always available
```

### Scenario 3: Task Tracking

Track pending tasks across conversations:

```javascript
// Use anchored fields
{
  anchoredFields: ["session_intent", "pending_tasks", "key_decisions"],
}

// Effect: each summary extracts and updates task status
```

## Best Practices

1. **Set summary thresholds appropriately**: adjust `summaryThreshold` based on business scenarios
2. **Enable the knowledge graph on demand**: disable it in unnecessary scenarios to save resources
3. **Choose the right disclosure mode**: use `always` for complex tasks and `auto` for simple conversations
4. **Clean up memory regularly**: set a reasonable `memoryRetentionDays` value to avoid data bloat

## Troubleshooting

### Skill Fails to Load

Check SkillRegistry logs:
```
[SkillRegistry] Failed to load ContextEngineeringSkill: ...
```

### Tools Are Not Injected

1. Check the `progressiveDisclosure` configuration
2. Confirm whether the conversation length satisfies the condition
3. Inspect the return value of `getContextToolsInjection`

### Summary Is Not Generated

1. Confirm that `autoSummarize` is `true`
2. Check whether the conversation turn count has reached the threshold
3. Verify that the LLM provider configuration is correct
