from __future__ import annotations

import argparse
from pathlib import Path


DEFAULT_EXCLUDES = [
    ".claude/**",
    ".cursor/**",
    ".mypy_cache/**",
    ".obsidian/**",
    ".workbuddy/**",
    "docs/**",
    "output/**",
    "octopus-kb/**",
    "copilot/**",
    "Excalidraw/**",
    "meta/**",
]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bootstrap an existing markdown vault for octopus-kb.")
    parser.add_argument("vault_root", type=Path)
    parser.add_argument("--schema", default="wiki/LLM_wiki.md")
    parser.add_argument("--index", default="wiki/INDEX.md")
    args = parser.parse_args(argv)

    root = args.vault_root
    root.mkdir(parents=True, exist_ok=True)
    (root / "wiki").mkdir(parents=True, exist_ok=True)

    _write_if_missing(root / "AGENTS.md", _agents_text(args.schema, args.index))
    _write_if_missing(root / ".octopus-kb.yml", _profile_text())
    _write_if_missing(root / "wiki" / "LOG.md", _log_text())
    return 0


def _write_if_missing(path: Path, text: str) -> None:
    if path.exists():
        return
    path.write_text(text, encoding="utf-8")


def _agents_text(schema: str, index: str) -> str:
    return "\n".join(
        [
            "---",
            'title: "AGENTS"',
            "type: meta",
            "lang: en",
            "role: schema",
            "layer: system",
            "tags:",
            "  - AI/Wiki",
            "summary: |",
            "  Operational entry point for retrieval and maintenance in this vault.",
            "---",
            "",
            "# AGENTS",
            "",
            f"- Read `{schema}` first.",
            f"- Read `{index}` second.",
            "- For questions: schema -> index -> concept/topic/entity pages -> raw sources.",
            "- For maintenance: update frontmatter, links, index, and log together.",
            "- Do not rewrite raw sources beyond frontmatter normalization unless explicitly requested.",
            "- Respect `.octopus-kb.yml` when scanning the vault.",
            "",
        ]
    )


def _profile_text() -> str:
    lines = [
        "schema: AGENTS.md",
        "index: wiki/INDEX.md",
        "exclude_globs:",
    ]
    lines.extend(f"  - {pattern}" for pattern in DEFAULT_EXCLUDES)
    lines.append("")
    return "\n".join(lines)


def _log_text() -> str:
    return "\n".join(
        [
            "---",
            'title: "LOG"',
            "type: meta",
            "lang: en",
            "role: log",
            "layer: wiki",
            "tags:",
            "  - AI/Wiki",
            "summary: |",
            "  Append-only log for major ingest, query, and maintenance actions.",
            "---",
            "",
            "# LOG",
            "",
            "- Bootstrap complete.",
            "",
        ]
    )


if __name__ == "__main__":
    raise SystemExit(main())
