from __future__ import annotations

from pathlib import Path

from octopus_kb_compound.frontmatter import parse_document
from octopus_kb_compound.vault import load_page


def test_obsidian_ckr_json_snapshot_round_trip_preserves_fixture_page():
    from octopus_kb_compound.adapters.obsidian.codec import (
        canonical_page_to_markdown,
        page_record_to_canonical,
    )
    from octopus_kb_compound.ckr.json_codec import pages_from_json, pages_to_json

    repo = Path(__file__).resolve().parents[2]
    vault = repo / "examples" / "expanded-vault"
    source = vault / "wiki" / "concepts" / "RAG Operations.md"
    original_record = load_page(source, root=vault)
    original_frontmatter = dict(original_record.frontmatter)
    original_body = original_record.body

    snapshot = pages_to_json([page_record_to_canonical(original_record)])
    restored_pages = pages_from_json(snapshot)
    rendered = canonical_page_to_markdown(restored_pages[0])
    rendered_frontmatter, rendered_body = parse_document(rendered)

    assert snapshot["ckr_version"] == "1"
    assert rendered_frontmatter == original_frontmatter
    assert rendered_frontmatter["aliases"] == original_frontmatter["aliases"]
    assert rendered_body == original_body
    assert "[[Vector Store]]" in rendered_body
    assert "[[Knowledge Graph]]" in rendered_body

