---
name: kb-maintain
description: Use when ingesting sources, updating wiki pages, fixing metadata, adding wikilinks, or running health checks on a markdown knowledge base.
---

# KB Maintain

## Overview

Maintain the wiki as a living artifact. Every change should improve structure, evidence quality, and graph navigability at the same time.

> **v0.7+**: Lint is now layered (CKR-level + Obsidian-specific). `apply` is adapter-driven via `ObsidianStore.apply_ops()`. CLI behavior unchanged.

## Core Workflow

1. **Read the schema** before changing pages
2. **Inspect the index** and affected concept pages
3. **Ingest new sources** via `kb-ingest` skill if needed
4. **Plan impacted pages** before editing
5. **Update** frontmatter, summaries, wikilinks, and index/log entries together
6. **Lint** to catch broken links, orphans, and missing metadata

## Planning

When available, use `octopus_kb_compound.planner.plan_maintenance()` or the CLI:

```bash
octopus-kb plan-maintenance <page> --vault .
```

This returns non-mutating follow-up actions. Treat the plan as guidance.

## Maintenance Commands

### Vault Health Check

```bash
# Summary stats: page counts, entry presence, lint summary
octopus-kb vault-summary .

# Strict frontmatter validation (file or directory)
octopus-kb validate-frontmatter <path> --json

# Layered lint: CKR-level + Obsidian-specific (v0.7+)
octopus-kb lint . --json
```

### Link Suggestions

```bash
# Propose canonical wikilinks for an existing page
octopus-kb suggest-links <page> --vault .
```

### Propose Loop (LLM-assisted, adapter-driven in v0.7+)

For complex changes, use the propose loop:

```bash
# 1. Propose
octopus-kb propose raw/<file> --vault . [--profile name] --json

# 2. Validate (dry-run first)
octopus-kb validate .octopus-kb/proposals/<id>.json --vault . --json

# 3. Apply (audit-first + adapter-driven)
octopus-kb validate .octopus-kb/proposals/<id>.json --vault . --apply --json

# 4. Recover if interrupted
octopus-kb recover <proposal_id> --vault .
```

**v1 Supported Ops**: `create_page`, `add_alias`, `append_log`

> **v0.7+**: `apply` calls `ObsidianStore.apply_ops()` after writing the pending audit entry. `WriteReceipt` preserves the existing audit ledger shape (`created`, `modified` StorageRefs).

### Inbox (Human Triage)

```bash
# List deferred proposals
octopus-kb inbox --vault . --list --json

# Review and triage
octopus-kb inbox --vault . --review <id> [--accept | --reject --reason "..."] --json
```

## Migration Commands

```bash
# Read-only migration preview: malformed frontmatter, missing entry files
octopus-kb inspect-vault <vault>

# Staged vault normalization (safe, uses backup+rollback)
octopus-kb normalize-vault <vault> [--apply] [--in-place]
```

## Rules

- Never edit raw-source files beyond frontmatter normalization unless explicitly requested.
- Prefer updating existing concept pages over creating duplicates.
- Add wikilinks only when the target page is canonical and useful.
- Avoid overlinking. A dense graph is not automatically a useful graph.
- If a concept deserves a page but does not exist, create a stub or record the gap explicitly.
- Always lint after bulk changes.

## Maintenance Output

When completing maintenance, report:
- changed pages
- new pages
- new or removed wikilinks
- metadata changes
- lint findings and follow-up actions

## Vault Structure Reference

```
wiki/
├── INDEX.md           # navigation hub - update on new concepts
├── LOG.md             # maintenance trail - append on changes
├── concepts/          # synthesized knowledge pages
├── entities/          # canonical graph nodes
├── comparisons/       # A-vs-B pages
└── timelines/         # chronological pages

raw/                   # immutable evidence (raw sources)

.octopus-kb/
├── config.toml        # LLM provider profiles
├── rules.yaml         # (optional) user validator rules
├── proposals/         # LLM-proposed diffs
├── inbox/             # deferred proposals (human triage)
└── audit/             # applied proposal records
```
