from __future__ import annotations

from octopus_kb_compound.frontmatter import parse_document
from octopus_kb_compound.models import PageRecord


def test_obsidian_codec_preserves_page_record_fields_and_markdown_body():
    from octopus_kb_compound.adapters.obsidian.codec import (
        canonical_page_to_markdown,
        canonical_to_page_record,
        page_record_to_canonical,
    )

    frontmatter = {
        "title": "RAG Operations",
        "type": "concept",
        "lang": "en",
        "role": "concept",
        "layer": "wiki",
        "canonical_name": "RAG Operations",
        "aliases": ["knowledge base operations", "RAG ops"],
        "related_entities": ["Vector Store", "Knowledge Graph"],
        "summary": "Operational discipline for RAG knowledge bases.",
        "custom_user_field": "preserved",
    }
    body = "# RAG Operations\n\nRAG operations connect [[Vector Store]] and [[Knowledge Graph]]."
    record = PageRecord(
        path="wiki/concepts/RAG Operations.md",
        title="RAG Operations",
        body=body,
        frontmatter=frontmatter,
    )

    canonical = page_record_to_canonical(record)

    assert canonical.ref.id == "ragoperations"
    assert canonical.storage.locator == "wiki/concepts/RAG Operations.md"
    assert canonical.aliases == ["knowledge base operations", "RAG ops"]
    assert [ref.title for ref in canonical.related_refs] == ["Vector Store", "Knowledge Graph"]
    assert canonical.metadata["custom_user_field"] == "preserved"

    restored = canonical_to_page_record(canonical)
    assert restored == record

    rendered_frontmatter, rendered_body = parse_document(canonical_page_to_markdown(canonical))
    assert rendered_frontmatter == frontmatter
    assert rendered_body == body

