---
name: Knowledge Base (octopus-kb)
description: Use octopus-kb for structured knowledge graph retrieval, evidence bundles, curated vault lookup, and knowledge curation through MCP tools.
version: 1.0.0
author: Alata Studio
category: search
tags:
  - knowledge
  - graphrag
  - mcp
  - octopus-kb
icon: 🧠
tools: []
mcpServers:
  - serverName: octopus-kb
configSchema:
  version: "1.0"
  fields:
    - key: enabled
      label: Enable octopus-kb
      type: boolean
      description: Whether to enable the local octopus-kb MCP knowledge base tools.
      defaultValue: false
    - key: vaultRoot
      label: Vault Root Directory
      type: string
      description: Local root directory of the octopus-kb workspace vault.
      defaultValue: ""
---

# Knowledge Base (octopus-kb)

Use octopus-kb MCP tools when the task benefits from structured knowledge retrieval, graph lookup, or curated evidence bundles.

Prefer `kb_retrieve_bundle` for grounded answers and `kb_lookup` / `kb_neighbors` for entity and concept exploration.

Treat `kb_ingest`, `kb_propose`, and `kb_validate` as knowledge curation actions and explain changes before applying them.
