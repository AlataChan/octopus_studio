from __future__ import annotations

from pathlib import Path

from octopus_kb_mcp import tools
from octopus_kb_compound.frontmatter import parse_document
from octopus_kb_mcp.cli import main
from octopus_kb_mcp.tools import export_graph, ingest, retrieve_bundle, write_page


def _write_page(vault: Path, rel_path: str, frontmatter: list[str], body: str = "") -> None:
    path = vault / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "---\n" + "\n".join(frontmatter) + "\n---\n" + body,
        encoding="utf-8",
    )


def _seed_vault(vault: Path) -> None:
    _write_page(
        vault,
        "wiki/concepts/X.md",
        [
            'title: "X"',
            "type: concept",
            "lang: en",
            "role: concept",
            "layer: wiki",
            "tags: []",
        ],
        "Concept body links to [[Y]].\n",
    )
    _write_page(
        vault,
        "wiki/entities/Y.md",
        [
            'title: "Y"',
            "type: entity",
            "lang: en",
            "role: entity",
            "layer: wiki",
            "tags: []",
        ],
        "Entity body.\n",
    )


def test_export_graph_returns_nodes_and_edges_json(tmp_path: Path):
    vault = tmp_path / "vault"
    _seed_vault(vault)

    graph = export_graph(vault)

    concept = next(node for node in graph["nodes"] if node["title"] == "X")
    assert set(concept) == {"id", "title", "type", "role", "layer", "aliases"}
    assert concept["type"] == "concept"
    assert any(
        edge["source"] == "page:wiki/concepts/X.md"
        and edge["target"] == "page:wiki/entities/Y.md"
        and edge["relation_type"] == "wikilink"
        for edge in graph["edges"]
    )


def test_retrieve_bundle_returns_resolved_text(tmp_path: Path):
    vault = tmp_path / "vault"
    _seed_vault(vault)

    bundle = retrieve_bundle(vault, "X", max_tokens=1000)

    assert bundle["items"]
    assert all(item["text"].strip() for item in bundle["items"])
    assert all(isinstance(item["tokenEstimate"], int) for item in bundle["items"])


def test_archive_glob_excludes_archived_pages_from_graph_and_retrieve(tmp_path: Path):
    vault = tmp_path / "vault"
    (vault / ".octopus-kb.yml").parent.mkdir(parents=True, exist_ok=True)
    (vault / ".octopus-kb.yml").write_text(
        "exclude_globs:\n  - archive/**\n",
        encoding="utf-8",
    )
    _write_page(
        vault,
        "wiki/current.md",
        [
            'title: "Current"',
            "type: note",
            "lang: en",
            "role: note",
            "layer: wiki",
            'summary: "Current summary"',
        ],
        "Current memory body.\n",
    )
    _write_page(
        vault,
        "archive/wiki/memory/old.md",
        [
            'title: "Archived"',
            "type: note",
            "lang: en",
            "role: note",
            "layer: wiki",
            'summary: "Archived summary"',
        ],
        "Archived memory body.\n",
    )

    graph = export_graph(vault)
    assert all("archive/wiki/memory/old.md" not in node["id"] for node in graph["nodes"])

    bundle = retrieve_bundle(vault, "Archived", max_tokens=1000)
    assert all(item["path"] != "archive/wiki/memory/old.md" for item in bundle["items"])


def test_retrieve_bundle_includes_per_item_memory_frontmatter(tmp_path: Path):
    vault = tmp_path / "vault"
    _write_page(
        vault,
        "wiki/memory/thread.md",
        [
            'title: "Decision Memory"',
            "type: note",
            "lang: en",
            "role: note",
            "layer: wiki",
            "kind: decision",
            'created: "2026-06-15T21:30:00+08:00"',
            'summary: "Decision summary"',
            "tags: []",
        ],
        "Memory body mentions retrieval.\n",
    )

    bundle = retrieve_bundle(vault, "retrieval", max_tokens=1000)

    item = next(item for item in bundle["items"] if item["path"] == "wiki/memory/thread.md")
    assert item["kind"] == "decision"
    assert item["created"] == "2026-06-15T21:30:00+08:00"


def test_retrieve_bundle_fallback_matches_note_pages_by_query_tokens(tmp_path: Path):
    vault = tmp_path / "vault"
    _write_page(
        vault,
        "wiki/memory/thread.md",
        [
            'title: "Memory Recall"',
            "type: note",
            "lang: en",
            "role: note",
            "layer: wiki",
            "kind: summary",
            'summary: "Memory summary"',
            "tags: []",
        ],
        "This memory page captures graph decisions.\n",
    )

    bundle = retrieve_bundle(vault, "memory recency retrieval graph", max_tokens=1000)

    assert any(item["path"] == "wiki/memory/thread.md" for item in bundle["items"])


def test_fallback_body_match_returns_empty_for_empty_query(tmp_path: Path):
    vault = tmp_path / "vault"
    _seed_vault(vault)

    assert tools._fallback_body_match_paths(vault, "  ") == []


def test_ingest_writes_raw_page(tmp_path: Path):
    vault = tmp_path / "vault"

    result = ingest(vault, "# hi\n\nhello", title="Hi")

    assert result["path"] == "raw/hi.md"
    assert (vault / "raw" / "hi.md").exists()


def test_write_page_writes_exact_typed_page_and_export_includes_it(tmp_path: Path):
    vault = tmp_path / "vault"

    result = write_page(
        vault,
        {
            "path": "wiki/memory/thread.md",
            "type": "note",
            "role": "note",
            "layer": "wiki",
            "frontmatter": {
                "title": "Decision Memory",
                "lang": "en",
                "kind": "decision",
                "created": "2026-06-15T21:30:00+08:00",
                "summary": "Decision summary",
                "related_entities": ["Entity"],
            },
            "body": "Memory body.\n",
        },
    )

    assert result["path"] == "wiki/memory/thread.md"
    target = vault / "wiki" / "memory" / "thread.md"
    assert target.exists()
    frontmatter, body = parse_document(target.read_text(encoding="utf-8"))
    assert body == "Memory body."
    assert frontmatter["type"] == "note"
    assert frontmatter["role"] == "note"
    assert frontmatter["layer"] == "wiki"
    assert frontmatter["kind"] == "decision"
    assert frontmatter["created"] == "2026-06-15T21:30:00+08:00"

    graph = export_graph(vault)
    assert any(node["id"] == "page:wiki/memory/thread.md" for node in graph["nodes"])


def test_write_page_rejects_path_traversal(tmp_path: Path):
    vault = tmp_path / "vault"

    try:
        write_page(
            vault,
            {
                "path": "../outside.md",
                "type": "note",
                "role": "note",
                "layer": "wiki",
                "frontmatter": {
                    "title": "Unsafe",
                    "lang": "en",
                    "summary": "Unsafe",
                },
                "body": "",
            },
        )
    except ValueError as error:
        assert "inside the vault" in str(error)
    else:
        raise AssertionError("path traversal must be rejected")


def test_write_page_requires_summary_for_wiki_layer(tmp_path: Path):
    vault = tmp_path / "vault"

    try:
        write_page(
            vault,
            {
                "path": "wiki/memory/no-summary.md",
                "type": "note",
                "role": "note",
                "layer": "wiki",
                "frontmatter": {
                    "title": "No Summary",
                    "lang": "en",
                },
                "body": "",
            },
        )
    except ValueError as error:
        assert "summary" in str(error)
    else:
        raise AssertionError("wiki-layer pages must require summary")


def test_cli_write_page_accepts_page_json(tmp_path: Path):
    vault = tmp_path / "vault"
    page = {
        "path": "wiki/memory/cli.md",
        "type": "note",
        "role": "note",
        "layer": "wiki",
        "frontmatter": {
            "title": "CLI Memory",
            "lang": "en",
            "kind": "summary",
            "summary": "CLI summary",
        },
        "body": "CLI body.",
    }

    rc = main(["write-page", "--vault", str(vault), "--page-json", __import__("json").dumps(page)])

    assert rc == 0
    frontmatter, body = parse_document((vault / "wiki" / "memory" / "cli.md").read_text())
    assert frontmatter["kind"] == "summary"
    assert body == "CLI body."


def test_propose_uses_transient_llm_profile_outside_vault(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    raw = vault / "raw" / "hi.md"
    raw.parent.mkdir(parents=True)
    raw.write_text("# hi\n\nhello", encoding="utf-8")
    captured: dict[str, str] = {}

    def fake_propose_from_raw(raw_file: Path, root: Path, *, profile_name: str | None = None):
        config_path = Path(__import__("os").environ["OCTOPUS_KB_CONFIG"])
        captured["config"] = config_path.read_text(encoding="utf-8")
        captured["config_path"] = config_path.as_posix()
        captured["profile_name"] = profile_name or ""
        assert raw_file == raw
        assert root == vault

        class Result:
            def to_dict(self):
                return {"ok": True}

        return Result()

    monkeypatch.setenv("KB_LLM_BASE_URL", "https://api.example/v1")
    monkeypatch.setenv("KB_LLM_API_KEY", "sk-test")
    monkeypatch.setenv("KB_LLM_MODEL", "model-a")
    monkeypatch.setattr(tools, "propose_from_raw", fake_propose_from_raw)

    assert tools.propose(vault, "raw/hi.md") == {"ok": True}

    assert captured["profile_name"] == "alata"
    assert "https://api.example/v1" in captured["config"]
    assert "model-a" in captured["config"]
    assert "api_key_env = \"KB_LLM_API_KEY\"" in captured["config"]
    assert "sk-test" not in captured["config"]
    assert "/.octopus-kb/config.toml" not in captured["config_path"]
    assert not (vault / ".octopus-kb" / "config.toml").exists()
