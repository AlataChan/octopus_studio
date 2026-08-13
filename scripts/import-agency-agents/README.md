# Agency-Agents Importer

One-shot importer for curated `agency-agents` markdown files into the
`assistant_templates` database table.

## Source of truth

- Markdown is import input only.
- Database rows remain the runtime source of truth.
- Writes must go through `AssistantTemplate.upsertByOriginPath()`.

## Files

- `index.js`: CLI entrypoint
- `whitelist.json`: curation rules
- `tool-mapping.json`: advisory tool extraction rules
- `translate-name.js`: cached name translation helper
- `parse-markdown.js`: frontmatter + body parser
- `extract-skills.js`: markdown heading to skills extraction
- `render-safe.js`: minimum render-safe fallback and validation
- `wave1.json`: first release cohort

## Usage

From the repo root:

```bash
node scripts/import-agency-agents/index.js --dry-run
node scripts/import-agency-agents/index.js --division=engineering
node scripts/import-agency-agents/index.js --file=engineering/engineering-backend-architect.md
node scripts/import-agency-agents/index.js --wave=1
node scripts/import-agency-agents/index.js --force-update --wave=1
```

## Notes

- `--dry-run` parses and validates without writing to the database.
- `--force-update` converts unchanged rows from `skip` to `update` using the
  model layer, without touching Prisma directly in the script.
- Translation cache is stored in `.translation-cache.json` and is intentionally
  ignored by Git.
- The upstream clone is kept in `.tmp-agency-agents/` under this directory.
