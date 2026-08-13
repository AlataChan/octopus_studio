from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from . import tools


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="octopus-kb-mcp")
    subparsers = parser.add_subparsers(dest="verb", required=True)

    _add_vault_parser(subparsers, "export-graph")

    retrieve = _add_vault_parser(subparsers, "retrieve-bundle")
    retrieve.add_argument("--query", required=True)
    retrieve.add_argument("--max-tokens", type=int, default=1500)
    retrieve.add_argument("--max-text-chars", type=int, default=4000)

    ingest = _add_vault_parser(subparsers, "ingest")
    ingest.add_argument("--markdown", required=True)
    ingest.add_argument("--title")
    ingest.add_argument("--tags", default="")

    write_page = _add_vault_parser(subparsers, "write-page")
    write_page.add_argument("--page-json", required=True)

    neighbors = _add_vault_parser(subparsers, "neighbors")
    neighbors.add_argument("--page", required=True)

    lookup = _add_vault_parser(subparsers, "lookup")
    lookup.add_argument("--term", required=True)

    propose = _add_vault_parser(subparsers, "propose")
    propose.add_argument("--raw-path", required=True)

    validate = _add_vault_parser(subparsers, "validate")
    validate.add_argument("--proposal-path", required=True)
    validate.add_argument("--apply", action="store_true")

    try:
        payload = _dispatch(parser.parse_args(argv))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1

    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return 0


def _add_vault_parser(subparsers: argparse._SubParsersAction, name: str) -> argparse.ArgumentParser:
    parser = subparsers.add_parser(name)
    parser.add_argument("--vault", required=True)
    return parser


def _dispatch(args: argparse.Namespace) -> dict[str, Any]:
    vault = Path(args.vault)
    if args.verb == "export-graph":
        return tools.export_graph(vault)
    if args.verb == "retrieve-bundle":
        return tools.retrieve_bundle(
            vault,
            args.query,
            max_tokens=args.max_tokens,
            max_text_chars=args.max_text_chars,
        )
    if args.verb == "ingest":
        tags = [tag for tag in args.tags.split(",") if tag]
        return tools.ingest(vault, args.markdown, title=args.title, tags=tags)
    if args.verb == "write-page":
        raw = sys.stdin.read() if args.page_json == "-" else args.page_json
        return tools.write_page(vault, json.loads(raw))
    if args.verb == "neighbors":
        return tools.neighbors(vault, args.page)
    if args.verb == "lookup":
        return tools.lookup(vault, args.term)
    if args.verb == "propose":
        return tools.propose(vault, args.raw_path)
    if args.verb == "validate":
        return tools.validate(vault, args.proposal_path, apply=args.apply)
    raise ValueError(f"Unknown verb: {args.verb}")


if __name__ == "__main__":
    raise SystemExit(main())
