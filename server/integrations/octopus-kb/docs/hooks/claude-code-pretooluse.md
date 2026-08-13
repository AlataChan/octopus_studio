# Claude Code PreToolUse Grep Guard

This hook reminds Claude Code to run `octopus-kb retrieve-bundle` before grepping `wiki/` or `raw/` vault content. It is a soft guard: it prints a warning to stderr and exits `0`, so it does not block the tool call.

## Install

1. Copy or reference the sample settings from `examples/.claude/settings.json.sample` into your vault's `.claude/settings.json`.
2. Ensure the hook files are executable:

```bash
chmod +x examples/hooks/kb-grep-guard.sh examples/hooks/kb_pretool_extract.py
```

3. Run retrieval before grepping vault content:

```bash
octopus-kb retrieve-bundle "your task" --vault . --json
```

Successful `retrieve-bundle` CLI runs touch `.octopus-kb/.retrieve-bundle-marker`. The PreToolUse hook checks for that marker before warning on `Grep` paths under `wiki/` or `raw/`.

## Customize

Set `OCTOPUS_KB_MARKER` in the hook environment to use a custom marker path:

```bash
OCTOPUS_KB_MARKER=/tmp/octopus-kb-marker examples/hooks/kb-grep-guard.sh
```

The sample `UserPromptSubmit` hook removes `.octopus-kb/.retrieve-bundle-marker` at the start of each user turn so the guard is per-turn instead of time-based.

## Opt Out

Remove the `PreToolUse` entry from `.claude/settings.json`, or point `OCTOPUS_KB_MARKER` at a file that always exists. The guard is intentionally advisory and never exits non-zero.
