#!/usr/bin/env python3
"""Extract path from a Claude Code PreToolUse payload."""
import json
import sys


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("tool_name") != "Grep":
        return 0
    path = payload.get("tool_input", {}).get("path", "")
    if path:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
