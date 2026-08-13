from __future__ import annotations


def test_canonical_page_separates_domain_ref_from_storage_ref():
    from octopus_kb_compound.ckr.models import CanonicalPage, CanonicalRef, StorageRef

    ref = CanonicalRef(id="ragoperations", kind="concept", title="RAG Operations")
    storage = StorageRef(adapter="obsidian", locator="wiki/concepts/RAG Operations.md")
    page = CanonicalPage(
        ref=ref,
        title="RAG Operations",
        kind="concept",
        language="en",
        body="# RAG Operations\n\nSee [[Vector Store]].",
        body_format="markdown",
        aliases=["knowledge base operations", "RAG ops"],
        related_refs=[CanonicalRef(id="vectorstore", kind="entity", title="Vector Store")],
        storage=storage,
        metadata={
            "title": "RAG Operations",
            "type": "concept",
            "lang": "en",
            "role": "concept",
            "custom_user_field": "preserved",
        },
    )

    assert page.ref.id == "ragoperations"
    assert page.storage == storage
    assert page.metadata["custom_user_field"] == "preserved"

    restored = CanonicalPage.from_dict(page.to_dict())
    assert restored == page


def test_source_span_round_trips_as_plain_data():
    from octopus_kb_compound.ckr.models import SourceSpan

    span = SourceSpan(path="raw/rag-source.md", start_line=3, end_line=9)

    assert SourceSpan.from_dict(span.to_dict()) == span

