# Assistant Template — Source of Truth Decision

> Date: 2026-04-07  
> Status: **decided**  
> Scope: all code related to `assistant_templates`

## Decision

**The database is the single source of truth at runtime. Markdown files are only import inputs.**

```
markdown (import input)
     │
     │  one-time import script
     ↓
DB: assistant_templates (runtime source of truth)
     │
     │  prisma.findMany / findUnique
     ↓
API: /api/assistant-library/templates
     │
     ↓
Frontend: AssistantLibrary page
```

## Why

1. **The current implementation is already DB-driven**:
   - `server/models/assistantTemplate.js:115` uses `prisma.assistant_templates.findUnique`
   - `server/endpoints/assistantLibrary.js:198` directly returns the DB model
   - `server/prisma/schema.prisma` already has a complete `model assistant_templates`
2. **The DB supports rich fields**: AI employee fields such as `employeeName` / `employeeTitle` / `employeeBio` / `skills` / `avatarUrl` already exist in the schema, and these fields cannot be simply derived from markdown frontmatter
3. **The DB already reserves import metadata fields**:
   - `sourceType` — allowed values: `"builtin" | "markdown" | "remote"`
   - `originPath` — relative path of the source markdown
   - `contentHash` — SHA-256, used for change detection
   - `version` — semantic version
   - `pluginType` — `"agent" | "command" | "skill"`
4. **Performance**: DB queries have indexes; recursive filesystem scans do not
5. **Transactional consistency**: operations such as install, uninstall, and rename all require ACID guarantees
6. **Consistency**: all fields for one agent (including user-defined overrides) live in one place

## Non-Goals

- ❌ Do not make `AssistantTemplate.list()` scan the `docs/assistant-templates/` filesystem
- ❌ Do not promote `docs/assistant-templates/` to a runtime path
- ❌ Do not let the frontend read markdown files directly
- ❌ Do not use filesystem directories as the runtime data source for division/category classification (use the `category` field)
- ❌ Do not parse frontmatter at runtime (parse it once during import)

## Import Flow Definition

1. **Input**: markdown files (from the `agency-agents` git repository, or future user uploads)
2. **Processing**:
   - Parse frontmatter (YAML)
   - Parse body (markdown)
   - LLM-translates name (name field only)
   - Tool mapping (advisory)
   - Fallback synthesis (`employeeName` / `employeeTitle` / `skills`, etc.)
   - Compute contentHash
3. **Output**: `prisma.assistant_templates.upsert`, deduplicated by `originPath`
4. **Timing**:
   - Run manually during development: `node scripts/import-agency-agents/index.js`
   - Run automatically in CI as part of the build step
   - **Do not run automatically at runtime**

## Role of Markdown Files

- The `docs/assistant-templates/` directory is **only a content source for developer editing / review**
- It is **not** a runtime data source
- It can be version-controlled with git
- During review, markdown can be compared with DB rows to detect drift

## Future Extensions (not part of this implementation)

- User uploads markdown → review → import into DB (community marketplace, M2)
- Fetch markdown from remote URLs → import (`sourceType = "remote"`)
- Automatically trigger re-import after markdown changes (watcher or CI hook)

## Contract (constraints for all subsequent code)

1. Any new agent-related code **must** read data through `prisma.assistant_templates`
2. Any importer **must** write through `AssistantTemplate.upsertByOriginPath()` to guarantee idempotency
3. Any UI component **must** consume the template object returned by the API and must not read files directly
4. New fields **must** be added to the schema + migration before being used in code

## Verification

- `grep -r "readFileSync.*assistant-templates" server/` should return 0 results or importer scripts only
- `grep -r "readdirSync.*assistant-templates" server/` should return 0 results or importer scripts only
