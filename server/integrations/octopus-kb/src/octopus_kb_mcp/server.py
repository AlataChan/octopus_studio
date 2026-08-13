from __future__ import annotations

import asyncio
import json
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from . import tools


server = Server("octopus-kb")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        _tool("kb_export_graph", "Export the vault graph as nodes and edges.", {"vault": {"type": "string"}}),
        _tool(
            "kb_retrieve_bundle",
            "Retrieve an ordered evidence bundle with resolved text.",
            {
                "vault": {"type": "string"},
                "query": {"type": "string"},
                "max_tokens": {"type": "integer", "default": 1500},
                "max_text_chars": {"type": "integer", "default": 4000},
            },
        ),
        _tool(
            "kb_ingest",
            "Write markdown into the vault raw/ directory.",
            {
                "vault": {"type": "string"},
                "markdown": {"type": "string"},
                "title": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
        ),
        _tool(
            "kb_write_page",
            "Write a typed markdown page at an exact vault-relative path.",
            {"vault": {"type": "string"}, "page": {"type": "object"}},
        ),
        _tool("kb_neighbors", "Return inbound and outbound neighbors for a page.", {"vault": {"type": "string"}, "page": {"type": "string"}}),
        _tool("kb_lookup", "Resolve a term to canonical kb pages.", {"vault": {"type": "string"}, "term": {"type": "string"}}),
        _tool("kb_propose", "Generate a curation proposal from a raw page.", {"vault": {"type": "string"}, "raw_path": {"type": "string"}}),
        _tool(
            "kb_validate",
            "Validate and optionally apply a curation proposal.",
            {"vault": {"type": "string"}, "proposal_path": {"type": "string"}, "apply": {"type": "boolean", "default": False}},
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    result = _call_tool(name, arguments or {})
    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, sort_keys=True))]


def _tool(name: str, description: str, properties: dict[str, Any]) -> Tool:
    return Tool(
        name=name,
        description=description,
        inputSchema={
            "type": "object",
            "properties": properties,
            "required": [key for key, value in properties.items() if "default" not in value],
        },
    )


def _call_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "kb_export_graph":
        return tools.export_graph(args["vault"])
    if name == "kb_retrieve_bundle":
        return tools.retrieve_bundle(
            args["vault"],
            args["query"],
            max_tokens=int(args.get("max_tokens") or 1500),
            max_text_chars=int(args.get("max_text_chars") or 4000),
        )
    if name == "kb_ingest":
        return tools.ingest(args["vault"], args["markdown"], title=args.get("title"), tags=args.get("tags") or [])
    if name == "kb_write_page":
        return tools.write_page(args["vault"], args["page"])
    if name == "kb_neighbors":
        return tools.neighbors(args["vault"], args["page"])
    if name == "kb_lookup":
        return tools.lookup(args["vault"], args["term"])
    if name == "kb_propose":
        return tools.propose(args["vault"], args["raw_path"], profile=args.get("profile"))
    if name == "kb_validate":
        return tools.validate(args["vault"], args["proposal_path"], apply=bool(args.get("apply")), profile=args.get("profile"))
    raise ValueError(f"Unknown tool: {name}")


async def _run() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    main()
