import json
from pathlib import Path

from octopus_kb_compound.export import export_graph_artifacts


def _write_page(vault: Path, rel: str, frontmatter_lines: list[str], body: str = "") -> None:
    path = vault / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    content = "---\n" + "\n".join(frontmatter_lines) + "\n---\n" + body
    path.write_text(content, encoding="utf-8")


def test_export_graph_artifacts_emits_nodes_and_edges(tmp_path: Path):
    repo_root = Path(__file__).resolve().parents[1]
    out_dir = tmp_path / "export"

    export_graph_artifacts(repo_root / "examples" / "minimal-vault", out_dir)

    nodes = json.loads((out_dir / "nodes.json").read_text(encoding="utf-8"))
    edges = json.loads((out_dir / "edges.json").read_text(encoding="utf-8"))

    assert (out_dir / "manifest.json").exists()
    assert (out_dir / "aliases.json").exists()
    assert any(node["id"] == "page:wiki/concepts/RAG and Knowledge Augmentation.md" for node in nodes)
    assert all({"id", "title", "type", "role", "layer", "aliases"} <= set(node) for node in nodes)
    assert any(edge["relation_type"] == "wikilink" for edge in edges)
    assert all({"source", "target", "relation_type"} <= set(edge) for edge in edges)


def test_export_nodes_dedupe_alias_nodes(tmp_path):
    vault = tmp_path / "vault"
    _write_page(
        vault,
        "wiki/a.md",
        [
            'title: "A"',
            "type: concept",
            "lang: en",
            "role: concept",
            "layer: wiki",
            "aliases:",
            '  - "Shared"',
            "tags: []",
        ],
    )
    _write_page(
        vault,
        "wiki/b.md",
        [
            'title: "B"',
            "type: concept",
            "lang: en",
            "role: concept",
            "layer: wiki",
            "aliases:",
            '  - "Shared"',
            "tags: []",
        ],
    )
    out = tmp_path / "out"
    export_graph_artifacts(vault, out)

    nodes = json.loads((out / "nodes.json").read_text())
    alias_ids = [n["id"] for n in nodes if n["type"] == "alias"]
    assert len(alias_ids) == len(set(alias_ids)), "alias nodes must be unique by id"

    edges = json.loads((out / "edges.json").read_text())
    shared_targets = {e["target"] for e in edges if e["source"] == "alias:shared" and e["relation_type"] == "alias"}
    assert shared_targets == {"page:wiki/a.md", "page:wiki/b.md"}, (
        "shared alias nodes must still connect to every declaring page"
    )


def test_export_edges_include_related_entities(tmp_path):
    vault = tmp_path / "vault"
    _write_page(
        vault,
        "wiki/concept.md",
        [
            'title: "Concept"',
            "type: concept",
            "lang: en",
            "role: concept",
            "layer: wiki",
            "related_entities:",
            '  - "Entity"',
            "tags: []",
        ],
    )
    _write_page(
        vault,
        "wiki/entity.md",
        [
            'title: "Entity"',
            "type: entity",
            "lang: en",
            "role: entity",
            "layer: wiki",
            "tags: []",
        ],
    )
    out = tmp_path / "out"
    export_graph_artifacts(vault, out)
    edges = json.loads((out / "edges.json").read_text())
    assert any(
        e["source"] == "page:wiki/concept.md"
        and e["target"] == "page:wiki/entity.md"
        and e["relation_type"] == "wikilink"
        for e in edges
    )


def test_export_edges_include_supersedes_and_refines_frontmatter_links(tmp_path):
    vault = tmp_path / "vault"
    _write_page(
        vault,
        "wiki/current.md",
        [
            'title: "Current Decision"',
            "type: note",
            "lang: en",
            "role: note",
            "layer: wiki",
            'summary: "Current summary"',
            'supersedes: "[[Old Decision]]"',
            'refines: "[[Open Question]]"',
            "tags: []",
        ],
    )
    _write_page(
        vault,
        "wiki/old.md",
        [
            'title: "Old Decision"',
            "type: note",
            "lang: en",
            "role: note",
            "layer: wiki",
            'summary: "Old summary"',
            "tags: []",
        ],
    )
    _write_page(
        vault,
        "wiki/question.md",
        [
            'title: "Open Question"',
            "type: note",
            "lang: en",
            "role: note",
            "layer: wiki",
            'summary: "Question summary"',
            "tags: []",
        ],
    )
    out = tmp_path / "out"
    export_graph_artifacts(vault, out)
    edges = json.loads((out / "edges.json").read_text())

    assert {
        "source": "page:wiki/current.md",
        "target": "page:wiki/old.md",
        "relation_type": "supersedes",
    } in edges
    assert {
        "source": "page:wiki/current.md",
        "target": "page:wiki/question.md",
        "relation_type": "refines",
    } in edges


def test_export_is_directory_atomic_when_commit_fails(tmp_path, monkeypatch):
    vault = tmp_path / "vault"
    _write_page(
        vault,
        "wiki/a.md",
        ['title: "A"', "type: concept", "lang: en", "role: concept", "layer: wiki", "tags: []"],
    )
    out = tmp_path / "out"
    out.mkdir()
    (out / "nodes.json").write_text('"previous_nodes"', encoding="utf-8")
    (out / "edges.json").write_text('"previous_edges"', encoding="utf-8")

    import octopus_kb_compound.export as export_module
    real_commit = export_module._commit_artifact
    calls = {"count": 0}

    def failing(src, dst):
        calls["count"] += 1
        if calls["count"] == 2:
            raise OSError("simulated commit failure")
        real_commit(src, dst)

    monkeypatch.setattr(export_module, "_commit_artifact", failing)

    try:
        export_graph_artifacts(vault, out)
    except OSError:
        pass

    assert (out / "nodes.json").read_text() == '"previous_nodes"', "nodes.json must be restored"
    assert (out / "edges.json").read_text() == '"previous_edges"', "edges.json must be restored"
    assert not (out / "manifest.json").exists(), "manifest.json did not exist before, must be absent after rollback"
    assert not (out / "aliases.json").exists(), "aliases.json did not exist before, must be absent after rollback"
