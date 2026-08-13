---
name: Analyze Code Complexity
description: Analyze complexity metrics for code files or directories and generate a visual report
version: 1.0.0
author: Alata Studio
category: development
tags:
  - complexity
  - metrics
  - analysis
icon: 📊
tools:
  - code-analysis
permissionMode: default
allowedTools:
  - read-file
  - list-dir
autoApprovedTools:
  - read-file
  - list-dir
flowDefinition:
  name: Code Complexity Analysis
  description: Multi-step code complexity analysis
  steps:
    - id: scan
      type: tool
      roleName: scanner
      description: Scan target files
      config:
        toolName: list-dir
    - id: analyze
      type: llm
      roleName: analyzer
      description: Analyze complexity metrics
      config:
        systemPrompt: You are a code complexity analysis expert
    - id: report
      type: llm
      roleName: reporter
      description: Generate analysis report
      config:
        systemPrompt: Organize analysis results into a clear report
---

# Analyze Code Complexity

This command analyzes complexity metrics for the specified code.

## Usage

```
/analyze-complexity [path]
```

## Analysis Dimensions

1. **Cyclomatic Complexity**
   - Measures the number of independent paths in the code
   - 1-10: simple, 11-20: moderate, 21-50: complex, >50: very complex

2. **Cognitive Complexity**
   - Measures how difficult the code is to understand
   - Considers nesting depth and control flow interruptions

3. **Lines of Code**
   - Total lines, effective lines, and comment lines
   - Average function/method length

4. **Dependency Complexity**
   - Dependencies between modules
   - Circular dependency detection

## Output Example

```
┌─────────────────────────────────────────────┐
│           Code Complexity Analysis Report     │
├─────────────────────────────────────────────┤
│ File: src/utils/helper.js                    │
│ Cyclomatic complexity: 15 (moderate)         │
│ Cognitive complexity: 12                     │
│ Total lines: 245                             │
│ Function count: 12                           │
│ Average function length: 18 lines            │
└─────────────────────────────────────────────┘

Recommendations:
- Consider splitting the processData() function; current complexity is 25
- handleError() is nested too deeply; consider extracting helper functions
```
