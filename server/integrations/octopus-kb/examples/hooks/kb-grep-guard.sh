#!/usr/bin/env bash
# kb-grep-guard.sh: Claude Code PreToolUse hook for Grep.
# Stdin: JSON {tool_name, tool_input: {path, ...}} forwarded from Claude Code.
# Env: OCTOPUS_KB_MARKER overrides default marker path (for tests).

set -u
marker="${OCTOPUS_KB_MARKER:-.octopus-kb/.retrieve-bundle-marker}"
here="$(cd "$(dirname "$0")" && pwd)"

# Pipe caller stdin into the helper so json.load(sys.stdin) sees the real payload.
target="$(python3 "$here/kb_pretool_extract.py" || true)"

[ -n "$target" ] || exit 0

case "$target" in
  wiki/*|raw/*)
    if [ ! -e "$marker" ]; then
      echo "octopus-kb: run 'octopus-kb retrieve-bundle \"<task>\" --vault .' before grepping $target" >&2
    fi
    ;;
esac
exit 0
