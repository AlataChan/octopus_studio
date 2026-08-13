# Assistant Template Import Contract

> Date: 2026-04-07  
> Status: **v1 — decided**  
> Related: `docs/architecture/assistant-template-source-of-truth.md`  
> Implementation: `scripts/import-agency-agents/` (Phase B)

## Purpose

Define stable markdown → DB row mapping rules to ensure:
1. UI consistency (all imported agents render correctly)
2. Safety (default tool permissions do not expose high-risk capabilities)
3. Idempotency (importing the same content multiple times does not duplicate it)
4. Traceability (every row can be traced back to a source file and commit)

## Input Format

Source markdown file (agency-agents format):

```markdown
---
name: Rapid Prototyper
description: Specialized in ultra-fast MVP creation
color: green
emoji: ⚡
vibe: Turns an idea into a working prototype before the meeting's over.
---

# Rapid Prototyper Agent Personality

You are **Rapid Prototyper**, a specialist in ...

## 🧠 Your Identity & Memory
- Role: ...
- Personality: ...

## 🎯 Your Core Mission
...

## 🚨 Critical Rules
...

## 📋 Technical Deliverables
...
```

## Output: DB Row

Write to the `prisma.assistant_templates` table.

## Field Mapping Table

| DB Field | Source | Required | Fallback | Description |
|---------|------|:---:|----------|------|
| `id` | `uuidv4()` | ✅ | — | Newly generated |
| `name` | LLM translation(frontmatter.name) | ✅ | Original frontmatter.name | Localized name |
| `description` | frontmatter.description | ✅ | `"(no description)"` | Keep English |
| `category` | Source directory name | ✅ | `"uncategorized"` | Example: `engineering` |
| `tags` | frontmatter.tags \|\| [] | — | `[]` | Stored as a JSON string |
| `industry` | null | — | null | |
| `systemPrompt` | Full markdown body | ✅ | — | Preserve original English text |
| `agentFlowId` | null | — | null | Not a flow |
| `internalRoles` | null | — | null | |
| `defaultTools` | Tool-mapping advisory result | — | `[]` | JSON string |
| `defaultMCPServers` | null | — | null | |
| `recommendedModel` | null | — | null | Let the workspace default apply |
| `sourceType` | `"markdown"` | ✅ | — | Fixed value |
| `pluginType` | `"agent"` | ✅ | — | Fixed value |
| `version` | `"1.0.0"` | ✅ | — | Initial import |
| `contentHash` | `sha256(body)` | ✅ | — | Used for change detection |
| `originPath` | Relative path | ✅ | — | Example: `engineering/backend-architect.md` |
| `defaultPermissionMode` | `"default"` | ✅ | — | Least privilege |
| `defaultAllowedTools` | Same as defaultTools | — | `[]` | JSON |
| `defaultAutoApprovedTools` | SAFE_READ tool subset | — | `[]` | JSON |
| `resourceScopes` | null | — | null | |
| `avatarUrl` | null | — | null | Frontend falls back to emoji |
| `employeeName` | Translated name | — | name | Localized |
| `employeeTitle` | `{category}` + `"expert"` | — | `"AI assistant"` | Example: `"Engineering Expert"` |
| `employeeBio` | First 200 characters of description | — | `""` | |
| `skills` | Extracted from body H2/H3 headings | — | `[]` (at least 3 fallback items) | JSON |
| `workExperience` | null | — | null | |
| `certifications` | null | — | null | |
| `platformType` | `"internal"` | ✅ | — | |
| `platformConfig` | null | — | null | |
| `knowledgeModeTemplate` | `"workspace"` | ✅ | — | |
| `isGlobal` | `true` | ✅ | — | Visible to all workspaces |
| `isDefault` | `false` | ✅ | — | Not installed automatically |
| `tenantId` | null | — | null | |
| `sourceUrl` | `https://github.com/.../{originPath}` | ✅ | — | **New field** |
| `sourceLicense` | `"MIT"` | ✅ | — | **New field** |
| `sourceCommit` | Short git hash | ✅ | — | **New field** |
| `vibe` | frontmatter.vibe | — | null | **New field** |
| `color` | frontmatter.color | — | `"#3B82F6"` | **New field** |
| `icon` | frontmatter.emoji | — | `"🤖"` | Reuses existing field |

## Minimum Render-Safe Shape (hard guarantee)

The following fields are the minimum required for the UI to render AssistantCard correctly. **The importer must guarantee that every output satisfies them**:

```json
{
  "name": "non-empty string",
  "employeeName": "non-empty string",
  "employeeTitle": "non-empty string",
  "employeeBio": "string (may be empty)",
  "category": "non-empty string (enum value)",
  "skills": "JSON string with at least 3 elements",
  "icon": "non-empty string (emoji or character)",
  "color": "non-empty string (hex color)",
  "description": "non-empty string"
}
```

**Validation point**: before import, run a render-safe check. If any field fails, fill it with a fallback before writing, or skip it and record the issue in the error log.

## LLM Translation Rules

**Translate only the `name` field**; keep all other fields in their original English.

### Prompt

```
You are a professional translator. Translate the following AI agent role name to natural, concise Chinese. 
Output ONLY the Chinese translation, no explanations, no quotes, no English.

Input: {name}
Output:
```

### Cache

- Cache file: `scripts/import-agency-agents/.translation-cache.json`
- Format: `{ "Rapid Prototyper": "Rapid Prototyper", ... }`
- Do not call the LLM on a cache hit
- Add the cache file to `.gitignore` (do not commit it); CI regenerates it

### Failure Handling

- LLM returns an empty string or times out → fall back to the original text
- LLM returns an invalid translation → use the first valid translated segment or fall back to the original text
- Record the issue in `import-errors.log`

## Tool Mapping Rules (Advisory)

**Principle**: tool mapping is advisory. The importer writes `defaultTools` and `defaultAllowedTools`, but the UI must display them and allow users to adjust them during installation.

### Mapping Table (`tool-mapping.json`)

```json
{
  "web search": ["web-search"],
  "web scraping": ["web-scraping"],
  "web browsing": ["web-browsing"],
  "search the web": ["web-search"],
  "read file": ["read-document-file"],
  "read documents": ["read-document-file"],
  "knowledge base": ["rag-memory"],
  "rag": ["rag-memory"],
  "knowledge graph": ["knowledge-graph"],
  "sql": ["sql-agent"],
  "database query": ["sql-agent"],
  "datetime": ["datetime-info"],
  "current time": ["datetime-info"],
  "memory": ["memory"],
  "save to memory": ["memory"]
}
```

### Capabilities That Must Not Be Granted Automatically

Do **not** automatically grant tools when the following keywords are detected:

- `code execution` / `run code` / `execute code`
- `shell command` / `bash` / `terminal`
- `file write` / `write file` / `create file`
- `delete` / `remove` / `destroy`
- `deploy` / `publish` / `push`
- `email send` / `message send`

Users must manually select these tools during installation.

### `defaultAutoApprovedTools` Rules

Only the following tools may enter the auto-approved list (no secondary confirmation required):

- `web-search`
- `rag-memory`
- `knowledge-graph`
- `datetime-info`
- `read-document-file`
- `memory` (read-only parts)

Any tool that can write data or cause external side effects must **not** enter auto-approved.

## Skills Extraction Rules

Extract the `skills` array from the markdown body:

1. Extract all `##` and `###` section headings
2. Remove emoji and special characters
3. Remove generic sections ("Identity", "Mission", "Rules", "Deliverables", "Communication", etc.)
4. Keep the first 8
5. If fewer than 3 items are extracted, add fallbacks:
   - `"{category} related"`
   - `"Consulting and recommendations"`
   - `"Solution design"`

## Errors and Logs

The importer must output the following report:

```
Import Report:
  Total files:        116
  Imported:           114
  Skipped (no change): 0
  Updated:            2
  Failed:             0

Failed files:
  (none)

Warnings:
  - engineering/foo.md: fallback used for skills (only 1 extracted)
  - marketing/bar.md: LLM translation failed, using English name
```

## Idempotency Rules

1. Upsert by `originPath`
2. If the DB `contentHash` matches the currently computed value → skip, do not update
3. If `contentHash` differs → update the whole row (preserve `id` and `createdAt`)
4. Command-line arguments:
   - `--dry-run`: only output the plan; do not write to the DB
   - `--force-update`: ignore contentHash and force an update
   - `--division=engineering`: process only a specific division
   - `--file=path/to/foo.md`: process only a single file

## Version Compatibility

- All fields added to `schema.prisma` are nullable; old data is unaffected
- After `_formatTemplate()` is extended, optional fields are added to API responses and the frontend can adopt them progressively
- Do not change the semantics of any existing field
