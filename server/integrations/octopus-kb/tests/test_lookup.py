import io
import json
import sys
from pathlib import Path


def _seed_vault(root: Path) -> None:
    (root / "wiki" / "concepts").mkdir(parents=True)
    (root / "wiki" / "concepts" / "RAG Operations.md").write_text(
        '---\ntitle: "RAG Operations"\ntype: concept\nlang: en\n'
        'role: concept\nlayer: wiki\nsource_of_truth: canonical\n'
        'aliases:\n  - "RAG Ops"\ntags: []\nsummary: "Ops wrapper."\n---\n',
        encoding="utf-8",
    )
    (root / "AGENTS.md").write_text("# Schema\n", encoding="utf-8")
    (root / "wiki" / "INDEX.md").write_text("# Index\n", encoding="utf-8")
    (root / "wiki" / "LOG.md").write_text("# Log\n", encoding="utf-8")


def test_cli_lookup_returns_canonical_and_next_commands(tmp_path):
    vault = tmp_path / "vault"
    _seed_vault(vault)

    from octopus_kb_compound.cli import main

    buf = io.StringIO()
    original = sys.stdout
    sys.stdout = buf
    try:
        rc = main(["lookup", "RAG Ops", "--vault", str(vault), "--json"])
    finally:
        sys.stdout = original

    assert rc == 0
    data = json.loads(buf.getvalue())
    assert data["canonical"]["path"] == "wiki/concepts/RAG Operations.md"
    assert data["aliases"][0]["text"] == "RAG Ops"
    assert data["ambiguous"] is False
    assert any("retrieve-bundle" in hint for hint in data["next"])


def test_cli_lookup_reports_ambiguity_when_alias_resolves_to_multiple_pages(tmp_path):
    vault = tmp_path / "vault"
    (vault / "wiki" / "concepts").mkdir(parents=True)
    (vault / "AGENTS.md").write_text("# Schema\n", encoding="utf-8")
    (vault / "wiki" / "INDEX.md").write_text("# Index\n", encoding="utf-8")
    (vault / "wiki" / "LOG.md").write_text("# Log\n", encoding="utf-8")
    (vault / "wiki" / "concepts" / "A.md").write_text(
        '---\ntitle: "A"\ntype: concept\nlang: en\nrole: concept\n'
        'layer: wiki\nsource_of_truth: canonical\n'
        'aliases:\n  - "Shared"\ntags: []\nsummary: "s"\n---\n',
        encoding="utf-8",
    )
    (vault / "wiki" / "concepts" / "B.md").write_text(
        '---\ntitle: "B"\ntype: concept\nlang: en\nrole: concept\n'
        'layer: wiki\nsource_of_truth: canonical\n'
        'aliases:\n  - "Shared"\ntags: []\nsummary: "s"\n---\n',
        encoding="utf-8",
    )

    from octopus_kb_compound.cli import main

    buf = io.StringIO()
    original = sys.stdout
    sys.stdout = buf
    try:
        rc = main(["lookup", "Shared", "--vault", str(vault), "--json"])
    finally:
        sys.stdout = original

    assert rc == 0
    data = json.loads(buf.getvalue())
    assert data["ambiguous"] is True
    assert set(data["collisions"]) == {
        "wiki/concepts/A.md", "wiki/concepts/B.md"
    }
    assert data["canonical"] is None


def test_cli_lookup_returns_null_canonical_for_unknown_term(tmp_path):
    vault = tmp_path / "vault"
    _seed_vault(vault)

    from octopus_kb_compound.cli import main

    buf = io.StringIO()
    original = sys.stdout
    sys.stdout = buf
    try:
        rc = main(["lookup", "nonexistent-term", "--vault", str(vault), "--json"])
    finally:
        sys.stdout = original

    assert rc == 0
    data = json.loads(buf.getvalue())
    assert data["canonical"] is None
    assert data["ambiguous"] is False
    assert any("suggest-links" in hint for hint in data["next"])


def test_lookup_output_matches_schema(tmp_path):
    import jsonschema

    vault = tmp_path / "vault"
    _seed_vault(vault)

    schema_path = Path(__file__).resolve().parent.parent / "schemas" / "cli" / "lookup.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    from octopus_kb_compound.cli import main

    buf = io.StringIO()
    original = sys.stdout
    sys.stdout = buf
    try:
        main(["lookup", "RAG Ops", "--vault", str(vault), "--json"])
    finally:
        sys.stdout = original

    jsonschema.validate(json.loads(buf.getvalue()), schema)
