# Collector Dependency Provenance

## `@firecrawl/anydoc`

- Package: `@firecrawl/anydoc`
- Repository: https://github.com/firecrawl/anydoc
- Version/tag: `0.1.8` / `v0.1.8`
- Tag commit: `4e3089b1ed43404241a303109f81e2c7933040b2`
- License: MIT
- Purpose: optional local conversion of approved office-like documents to GitHub-Flavored Markdown
- Local modifications: none
- Last reviewed: 2026-08-11
- Packaged license: `collector/THIRD_PARTY_LICENSES/anydoc-MIT.txt`

### Integration boundary

Anydoc is an internal, default-off collector adapter enabled only by
`ANYDOC_ENABLED`. Its fixed allowlist is `.docx`, `.pptx`, `.odt`, `.odp`, and
`.epub`. XLSX retains the legacy per-sheet CSV converter, and PDF retains the
existing parsing and OCR path.

Anydoc owns no Studio, FDE, Prisma, workflow, approval, or durable product
state. Conversion errors or empty output fall back once to the existing
extension-specific converter before any anydoc persistence or trash side
effect. Persistence and trash failures do not trigger fallback.
