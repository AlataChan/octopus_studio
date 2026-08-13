---
name: kb-ingest
description: Use when acquiring a public URL or local file and converting it into a new raw source page for the knowledge base.
---

# KB Ingest

## Overview

Acquire external content and ingest it into the vault's raw layer as `raw/*.md` evidence pages.

> **Note**: `octopus-kb` v0.7+ provides native `ingest-url` and `ingest-file` commands. Use these when available. Ingest is a pipeline entry point and is unchanged by the v0.7 CKR/adapter refactor.

## Workflow

### Option A: Public URL (preferred)

```bash
octopus-kb ingest-url <url> --vault . [--tags t1,t2] [--lang zh]
```

1. Validates URL is public (rejects localhost/private IPs)
2. Fetches via Jina Reader → converts to markdown
3. Generates standard raw-source frontmatter
4. Creates `raw/<id>.md` without overwriting existing sources

### Option B: Local File

```bash
octopus-kb ingest-file <path> --vault . [--tags t1,t2] [--lang zh]
```

1. Validates file exists and is readable
2. Converts via `markitdown` → markdown
3. Generates standard raw-source frontmatter
4. Creates `raw/<id>.md` without overwriting

### Option C: Manual Ingest (fallback)

If native commands unavailable:

1. Validate that the target is a public `http/https` URL.
2. Fetch markdown through the configured acquisition path.
3. Generate standard raw-source frontmatter with fields:
   - `title`: extracted or fallback
   - `source`: URL or file path
   - `source_type`: url | file
   - `acquired_at`: ISO timestamp
   - `tags`: user-specified or []
4. Write a new file under `raw/` without overwriting an existing source.

## Frontmatter Template

```yaml
---
title: "{{ title }}"
source: "{{ url_or_path }}"
source_type: url | file
acquired_at: "{{ ISO8601_timestamp }}"
tags: []
---
```

## Rules

- Never overwrite an existing raw file.
- Keep provenance in frontmatter, not in ad hoc inline notes.
- Reject localhost and private-network URLs.
- Stop after creating the raw source. Wiki maintenance belongs to `kb-maintain`.

## Output Contract

After successful ingest, return:
- created raw page path
- extracted or fallback title
- provenance fields written
- follow-up note when `kb-maintain` should run next

## Transition to Maintenance

After ingesting, run `kb-maintain` skill to:
1. Read the schema before changing pages
2. Inspect the index and affected concept pages
3. Plan impacted pages before editing
4. Update frontmatter, summaries, wikilinks, and index/log entries
