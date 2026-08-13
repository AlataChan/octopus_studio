# octopus-kb vendor record

The baseline was vendored from `octopus-kb` commit
`d4852698caedbb37f4c370bc339da22a38db1367` on 2026-06-15.

As of the Phase 3 absorption on 2026-08-09, **Studio is the sole active source of truth** for this copy. The standalone repository is archival input only; do not re-sync it wholesale or allow it to overwrite Studio divergences. Future changes are made and tested here.

The machine-readable per-file record is
`docs/consolidation/octopus-kb-provenance.json`. It distinguishes byte-identical
source files, Studio divergences, and Studio-only integration files.

## Studio divergences

- Page frontmatter supports typed memory fields (`kind`, `created`,
  `supersedes`, `refines`) and exports their graph edges.
- `octopus_kb_mcp` exposes typed `write-page`, bounded resolved retrieval text,
  archive exclusion, and Studio's temporary LLM-profile bridge.
- The ten JavaScript modules under `server/utils/octopusKb/` remain
  Studio-native adapters; they are not translations of similarly named Python
  files.
- The two expanded ingest/maintain skill definitions already present in this
  vendor are retained because the vendored suite proves their contract. The
  standalone worktree's additional dirty skill edits are not absorbed.

## Deliberate source exclusions

Repository administration (`.github/`, `.gitignore`), standalone release
history (`CHANGELOG.md`), and editor-local example settings are not runtime,
schema, test, or license inputs and are not part of the active Studio copy.
